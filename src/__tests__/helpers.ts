import { setTimeout as sleep } from "node:timers/promises";

export interface DisposeEvent {
  name: string;
  phase: "start" | "end";
}

export class DisposeTracker {
  /** start/end events in real-time order across all disposables. */
  readonly events: DisposeEvent[] = [];
  readonly constructed: string[] = [];
  private readonly counts = new Map<string, number>();

  /** Call from a factory body to record construction order. */
  born(name: string): void {
    this.constructed.push(name);
  }

  disposeCountOf(name: string): number {
    return this.counts.get(name) ?? 0;
  }

  /** Names in the order their dispose handler *started*. */
  get startOrder(): string[] {
    return this.events.filter((e) => e.phase === "start").map((e) => e.name);
  }

  /** True iff every dispose fully finished before the next one began. */
  get wasSequential(): boolean {
    let inFlight = 0;
    for (const e of this.events) {
      if (e.phase === "start") {
        inFlight += 1;
        if (inFlight > 1) return false;
      } else {
        inFlight -= 1;
      }
    }
    return true;
  }

  leaked(): string[] {
    return this.constructed.filter((n) => this.disposeCountOf(n) === 0);
  }

  doubleDisposed(): string[] {
    return [...this.counts.entries()].filter(([, c]) => c > 1).map(([n]) => n);
  }

  private markStart(name: string): void {
    this.events.push({ name, phase: "start" });
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
  }

  private markEnd(name: string): void {
    this.events.push({ name, phase: "end" });
  }

  syncDisposable(
    name: string,
    opts: { throwOnDispose?: boolean } = {},
  ): { readonly name: string } & Disposable {
    this.born(name);
    const self = this;
    return {
      name,
      [Symbol.dispose](): void {
        self.markStart(name);
        try {
          if (opts.throwOnDispose) {
            throw new Error(`sync dispose failed: ${name}`);
          }
        } finally {
          self.markEnd(name);
        }
      },
    };
  }

  /** `delayMs` introduces a real await so tests can detect whether disposals run sequentially or concurrently. */
  asyncDisposable(
    name: string,
    opts: { throwOnDispose?: boolean; delayMs?: number } = {},
  ): { readonly name: string } & AsyncDisposable {
    this.born(name);
    const self = this;
    return {
      name,
      async [Symbol.asyncDispose](): Promise<void> {
        self.markStart(name);
        try {
          if (opts.delayMs) await sleep(opts.delayMs);
          if (opts.throwOnDispose) {
            throw new Error(`async dispose failed: ${name}`);
          }
        } finally {
          self.markEnd(name);
        }
      },
    };
  }
}

/** Counts how many times a factory body runs — used to assert caching. */
export class Counter {
  private n = 0;
  hit(): number {
    this.n += 1;
    return this.n;
  }
  get count(): number {
    return this.n;
  }
}

export interface Rng {
  readonly seed: number;
  /** float in [0, 1) */
  next(): number;
  /** integer in [0, maxExclusive) */
  int(maxExclusive: number): number;
  /** uniform pick from a non-empty array */
  pick<T>(arr: readonly T[]): T;
  /** true with probability p */
  chance(p: number): boolean;
}

// mulberry32 — deterministic seeded PRNG for property tests.
export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const rng: Rng = {
    seed,
    next(): number {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(maxExclusive: number): number {
      return Math.floor(rng.next() * maxExclusive);
    },
    pick<T>(arr: readonly T[]): T {
      return arr[rng.int(arr.length)] as T;
    },
    chance(p: number): boolean {
      return rng.next() < p;
    },
  };
  return rng;
}
