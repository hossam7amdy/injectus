import type { Lifetime } from "./lifetime.ts";
import type { Constructor, Token } from "./token.ts";

/** Provide a pre-existing value. The injector never disposes it — the caller owns it. */
export interface ValueProvider<T = unknown> {
  provide: Token<T>;
  useValue: T;
}

/** Provide via a zero-arg factory. `inject()` is active inside the factory body. */
export interface FactoryProvider<T = unknown> {
  provide: Token<T>;
  useFactory: () => T;
  lifetime?: Lifetime;
}

/** Provide by constructing a class. `inject()` is active in field initializers and the constructor. */
export interface ClassProvider<T = unknown> {
  provide: Token<T>;
  useClass: Constructor<T>;
  lifetime?: Lifetime;
}

/**
 * Alias: re-dispatch `provide` as `useExisting`.
 * Resolution always goes through the calling injector, so child overrides are respected.
 * Caching is owned by the target's binding.
 */
export interface ExistingProvider<T = unknown> {
  provide: Token<T>;
  useExisting: Token<T>;
}

export type Provider<T = unknown> =
  | Constructor<T>
  | ValueProvider<T>
  | ClassProvider<T>
  | FactoryProvider<T>
  | ExistingProvider<T>;
