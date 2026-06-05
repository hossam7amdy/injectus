import { type Binding, CIRCULAR, EMPTY, makeBinding } from "./binding.ts";
import {
  type Injector as ContextInjector,
  getInjectionContext,
  type InjectOptions,
  inject,
  setInjectionContext,
} from "./context.ts";
import { disposerOf, isDisposable } from "./disposable.ts";
import {
  CaptiveDependencyError,
  CircularDependencyError,
  DependencyPathError,
  InjectorDisposedError,
  TokenNotFoundError,
} from "./errors.ts";
import { Lifetime, minLifetime } from "./lifetime.ts";
import type { Provider } from "./provider.ts";
import type { Token } from "./token.ts";

/** Options passed to `Injector.create()`. */
export interface InjectorOptions {
  /** Provider registrations for this injector. */
  providers: Provider[];
  /** Debug label. Defaults to `"root"` for root injectors and `"<parent>.child"` for children. */
  name?: string;
  /** Parent injector. Omit to create a root; supply to create a child. */
  parent?: Injector;
  /** Lifetime applied when a provider omits `lifetime`. @default Lifetime.Singleton */
  defaultLifetime?: Lifetime;
}

/**
 * IoC container. Holds provider bindings, caches instances by lifetime,
 * and disposes tracked instances in reverse construction order on `dispose()`.
 *
 * Root injectors own singletons. Child injectors (via `parent`) own scoped
 * instances and inherit every parent binding. Each injector disposes only what
 * it constructed — parents and children are independent.
 *
 * @example
 * const root  = Injector.create({ providers: [Database] });
 * const child = Injector.create({ providers: [RequestLogger], parent: root });
 * child.resolve(RequestLogger); // gets Database from root
 */
export class Injector implements ContextInjector, AsyncDisposable {
  readonly #bindings: Map<Token, Binding>;
  readonly #disposers: Array<() => void | Promise<void>>;

  /** Parent injector, or `null` for root injectors. */
  readonly parent: Injector | null;
  /** Debug label assigned at creation. Appears in error messages. */
  readonly name: string;

  #disposing: Promise<void> | null;

  /** @internal Prefer `Injector.create()`. */
  constructor(
    providers: Provider[],
    name: string,
    parent: Injector | null,
    defaultLifetime: Lifetime,
  ) {
    if (parent != null) throwIfDisposed(parent);
    this.#bindings = new Map();
    this.#disposers = [];
    this.parent = parent;
    this.name = name;
    this.#disposing = null;

    for (const provider of providers) {
      const token =
        typeof provider === "function" ? provider : provider.provide;
      this.#bindings.set(token, providerToBinding(provider, defaultLifetime));
    }
  }

  /**
   * Create a root injector, or a child injector when `options.parent` is supplied.
   *
   * @example
   * const injector = Injector.create({
   *   providers: [Database, UserService],
   * });
   */
  static create(options: InjectorOptions): Injector {
    const parent = options.parent ?? null;
    const defaultLifetime = options.defaultLifetime ?? Lifetime.Singleton;
    const name = options.name ?? (parent ? `${parent.name}.child` : "root");
    return new Injector(options.providers, name, parent, defaultLifetime);
  }

  /**
   * Resolve a token synchronously.
   *
   * Walks the injector chain, respects lifetimes, and detects captive dependencies.
   * Throws `TokenNotFoundError` unless `{ optional: true }` is passed.
   */
  resolve<T>(token: Token<T>): T;
  resolve<T>(token: Token<T>, options: { optional: true }): T | null;
  resolve<T>(token: Token<T>, options?: InjectOptions): T | null;
  resolve<T>(token: Token<T>, options?: InjectOptions): T | null {
    const found = this.findBinding(token);
    if (!found) {
      if (options?.optional) return null;
      throw new TokenNotFoundError(token, this.name);
    }

    const { binding, injector } = found;
    const prevLifetime = getInjectionContext()?.effectiveLifetime;
    if (
      prevLifetime === Lifetime.Singleton &&
      binding.lifetime === Lifetime.Scoped
    ) {
      throw new CaptiveDependencyError(token);
    }

    const isNotSelf = injector !== this;
    const owner =
      // Singleton caches on owner; factory must run under owner's chain or child shadow poisons parent cache
      isNotSelf && binding.lifetime === Lifetime.Singleton ? injector : this;

    const prevInjectContext = setInjectionContext({
      injector: owner,
      effectiveLifetime: minLifetime(binding.lifetime, prevLifetime),
    });
    try {
      if (isNotSelf && binding.lifetime === Lifetime.Scoped) {
        const scopedBinding = makeBinding(
          binding.factory,
          EMPTY,
          Lifetime.Scoped,
        );
        this.#bindings.set(token, scopedBinding);
        return this.hydrate(token, scopedBinding, options) as T;
      }

      return injector.hydrate(token, binding, options) as T;
    } finally {
      setInjectionContext(prevInjectContext);
    }
  }

  private findBinding(
    token: Token,
  ): { binding: Binding; injector: Injector } | null {
    let s: Injector | null = this;
    while (s !== null) {
      throwIfDisposed(s);
      const b = s.#bindings.get(token);
      if (b !== undefined) {
        return { binding: b, injector: s };
      }
      s = s.parent;
    }
    return null;
  }

  private hydrate(
    token: Token,
    binding: Binding,
    options?: InjectOptions,
  ): unknown {
    if (binding.value === CIRCULAR) {
      throw new CircularDependencyError(token);
    }
    if (binding.value !== EMPTY) {
      return binding.value;
    }
    binding.value = CIRCULAR;

    let instance: unknown;
    try {
      instance = binding.factory!(options);
    } catch (e) {
      binding.value = EMPTY;
      if (e instanceof DependencyPathError) {
        DependencyPathError.prepend(e, token);
      }
      throw e;
    }

    if (binding.lifetime === Lifetime.Transient) {
      binding.value = EMPTY;
    } else {
      binding.value = instance;
      if (isDisposable(instance)) {
        this.#disposers.push(() => disposerOf(instance));
      }
    }

    return instance;
  }

  /**
   * Dispose all tracked instances in reverse construction order (LIFO), sequentially.
   * Idempotent — concurrent calls share one run.
   * On failure: a single error is rethrown as-is; multiple are wrapped in `AggregateError`.
   */
  dispose(): Promise<void> {
    if (this.#disposing) return this.#disposing;
    this.#disposing = (async () => {
      const errors: unknown[] = [];

      // LIFO so consumers dispose before their deps.
      for (let i = this.#disposers.length - 1; i >= 0; i--) {
        try {
          await this.#disposers[i]!();
        } catch (e) {
          errors.push(e);
        }
      }

      this.#disposers.length = 0;
      this.#bindings.clear();

      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          `Dispose errors in injector "${this.name}"`,
        );
      }
    })();
    return this.#disposing;
  }

  /** Alias for `dispose()` — enables `await using injector = Injector.create(...)`. */
  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose();
  }

  /** `true` after `dispose()` has been called, even if disposal threw. */
  get disposed(): boolean {
    return this.#disposing !== null;
  }
}

function providerToBinding<T>(
  provider: Provider<T>,
  defaultLifetime: Lifetime,
): Binding<T> {
  let binding: Binding<T> | undefined;
  if (typeof provider === "function")
    binding = makeBinding(
      () => new provider(), // class provider shorthand
      EMPTY,
      defaultLifetime,
    );
  else if ("useValue" in provider)
    binding = makeBinding(
      undefined, // hydrated immediately
      provider.useValue,
      Lifetime.Singleton,
    );
  else if (
    "useFactory" in provider &&
    typeof provider.useFactory === "function"
  )
    binding = makeBinding(
      provider.useFactory,
      EMPTY,
      provider.lifetime ?? defaultLifetime,
    );
  else if ("useClass" in provider && typeof provider.useClass === "function")
    binding = makeBinding(
      () => new provider.useClass(),
      EMPTY,
      provider.lifetime ?? defaultLifetime,
    );
  else if ("useExisting" in provider && provider.useExisting != null)
    binding = makeBinding(
      (options) => inject(provider.useExisting, options),
      EMPTY,
      // Alias re-dispatches every time; target's binding owns caching.
      Lifetime.Transient,
    );
  else {
    throw new TypeError(`Unknown provider type.`, {
      cause: provider,
    });
  }

  return binding;
}

function throwIfDisposed(injector: Injector): void {
  if (injector.disposed) {
    throw new InjectorDisposedError(injector.name);
  }
}
