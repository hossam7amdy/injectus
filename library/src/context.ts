import { InjectionContextError } from "./errors.ts";
import type { Lifetime } from "./lifetime.ts";
import type { Token } from "./token.ts";

/** Options for `injector.resolve()`. */
export interface InjectOptions {
  /** Return `null` instead of throwing when the token has no provider. */
  optional?: boolean;
}

/** @internal Resolve-facing view of `Injector` consumed by the injection context. */
export interface Injector {
  resolve<T>(token: Token<T>): T;
  resolve<T>(token: Token<T>, options: { optional: true }): T | null;
  resolve<T>(token: Token<T>, options?: InjectOptions): T | null;
}

export interface InjectionContext {
  injector: Injector;
  /** Strictest lifetime seen so far. Lets `hydrate()` detect captive dependencies in O(1). */
  effectiveLifetime: Lifetime | undefined;
}

let currentContext: InjectionContext | undefined;

export function getInjectionContext(): InjectionContext | undefined {
  return currentContext;
}

/** @internal Set current context, return previous. Always restore in a `finally`. */
export function setInjectionContext(
  ctx: InjectionContext | undefined,
): InjectionContext | undefined {
  const prev = currentContext;
  currentContext = ctx;
  return prev;
}

/**
 * Resolve a token through the active injection context.
 *
 * Valid only synchronously inside a factory or class field initializer
 * invoked by an `Injector`. Throws `InjectionContextError` elsewhere.
 *
 * @example
 * class UserService {
 *   db     = inject(Database);
 *   config = inject(CONFIG, { optional: true }); // null when missing
 * }
 */
export function inject<T>(token: Token<T>): T;
export function inject<T>(
  token: Token<T>,
  options: { optional: true },
): T | null;
export function inject<T>(token: Token<T>, options?: InjectOptions): T | null;
export function inject<T>(token: Token<T>, options?: InjectOptions): T | null {
  const ctx = currentContext;
  if (ctx === undefined) {
    throw new InjectionContextError(token);
  }
  return ctx.injector.resolve(token, options);
}

/**
 * Run `fn` under `injector`'s injection context.
 *
 * `inject()` calls inside `fn` resolve through `injector`.
 * Useful for manual wiring and test setup.
 *
 * @example
 * const svc = withInjector(injector, () => new MyService());
 */
export function withInjector<R>(injector: Injector, fn: () => R): R {
  const prev = setInjectionContext({
    injector,
    effectiveLifetime: currentContext?.effectiveLifetime,
  });
  try {
    return fn();
  } finally {
    setInjectionContext(prev);
  }
}
