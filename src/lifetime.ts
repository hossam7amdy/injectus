/**
 * How long a resolved instance lives within its owning injector.
 * Default when omitted from a provider: `Singleton`.
 */
export const Lifetime = Object.freeze({
  /** Cached on the owning injector. One instance per binding site. */
  Singleton: "singleton",
  /** Cached per resolving child injector. One instance per child. */
  Scoped: "scoped",
  /** Fresh on every `resolve()` / `inject()`. Never cached, never disposed. */
  Transient: "transient",
});

export type Lifetime = (typeof Lifetime)[keyof typeof Lifetime];

const RANK: Record<Lifetime, number> = {
  singleton: 0,
  scoped: 1,
  transient: 2,
};

/** @internal Strictest of two lifetimes (Singleton < Scoped < Transient). */
export function minLifetime(a: Lifetime, b: Lifetime | undefined): Lifetime {
  if (b === undefined) return a;
  return RANK[a] < RANK[b] ? a : b;
}
