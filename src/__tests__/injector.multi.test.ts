import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CaptiveDependencyError,
  CircularDependencyError,
  InjectionToken,
  Injector,
  InjectorDisposedError,
  inject,
  Lifetime,
  TokenNotFoundError,
} from "../index.ts";
import { Counter, DisposeTracker } from "./helpers.ts";
import { TEST_OPTIONS } from "./test.config.ts";

interface Tagged {
  tag: string;
}

describe("multi — assembly", TEST_OPTIONS, () => {
  it("returns every element in registration order", () => {
    const MW = InjectionToken.multi<Tagged>("MW");
    const injector = Injector.create({
      providers: [
        { provide: MW, useValue: { tag: "a" } },
        { provide: MW, useValue: { tag: "b" } },
        { provide: MW, useValue: { tag: "c" } },
      ],
    });

    assert.deepEqual(
      injector.resolve(MW).map((m) => m.tag),
      ["a", "b", "c"],
    );
  });

  it("a single provider still yields a one-element array", () => {
    const MW = InjectionToken.multi<number>("MW");
    const injector = Injector.create({
      providers: [{ provide: MW, useValue: 7 }],
    });
    assert.deepEqual(injector.resolve(MW), [7]);
  });

  it("accepts every provider form as an element", () => {
    const MW = InjectionToken.multi<Tagged>("MW");
    const SRC = new InjectionToken<Tagged>("SRC");
    class ClassPlugin implements Tagged {
      tag = "class";
    }
    const injector = Injector.create({
      providers: [
        { provide: MW, useValue: { tag: "value" } },
        { provide: MW, useFactory: () => ({ tag: "factory" }) },
        { provide: MW, useClass: ClassPlugin },
        { provide: SRC, useValue: { tag: "existing" } },
        { provide: MW, useExisting: SRC },
      ],
    });

    assert.deepEqual(
      injector.resolve(MW).map((m) => m.tag),
      ["value", "factory", "class", "existing"],
    );
  });
});

describe("multi — empty", TEST_OPTIONS, () => {
  it("throws TokenNotFoundError when nothing is registered", () => {
    const MW = InjectionToken.multi<number>("MW");
    const injector = Injector.create({ providers: [] });
    assert.throws(() => injector.resolve(MW), TokenNotFoundError);
  });

  it("optional yields [] when nothing is registered", () => {
    const MW = InjectionToken.multi<number>("MW");
    const injector = Injector.create({ providers: [] });
    assert.deepEqual(injector.resolve(MW, { optional: true }), []);
  });
});

describe("multi — inheritance (merge, root-first)", TEST_OPTIONS, () => {
  it("child set = parent ∪ child, ancestors first", () => {
    const MW = InjectionToken.multi<Tagged>("MW");
    const app = Injector.create({
      providers: [
        { provide: MW, useValue: { tag: "auth" } },
        { provide: MW, useValue: { tag: "log" } },
      ],
    });
    const req = Injector.create({
      parent: app,
      providers: [{ provide: MW, useValue: { tag: "reqId" } }],
    });

    assert.deepEqual(
      req.resolve(MW).map((m) => m.tag),
      ["auth", "log", "reqId"],
    );
    assert.deepEqual(
      app.resolve(MW).map((m) => m.tag),
      ["auth", "log"],
    );
  });

  it("merges across a gap (grandchild with empty middle)", () => {
    const MW = InjectionToken.multi<Tagged>("MW");
    const root = Injector.create({
      providers: [{ provide: MW, useValue: { tag: "root" } }],
    });
    const mid = Injector.create({ providers: [], parent: root });
    const grand = Injector.create({
      parent: mid,
      providers: [{ provide: MW, useValue: { tag: "grand" } }],
    });

    assert.deepEqual(
      grand.resolve(MW).map((m) => m.tag),
      ["root", "grand"],
    );
  });
});

describe("multi — per-element lifetime", TEST_OPTIONS, () => {
  it("rebuilds the array but caches singletons, refreshes transients", () => {
    const MW = InjectionToken.multi<object>("MW");
    const cs = new Counter();
    const ct = new Counter();
    const injector = Injector.create({
      providers: [
        {
          provide: MW,
          useFactory: () => {
            cs.hit();
            return { kind: "singleton" };
          },
        },
        {
          provide: MW,
          useFactory: () => {
            ct.hit();
            return { kind: "transient" };
          },
          lifetime: Lifetime.Transient,
        },
      ],
    });

    const a = injector.resolve(MW);
    const b = injector.resolve(MW);

    assert.notEqual(a, b, "array wrapper is rebuilt each call");
    assert.equal(a[0], b[0], "singleton element is stable");
    assert.equal(cs.count, 1);
    assert.notEqual(a[1], b[1], "transient element is fresh");
    assert.equal(ct.count, 2);
  });

  it("transient element from an ancestor refreshes per call", () => {
    const MW = InjectionToken.multi<object>("MW");
    const counter = new Counter();
    const root = Injector.create({
      providers: [
        {
          provide: MW,
          useFactory: () => {
            counter.hit();
            return {};
          },
          lifetime: Lifetime.Transient,
        },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });

    assert.notEqual(child.resolve(MW)[0], child.resolve(MW)[0]);
    assert.equal(counter.count, 2);
  });

  it("scoped element is one-per-child, shared within a child", () => {
    const MW = InjectionToken.multi<object>("MW");
    const counter = new Counter();
    const root = Injector.create({
      providers: [
        {
          provide: MW,
          useFactory: () => {
            counter.hit();
            return {};
          },
          lifetime: Lifetime.Scoped,
        },
      ],
    });
    const child1 = Injector.create({ providers: [], parent: root });
    const child2 = Injector.create({ providers: [], parent: root });

    const a = child1.resolve(MW)[0];
    assert.equal(child1.resolve(MW)[0], a, "stable within a child");
    assert.notEqual(child2.resolve(MW)[0], a, "distinct across children");
    assert.equal(counter.count, 2);
  });
});

describe("multi — captive & circular", TEST_OPTIONS, () => {
  it("a singleton element holding a scoped dep throws CaptiveDependencyError", () => {
    const SCOPED = new InjectionToken<object>("SCOPED");
    const MW = InjectionToken.multi<object>("MW");
    class Holder {
      dep = inject(SCOPED);
    }
    const injector = Injector.create({
      providers: [
        { provide: SCOPED, useFactory: () => ({}), lifetime: Lifetime.Scoped },
        { provide: MW, useClass: Holder },
      ],
    });

    assert.throws(() => injector.resolve(MW), CaptiveDependencyError);
  });

  it("an element that injects its own multi token throws CircularDependencyError", () => {
    const MW = InjectionToken.multi<unknown>("MW");
    const injector = Injector.create({
      providers: [{ provide: MW, useFactory: () => inject(MW) }],
    });

    assert.throws(() => injector.resolve(MW), CircularDependencyError);
  });
});

describe("multi — inject() context", TEST_OPTIONS, () => {
  it("inject(MW) inside a factory returns the array", () => {
    const MW = InjectionToken.multi<number>("MW");
    const SUM = new InjectionToken<number>("SUM");
    const injector = Injector.create({
      providers: [
        { provide: MW, useValue: 1 },
        { provide: MW, useValue: 2 },
        { provide: MW, useValue: 3 },
        {
          provide: SUM,
          useFactory: () => inject(MW).reduce((a, b) => a + b, 0),
        },
      ],
    });

    assert.equal(injector.resolve(SUM), 6);
  });
});

describe("multi — disposed injectors", TEST_OPTIONS, () => {
  it("throws on disposed self", async () => {
    const MW = InjectionToken.multi<number>("MW");
    const injector = Injector.create({
      providers: [{ provide: MW, useValue: 1 }],
    });
    await injector.dispose();
    assert.throws(() => injector.resolve(MW), InjectorDisposedError);
  });

  it("throws when an ancestor is disposed", async () => {
    const MW = InjectionToken.multi<number>("MW");
    const root = Injector.create({
      providers: [{ provide: MW, useValue: 1 }],
    });
    const child = Injector.create({ providers: [], parent: root });
    await root.dispose();
    assert.throws(() => child.resolve(MW), InjectorDisposedError);
  });
});

describe("multi — disposal", TEST_OPTIONS, () => {
  it("disposes singleton elements LIFO on the owning injector", async () => {
    const tracker = new DisposeTracker();
    const MW = InjectionToken.multi<object>("MW");
    const injector = Injector.create({
      providers: [
        { provide: MW, useFactory: () => tracker.syncDisposable("a") },
        { provide: MW, useFactory: () => tracker.syncDisposable("b") },
      ],
    });

    injector.resolve(MW);
    await injector.dispose();

    assert.deepEqual(tracker.startOrder, ["b", "a"]);
    assert.deepEqual(tracker.leaked(), []);
  });

  it("a scoped element disposes with its child, not the parent", async () => {
    const tracker = new DisposeTracker();
    const MW = InjectionToken.multi<object>("MW");
    const root = Injector.create({
      providers: [
        { provide: MW, useFactory: () => tracker.syncDisposable("root-el") },
      ],
    });
    const child = Injector.create({
      parent: root,
      providers: [
        {
          provide: MW,
          useFactory: () => tracker.syncDisposable("child-el"),
          lifetime: Lifetime.Scoped,
        },
      ],
    });

    child.resolve(MW);
    await child.dispose();
    assert.deepEqual(tracker.startOrder, ["child-el"]);

    await root.dispose();
    assert.deepEqual(tracker.startOrder, ["child-el", "root-el"]);
  });
});
