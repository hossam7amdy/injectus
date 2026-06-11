import { isDisposable } from "./disposable.ts";
import { ModuleCycleError } from "./errors.ts";
import { Injector } from "./injector.ts";
import type { Provider } from "./provider.ts";

/** Definition passed to {@link defineModule}. */
export interface ModuleDef {
  /** Debug label. Appears on the module's chain-link injector and in cycle errors. */
  name?: string;
  /** Modules this one depends on. Composed first; deduped by identity. */
  imports?: Module[];
  /** Hoist this module (and its transitive imports) to the chain base, resolvable everywhere. Must still be imported once, reachable from the composed root. */
  global?: boolean;
  /**
   * Produce this module's providers — once, at compose time, in dependency
   * order, against an `injector` carrying every previously-composed module.
   *
   * Resolve imports via that `injector`, never global `inject()` (invalid across
   * `await`; `setup` may be async). Provide disposables as `useFactory`, not
   * `useValue` — the injector never disposes a `useValue`, so compose rejects it.
   */
  setup?: (injector: Injector) => Provider[] | Promise<Provider[]>;
}

/**
 * An opaque module blueprint produced by {@link defineModule}. Its object
 * identity is its dedup key: importing the same `Module` twice composes it once.
 */
export interface Module {
  readonly name?: string;
  readonly imports: readonly Module[];
  readonly global: boolean;
  readonly setup: (injector: Injector) => Provider[] | Promise<Provider[]>;
}

/**
 * Handle returned by {@link compose}. Resolve through `injector`; tear down via
 * `dispose()` (also `await using`-compatible).
 */
export interface ModuleRef extends AsyncDisposable {
  /** The composed container — the tip of the module chain. */
  readonly injector: Injector;
  /** Dispose every injector compose built, tip-first. Never disposes a supplied `parent`. */
  dispose(): Promise<void>;
}

/**
 * Define a module. The returned object's identity is its dedup key in `imports`.
 *
 * @example
 * const ConfigModule = defineModule({
 *   name: "config",
 *   setup: async () => [{ provide: CONFIG, useValue: await loadConfig() }],
 * });
 */
export function defineModule(def: ModuleDef): Module {
  return {
    name: def.name,
    imports: def.imports ? [...def.imports] : [],
    global: def.global ?? false,
    setup: def.setup ?? (() => []),
  };
}

/**
 * Compose a module graph into a single resolvable container.
 *
 * Walks `imports` depth-first, dedups by module identity, and topologically
 * orders the graph so dependencies compose before dependents. Each module's
 * `setup` runs once, in order, against the chain built so far; its providers
 * become a child injector. The returned {@link ModuleRef} wraps the chain tip.
 *
 * Modules flagged `global` (with their transitive imports) hoist to the chain
 * base, resolvable everywhere.
 *
 * Async work lives only here — the composed container resolves synchronously.
 * If any `setup` rejects, resources opened by earlier modules are rolled back
 * before the error surfaces.
 *
 * @param options.name Names the composed root injector. Ignored when `parent`
 *   is supplied — name that injector at its own creation instead.
 *
 * @example
 * await using app = await compose(AppModule);
 * app.injector.resolve(UserService);
 */
export async function compose(
  root: Module,
  options?: { parent?: Injector; name?: string },
): Promise<ModuleRef> {
  const order = hoistGlobals(topoSort(root));

  const base =
    options?.parent ?? Injector.create({ providers: [], name: options?.name });
  let tip: Injector = base;

  // A supplied parent is excluded — compose never disposes it.
  const links: Injector[] = options?.parent == null ? [base] : [];

  let disposing: Promise<void> | null = null;
  // Idempotent: concurrent or repeat calls share one run.
  const dispose = (): Promise<void> => {
    if (disposing) return disposing;
    disposing = disposeAll(links);
    return disposing;
  };

  try {
    for (const mod of order) {
      const providers = await mod.setup(tip);
      assertDisposablesUseFactory(mod, providers);
      tip = Injector.create({ parent: tip, providers, name: mod.name });
      links.push(tip);
    }
  } catch (error) {
    try {
      await dispose(); // roll back injectors earlier setups opened
    } catch (teardownError) {
      throw new AggregateError(
        [error, teardownError],
        "Module setup failed; rollback also failed.",
      );
    }
    throw error;
  }

  return {
    injector: tip,
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}

/** Dispose `links` tip-first (LIFO), collecting failures: one rethrows as-is, many wrap in `AggregateError`. */
async function disposeAll(links: readonly Injector[]): Promise<void> {
  const errors: unknown[] = [];

  for (let i = links.length - 1; i >= 0; i--) {
    try {
      await links[i]?.dispose();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Dispose errors during module teardown.");
  }
}

/** Reject a disposable `useValue`: the injector never disposes it, so it would leak. Use `useFactory`. */
function assertDisposablesUseFactory(
  mod: Module,
  providers: readonly Provider[],
): void {
  for (const provider of providers) {
    if ("useValue" in provider && isDisposable(provider.useValue)) {
      throw new TypeError(
        `Module "${labelOf(mod)}" provides a disposable as useValue; ` +
          `use useFactory so the injector disposes it.`,
      );
    }
  }
}

/** Post-order DFS over `imports`: dedup by identity, detect cycles, dependencies before dependents. */
function topoSort(root: Module): Module[] {
  const order: Module[] = [];
  const done = new Set<Module>();
  const stack = new Set<Module>();
  const path: string[] = [];

  const visit = (mod: Module): void => {
    if (done.has(mod)) return;
    if (stack.has(mod)) {
      throw new ModuleCycleError([...path, labelOf(mod)]);
    }
    stack.add(mod);
    path.push(labelOf(mod));
    for (const dep of mod.imports) visit(dep);
    path.pop();
    stack.delete(mod);
    done.add(mod);
    order.push(mod);
  };

  visit(root);
  return order;
}

/** Stable-partition `order`: every global module and its transitive imports to the base, the rest on top. */
function hoistGlobals(order: Module[]): Module[] {
  const closure = new Set<Module>();
  const add = (mod: Module): void => {
    if (closure.has(mod)) return;
    closure.add(mod);
    for (const dep of mod.imports) add(dep);
  };
  for (const mod of order) if (mod.global) add(mod);
  if (closure.size === 0) return order; // no globals — order unchanged

  const globals: Module[] = [];
  const rest: Module[] = [];
  for (const mod of order) (closure.has(mod) ? globals : rest).push(mod);
  return [...globals, ...rest];
}

function labelOf(mod: Module): string {
  return mod.name ?? "<anonymous module>";
}
