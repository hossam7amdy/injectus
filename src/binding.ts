import type { InjectOptions } from "./context.ts";
import type { Lifetime } from "./lifetime.ts";
import type { Token } from "./token.ts";

/** No cached value yet. */
export const EMPTY: unique symbol = Symbol("EMPTY");
export type Empty = typeof EMPTY;

/** Hydration in progress — cycle marker. */
export const CIRCULAR: unique symbol = Symbol("CIRCULAR");
export type Circular = typeof CIRCULAR;

/**
 * Fixed field order across all bindings keeps V8's hidden class
 * monomorphic on the hot resolve path — always go through `makeBinding`.
 */
export interface Binding<T = unknown> {
  factory: ((options?: InjectOptions) => T | null) | undefined;
  value: T | Empty | Circular;
  lifetime: Lifetime;
  /** `false` for a single binding; the element keys for a multi-token container. */
  multi: false | Token[];
}

export function makeBinding<T>(
  factory: ((options?: InjectOptions) => T | null) | undefined,
  value: T | Empty | Circular,
  lifetime: Lifetime,
  multi: false | Token[] = false,
): Binding<T> {
  return { factory, value, lifetime, multi };
}
