/**
 * Typed DI key for non-class dependencies — interfaces, primitives, config objects.
 * Unique by identity: two tokens with the same description are distinct keys.
 *
 * @example
 * const API_URL  = new InjectionToken<string>("API_URL");
 * const TIMEOUT  = new InjectionToken<number>("TIMEOUT");
 * abstract class Cache { abstract get(k: string): string | null; }
 */
export class InjectionToken<T> {
  declare readonly __type: T;
  readonly description: string;

  constructor(description: string) {
    this.description = description;
  }

  toString(): string {
    return `InjectionToken(${this.description})`;
  }
}

/** A concrete class constructor. */
export interface Constructor<T = unknown> {
  new (...args: never[]): T;
}

/** Anything that can be used as a DI key. */
export type Token<T = unknown> =
  | Constructor<T>
  | InjectionToken<T>
  | (Function & { prototype: T });

/**
 * Human-readable label for a token — for logging and debugging.
 *
 * Renders an `InjectionToken` via its `toString()`, a class or function
 * token via its `.name`, or falls back to `String(token)` when unnamed.
 *
 * @example
 * tokenName(Service); // "Service"
 * tokenName(new InjectionToken("PORT")); // "InjectionToken(PORT)"
 */
export function tokenName(token: Token): string {
  if (token instanceof InjectionToken) return token.toString();
  return (token as Constructor).name || String(token);
}
