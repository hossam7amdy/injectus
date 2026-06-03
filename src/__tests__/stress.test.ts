import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CaptiveDependencyError,
  CircularDependencyError,
  InjectionToken,
  Injector,
  InjectorDisposedError,
  inject,
  type Provider,
} from "../index.ts";
import { Counter, DisposeTracker, makeRng, type Rng } from "./helpers.ts";
import { TEST_OPTIONS } from "./test.config.ts";

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];

type SimpleLifetime = "singleton" | "transient";

interface LayeredGraph {
  tokens: InjectionToken<object>[];
  lifetimes: SimpleLifetime[];
  providers: Provider[];
}

// node i may depend only on nodes j > i (guarantees no cycle); lifetimes
// restricted to singleton/transient so no captive dependency can arise.
function buildAcyclicGraph(rng: Rng, n: number): LayeredGraph {
  const tokens = Array.from(
    { length: n },
    (_, i) => new InjectionToken<object>(`n${i}`),
  );
  const lifetimes: SimpleLifetime[] = [];
  const deps: number[][] = [];
  for (let i = 0; i < n; i++) {
    lifetimes.push(rng.chance(0.5) ? "singleton" : "transient");
    const d: number[] = [];
    for (let j = i + 1; j < n; j++) {
      if (rng.chance(0.35)) d.push(j);
    }
    deps.push(d);
  }
  const providers = tokens.map((tok, i) => ({
    provide: tok,
    useFactory: () => {
      const obj: Record<string, unknown> = {};
      for (const j of deps[i]!) obj[`d${j}`] = inject(tokens[j]!);
      return obj;
    },
    lifetime: lifetimes[i],
  }));
  return { tokens, lifetimes, providers };
}

describe(
  "property — acyclic graphs resolve with correct lifetime caching",
  TEST_OPTIONS,
  () => {
    for (const seed of SEEDS) {
      it(`seed ${seed}`, () => {
        const rng = makeRng(seed);
        const n = 5 + rng.int(9); // 5..13 nodes
        const g = buildAcyclicGraph(rng, n);
        const scope = Injector.create({ providers: g.providers });

        assert.doesNotThrow(
          () => scope.resolve(g.tokens[0]!),
          `acyclic graph must resolve (seed ${seed})`,
        );

        for (let i = 0; i < n; i++) {
          const a = scope.resolve(g.tokens[i]!);
          const b = scope.resolve(g.tokens[i]!);
          if (g.lifetimes[i] === "singleton") {
            assert.equal(
              a,
              b,
              `n${i} is a singleton — must be cached (seed ${seed})`,
            );
          } else {
            assert.notEqual(
              a,
              b,
              `n${i} is transient — must be fresh (seed ${seed})`,
            );
          }
        }
      });
    }
  },
);

describe(
  "property — cycles of random length are always detected",
  TEST_OPTIONS,
  () => {
    for (const seed of SEEDS) {
      it(`seed ${seed}`, () => {
        const rng = makeRng(seed + 1000);
        const k = 2 + rng.int(7); // ring of 2..8 nodes
        const ring = Array.from(
          { length: k },
          (_, i) => new InjectionToken<object>(`r${i}`),
        );
        const providers = ring.map((tok, i) => ({
          provide: tok,
          useFactory: () => ({ next: inject(ring[(i + 1) % k]!) }),
          lifetime: "singleton" as const,
        }));
        const scope = Injector.create({ providers });

        const entryPoint = rng.pick(ring);
        assert.throws(
          () => scope.resolve(entryPoint),
          CircularDependencyError,
          `a ${k}-node ring must throw CircularDependencyError (seed ${seed})`,
        );
      });
    }
  },
);

describe(
  "property — singleton -> ... -> scoped is always a captive dependency",
  TEST_OPTIONS,
  () => {
    for (const seed of SEEDS) {
      it(`seed ${seed}`, () => {
        const rng = makeRng(seed + 2000);
        const m = 3 + rng.int(5); // chain of 3..7 nodes
        const chain = Array.from(
          { length: m },
          (_, i) => new InjectionToken<object>(`c${i}`),
        );
        // exactly one interior/tail node is scoped; node 0 is always singleton.
        const scopedAt = 1 + rng.int(m - 1);
        const providers = chain.map((tok, i) => ({
          provide: tok,
          useFactory: () => (i + 1 < m ? { next: inject(chain[i + 1]!) } : {}),
          lifetime: (i === scopedAt ? "scoped" : "singleton") as
            | "scoped"
            | "singleton",
        }));
        const root = Injector.create({ providers });
        const child = Injector.create({ providers: [], parent: root });

        assert.throws(
          () => child.resolve(chain[0]!),
          CaptiveDependencyError,
          `singleton c0 reaching scoped c${scopedAt} must be captive (seed ${seed})`,
        );
      });
    }
  },
);

describe(
  "property — disposal is reverse-construction order with no leaks",
  TEST_OPTIONS,
  () => {
    for (const seed of SEEDS) {
      it(`seed ${seed}`, async () => {
        const rng = makeRng(seed + 3000);
        const n = 4 + rng.int(7); // 4..10 disposable singletons
        const tracker = new DisposeTracker();
        const tokens = Array.from(
          { length: n },
          (_, i) => new InjectionToken<object>(`d${i}`),
        );
        const deps: number[][] = [];
        for (let i = 0; i < n; i++) {
          const d: number[] = [];
          for (let j = i + 1; j < n; j++) {
            if (rng.chance(0.4)) d.push(j);
          }
          deps.push(d);
        }
        const providers = tokens.map((tok, i) => ({
          provide: tok,
          useFactory: () => {
            // inject deps before registering self so `constructed` is a topo order.
            for (const j of deps[i]!) inject(tokens[j]!);
            return tracker.asyncDisposable(`d${i}`);
          },
          lifetime: "singleton" as const,
        }));
        const scope = Injector.create({ providers });
        scope.resolve(tokens[0]!);
        await scope.dispose();

        assert.deepEqual(
          tracker.startOrder,
          [...tracker.constructed].reverse(),
          `disposal must be exact reverse of construction (seed ${seed})`,
        );
        assert.equal(
          tracker.wasSequential,
          true,
          `disposal must be sequential (seed ${seed})`,
        );
        assert.deepEqual(
          tracker.leaked(),
          [],
          `no instance may leak (seed ${seed})`,
        );
        assert.deepEqual(
          tracker.doubleDisposed(),
          [],
          `no instance may be disposed twice (seed ${seed})`,
        );
      });
    }
  },
);

describe("stress — depth, breadth, volume, concurrency", TEST_OPTIONS, () => {
  it("a 200-level deep scope tree shares one root singleton", async () => {
    const T = new InjectionToken<object>("deep");
    const counter = new Counter();
    const root = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => {
            counter.hit();
            return {};
          },
          lifetime: "singleton",
        },
      ],
    });

    let leaf: Injector = root;
    for (let i = 0; i < 200; i++)
      leaf = Injector.create({ providers: [], parent: leaf });

    const fromLeaf = leaf.resolve(T);
    const fromRoot = root.resolve(T);
    assert.equal(
      fromLeaf,
      fromRoot,
      "deep descendant must share the root singleton",
    );
    assert.equal(counter.count, 1, "the singleton is constructed exactly once");

    await root.dispose();
  });

  it("10,000 transient resolves leak nothing into the container", async () => {
    const tracker = new DisposeTracker();
    const T = new InjectionToken<object>("vol");
    const scope = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () =>
            tracker.asyncDisposable(`t${tracker.constructed.length}`),
          lifetime: "transient",
        },
      ],
    });

    const seen = new Set<object>();
    for (let i = 0; i < 10_000; i++) seen.add(scope.resolve(T));
    assert.equal(
      seen.size,
      10_000,
      "every transient resolve is a distinct instance",
    );

    await scope.dispose();
    assert.equal(
      tracker.startOrder.length,
      0,
      "the container must not retain or dispose any transient",
    );
  });

  it("100 sibling child scopes each dispose exactly their own scoped instance", async () => {
    const tracker = new DisposeTracker();
    const T = new InjectionToken<object>("scoped");
    const root = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () =>
            tracker.asyncDisposable(`s${tracker.constructed.length}`),
          lifetime: "scoped",
        },
      ],
    });

    const children = Array.from({ length: 100 }, () =>
      Injector.create({ providers: [], parent: root }),
    );
    for (const child of children) child.resolve(T);
    assert.equal(
      tracker.constructed.length,
      100,
      "one scoped instance per child",
    );

    await Promise.all(children.map((c) => c.dispose()));
    assert.deepEqual(
      tracker.leaked(),
      [],
      "every scoped instance was disposed",
    );
    assert.deepEqual(
      tracker.doubleDisposed(),
      [],
      "no scoped instance disposed twice",
    );

    await root.dispose();
  });

  it("concurrent dispose() across 50 children leaves every scope disposed once", async () => {
    const tracker = new DisposeTracker();
    const T = new InjectionToken<object>("c");
    const root = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () =>
            tracker.asyncDisposable(`x${tracker.constructed.length}`),
          lifetime: "scoped",
        },
      ],
    });

    const children = Array.from({ length: 50 }, () =>
      Injector.create({ providers: [], parent: root }),
    );
    for (const child of children) child.resolve(T);

    await Promise.all(children.flatMap((c) => [c.dispose(), c.dispose()]));

    for (const child of children) assert.equal(child.disposed, true);
    assert.deepEqual(
      tracker.doubleDisposed(),
      [],
      "no double-dispose under concurrency",
    );
    assert.equal(tracker.leaked().length, 0);
  });

  it("interleaved resolve/dispose: after dispose every access throws InjectorDisposedError", async () => {
    for (const seed of SEEDS) {
      const rng = makeRng(seed + 4000);
      const T = new InjectionToken<object>(`i${seed}`);
      const scope = Injector.create({
        providers: [
          { provide: T, useFactory: () => ({}), lifetime: "singleton" },
        ],
      });

      const resolvesBefore = 1 + rng.int(5);
      for (let i = 0; i < resolvesBefore; i++) scope.resolve(T);

      await scope.dispose();

      assert.throws(
        () => scope.resolve(T),
        InjectorDisposedError,
        `seed ${seed}`,
      );
    }
  });

  it("a wide graph (1 root depending on 100 leaves) resolves and disposes cleanly", async () => {
    const tracker = new DisposeTracker();
    const leaves = Array.from(
      { length: 100 },
      (_, i) => new InjectionToken<object>(`leaf${i}`),
    );
    const rootTok = new InjectionToken<object>("wide-root");

    const providers: Provider[] = leaves.map((tok, i) => ({
      provide: tok,
      useFactory: () => tracker.asyncDisposable(`leaf${i}`),
      lifetime: "singleton" as const,
    }));
    providers.push({
      provide: rootTok,
      useFactory: () => {
        for (const leaf of leaves) inject(leaf);
        return tracker.asyncDisposable("wide-root");
      },
      lifetime: "singleton" as const,
    });

    const scope = Injector.create({ providers });
    scope.resolve(rootTok);
    assert.equal(tracker.constructed.length, 101);

    await scope.dispose();
    assert.equal(
      tracker.startOrder[0],
      "wide-root",
      "the dependent disposes before its leaves",
    );
    assert.deepEqual(tracker.leaked(), []);
    assert.deepEqual(tracker.doubleDisposed(), []);
  });
});
