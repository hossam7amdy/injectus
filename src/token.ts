/**
 * Typed DI key for non-class dependencies — interfaces, primitives, config objects.
 * Unique by identity: two tokens with the same description are distinct keys.
 *
 * Use {@link InjectionToken.multi} to make a **multi-binding** key: every provider
 * registered against it contributes one element, and `resolve()` / `inject()` return
 * `T[]` — collected root-to-leaf across the injector chain.
 *
 * @typeParam M - Phantom flag that carries multi-ness into the type system so resolution
 *   infers `T[]` for multi tokens and `T` for single ones. Set to `true` by
 *   {@link InjectionToken.multi}; defaults to `false` for ordinary keys.
 *
 * @example
 * const API_URL = new InjectionToken<string>("API_URL");
 * const TIMEOUT = new InjectionToken<number>("TIMEOUT");
 * abstract class Cache { abstract get(k: string): string | null; }
 * const PLUGINS = InjectionToken.multi<Plugin>("PLUGINS");
 */
export class InjectionToken<T, M extends boolean = false> {
  declare readonly __type: T;
  readonly description: string;
  /** `true` when this is a multi-binding key. Selects the array resolution path. */
  readonly multi: M;

  constructor(description: string, multi: M = false as M) {
    this.description = description;
    this.multi = multi;
  }

  /**
   * Create a multi-binding key. Every provider registered against it contributes one
   * element; `resolve()` / `inject()` return `T[]`, merged root-to-leaf across the chain.
   * `{ optional: true }` yields `[]` instead of throwing when nothing is registered.
   *
   * @example
   * const PLUGINS = InjectionToken.multi<Plugin>("PLUGINS");
   * Injector.create({ providers: [
   *   { provide: PLUGINS, useClass: AuthPlugin },
   *   { provide: PLUGINS, useClass: CachePlugin },
   * ]}).resolve(PLUGINS); // Plugin[]
   */
  static multi<T>(description: string): InjectionToken<T, true> {
    return new InjectionToken<T, true>(description, true);
  }

  toString(): string {
    return `InjectionToken(${this.description})`;
  }
}

/** A concrete class constructor. */
export interface Constructor<T = unknown> {
  new (...args: never[]): T;
}

/** A class or abstract class reference. */
export type AbstractClass<T = unknown> = abstract new (...args: never[]) => T;

/** Anything that can be used as a DI key. */
export type Token<T = unknown> =
  | Constructor<T>
  | InjectionToken<T, boolean>
  | AbstractClass<T>;

/** @internal Returns a human-readable name for a token. */
export function tokenName(token: Token): string {
  if (token instanceof InjectionToken) return token.toString();
  return (token as Constructor).name || String(token);
}
