import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InjectionToken, Injector, InjectorDisposedError } from "../index.ts";
import { DisposeTracker } from "./helpers.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("disposal — ownership", TEST_OPTIONS, () => {
  it("disposes singleton on owning injector", async () => {
    const tracker = new DisposeTracker();
    const T = new InjectionToken("T");
    const injector = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => tracker.asyncDisposable("svc"),
          lifetime: "singleton",
        },
      ],
    });
    injector.resolve(T);
    await injector.dispose();
    assert.equal(tracker.disposeCountOf("svc"), 1);
  });

  it("disposes scoped on owning child", async () => {
    const tracker = new DisposeTracker();
    const T = new InjectionToken("T");
    const root = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => tracker.asyncDisposable("scoped"),
          lifetime: "scoped",
        },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    child.resolve(T);
    await child.dispose();
    assert.equal(tracker.disposeCountOf("scoped"), 1);
  });

  it("child does not dispose parent's singleton", async () => {
    const tracker = new DisposeTracker();
    const T = new InjectionToken("T");
    const root = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => tracker.asyncDisposable("singleton"),
          lifetime: "singleton",
        },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    child.resolve(T); // constructs in the owner (root)

    await child.dispose();
    assert.equal(
      tracker.disposeCountOf("singleton"),
      0,
      "a child must not dispose an instance it does not own",
    );

    await root.dispose();
    assert.equal(tracker.disposeCountOf("singleton"), 1);
  });

  it("never disposes useValue", async () => {
    const tracker = new DisposeTracker();
    const value = tracker.syncDisposable("value"); // caller-created, disposable
    const T = new InjectionToken<typeof value>("T");
    const injector = Injector.create({
      providers: [{ provide: T, useValue: value }],
    });
    injector.resolve(T);
    await injector.dispose();
    assert.equal(tracker.disposeCountOf("value"), 0);
  });

  it("never retains or disposes transients", async () => {
    const tracker = new DisposeTracker();
    const T = new InjectionToken("T");
    const injector = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () =>
            tracker.asyncDisposable(`t${tracker.constructed.length}`),
          lifetime: "transient",
        },
      ],
    });
    injector.resolve(T);
    injector.resolve(T);
    injector.resolve(T);
    await injector.dispose();
    assert.equal(tracker.startOrder.length, 0);
  });
});

describe("disposal — order", TEST_OPTIONS, () => {
  it("disposes in reverse construction order", async () => {
    const tracker = new DisposeTracker();
    const A = new InjectionToken("A");
    const B = new InjectionToken("B");
    const C = new InjectionToken("C");
    const injector = Injector.create({
      providers: [
        {
          provide: A,
          useFactory: () => tracker.syncDisposable("A"),
          lifetime: "singleton",
        },
        {
          provide: B,
          useFactory: () => tracker.syncDisposable("B"),
          lifetime: "singleton",
        },
        {
          provide: C,
          useFactory: () => tracker.syncDisposable("C"),
          lifetime: "singleton",
        },
      ],
    });
    injector.resolve(A);
    injector.resolve(B);
    injector.resolve(C);
    await injector.dispose();
    assert.deepEqual(tracker.startOrder, ["C", "B", "A"]);
  });

  it("awaits each async dispose sequentially", async () => {
    const tracker = new DisposeTracker();
    const A = new InjectionToken("A");
    const B = new InjectionToken("B");
    const C = new InjectionToken("C");
    const injector = Injector.create({
      providers: [
        // B's short delay would let it finish first IF disposal were concurrent.
        {
          provide: A,
          useFactory: () => tracker.asyncDisposable("A", { delayMs: 20 }),
          lifetime: "singleton",
        },
        {
          provide: B,
          useFactory: () => tracker.asyncDisposable("B", { delayMs: 5 }),
          lifetime: "singleton",
        },
        {
          provide: C,
          useFactory: () => tracker.asyncDisposable("C", { delayMs: 20 }),
          lifetime: "singleton",
        },
      ],
    });
    injector.resolve(A);
    injector.resolve(B);
    injector.resolve(C);
    await injector.dispose();

    assert.equal(
      tracker.wasSequential,
      true,
      "each async dispose must finish before the next starts",
    );
    assert.deepEqual(tracker.startOrder, ["C", "B", "A"]);
  });

  it("mixed sync/async still disposes LIFO", async () => {
    const tracker = new DisposeTracker();
    const A = new InjectionToken("A");
    const B = new InjectionToken("B");
    const C = new InjectionToken("C");
    const injector = Injector.create({
      providers: [
        {
          provide: A,
          useFactory: () => tracker.asyncDisposable("A"),
          lifetime: "singleton",
        },
        {
          provide: B,
          useFactory: () => tracker.syncDisposable("B"),
          lifetime: "singleton",
        },
        {
          provide: C,
          useFactory: () => tracker.asyncDisposable("C"),
          lifetime: "singleton",
        },
      ],
    });
    injector.resolve(A);
    injector.resolve(B);
    injector.resolve(C);
    await injector.dispose();
    assert.deepEqual(tracker.startOrder, ["C", "B", "A"]);
  });
});

describe("disposal — failure handling", TEST_OPTIONS, () => {
  it("continues past throwing handler", async () => {
    const tracker = new DisposeTracker();
    const A = new InjectionToken("A");
    const B = new InjectionToken("B");
    const C = new InjectionToken("C");
    const injector = Injector.create({
      providers: [
        {
          provide: A,
          useFactory: () => tracker.asyncDisposable("A"),
          lifetime: "singleton",
        },
        {
          provide: B,
          useFactory: () =>
            tracker.asyncDisposable("B", { throwOnDispose: true }),
          lifetime: "singleton",
        },
        {
          provide: C,
          useFactory: () => tracker.asyncDisposable("C"),
          lifetime: "singleton",
        },
      ],
    });
    injector.resolve(A);
    injector.resolve(B);
    injector.resolve(C);

    await assert.rejects(injector.dispose(), (err: unknown) => {
      assert.ok(
        err instanceof Error,
        "dispose() must reject with the underlying error when only one handler throws",
      );
      return true;
    });

    assert.equal(tracker.disposeCountOf("A"), 1, "A still disposed");
    assert.equal(tracker.disposeCountOf("C"), 1, "C still disposed");
    assert.equal(
      injector.disposed,
      true,
      "disposed flag is true even after a failed teardown",
    );
  });

  it("aggregates multiple throwing handlers", async () => {
    const tracker = new DisposeTracker();
    const A = new InjectionToken("A");
    const B = new InjectionToken("B");
    const C = new InjectionToken("C");
    const D = new InjectionToken("D");
    const injector = Injector.create({
      providers: [
        {
          provide: A,
          useFactory: () => tracker.asyncDisposable("A"),
          lifetime: "singleton",
        },
        {
          provide: B,
          useFactory: () =>
            tracker.asyncDisposable("B", { throwOnDispose: true }),
          lifetime: "singleton",
        },
        {
          provide: C,
          useFactory: () => tracker.asyncDisposable("C"),
          lifetime: "singleton",
        },
        {
          provide: D,
          useFactory: () =>
            tracker.asyncDisposable("D", { throwOnDispose: true }),
          lifetime: "singleton",
        },
      ],
    });
    for (const t of [A, B, C, D]) injector.resolve(t);

    await assert.rejects(injector.dispose(), (err: unknown) => {
      assert.ok(err instanceof AggregateError);
      assert.equal(err.errors.length, 2);
      return true;
    });
    assert.equal(
      tracker.leaked().length,
      0,
      "every instance was still disposed",
    );
  });
});

describe("disposal — idempotency", TEST_OPTIONS, () => {
  it("is idempotent", async () => {
    const tracker = new DisposeTracker();
    const A = new InjectionToken("A");
    const injector = Injector.create({
      providers: [
        {
          provide: A,
          useFactory: () => tracker.asyncDisposable("A"),
          lifetime: "singleton",
        },
      ],
    });
    injector.resolve(A);
    await injector.dispose();
    await injector.dispose();
    await injector.dispose();
    assert.equal(tracker.disposeCountOf("A"), 1);
  });

  it("concurrent calls share one run", async () => {
    const tracker = new DisposeTracker();
    const A = new InjectionToken("A");
    const injector = Injector.create({
      providers: [
        {
          provide: A,
          useFactory: () => tracker.asyncDisposable("A", { delayMs: 15 }),
          lifetime: "singleton",
        },
      ],
    });
    injector.resolve(A);
    await Promise.all([
      injector.dispose(),
      injector.dispose(),
      injector.dispose(),
    ]);
    assert.equal(tracker.disposeCountOf("A"), 1);
  });

  it("second call after failure rejects again", async () => {
    const tracker = new DisposeTracker();
    const A = new InjectionToken("A");
    const injector = Injector.create({
      providers: [
        {
          provide: A,
          useFactory: () =>
            tracker.asyncDisposable("A", { throwOnDispose: true }),
          lifetime: "singleton",
        },
      ],
    });
    injector.resolve(A);
    await assert.rejects(injector.dispose(), Error);
    await assert.rejects(injector.dispose(), Error);
  });
});

describe("disposal — non-cascading", TEST_OPTIONS, () => {
  it("parent dispose does not cascade to child", async () => {
    const tracker = new DisposeTracker();
    const P = new InjectionToken("P");
    const C = new InjectionToken("C");
    const root = Injector.create({
      providers: [
        {
          provide: P,
          useFactory: () => tracker.syncDisposable("parent"),
          lifetime: "singleton",
        },
      ],
    });
    const child = Injector.create({
      providers: [
        {
          provide: C,
          useFactory: () => tracker.syncDisposable("child"),
          lifetime: "singleton",
        },
      ],
      parent: root,
    });
    root.resolve(P);
    child.resolve(C);

    await root.dispose();
    assert.equal(tracker.disposeCountOf("parent"), 1);
    assert.equal(
      tracker.disposeCountOf("child"),
      0,
      "child instances are not cascaded",
    );

    await child.dispose();
    assert.equal(
      tracker.disposeCountOf("child"),
      1,
      "the child still disposes independently",
    );
  });
});

describe("disposal — post-dispose access", TEST_OPTIONS, () => {
  it("disposed flag flips after dispose", async () => {
    const injector = Injector.create({ providers: [] });
    assert.equal(injector.disposed, false);
    await injector.dispose();
    assert.equal(injector.disposed, true);
  });

  it("resolve() throws after dispose", async () => {
    const T = new InjectionToken<number>("T");
    const injector = Injector.create({
      providers: [{ provide: T, useValue: 1 }],
    });
    await injector.dispose();
    assert.throws(() => injector.resolve(T), InjectorDisposedError);
  });

  it("resolve via disposed parent throws after dispose", async () => {
    const T = new InjectionToken<number>("T");
    const root = Injector.create({ providers: [{ provide: T, useValue: 1 }] });
    const child = Injector.create({ providers: [], parent: root });
    await root.dispose();
    assert.throws(() => child.resolve(T), InjectorDisposedError);
  });

  it("Injector.create() throws when parent is disposed", async () => {
    const root = Injector.create({ providers: [] });
    await root.dispose();
    assert.throws(
      () => Injector.create({ providers: [], parent: root }),
      InjectorDisposedError,
    );
  });

  it("Symbol.asyncDispose disposes the injector", async () => {
    const tracker = new DisposeTracker();
    const T = new InjectionToken("T");
    const injector = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => tracker.asyncDisposable("svc"),
          lifetime: "singleton",
        },
      ],
    });
    injector.resolve(T);
    await injector[Symbol.asyncDispose]();
    assert.equal(injector.disposed, true);
    assert.equal(tracker.disposeCountOf("svc"), 1);
  });

  it("empty injector disposes cleanly", async () => {
    const injector = Injector.create({ providers: [] });
    await assert.doesNotReject(injector.dispose());
    assert.equal(injector.disposed, true);
  });
});

describe("disposal — explicit resource management", TEST_OPTIONS, () => {
  it("await using triggers asyncDispose at block exit", async () => {
    let disposed = false;
    class R {
      [Symbol.dispose]() {
        disposed = true;
      }
    }
    {
      await using injector = Injector.create({
        providers: [{ provide: R, useClass: R }],
      });
      injector.resolve(R);
    }
    assert.equal(disposed, true);
  });

  it("rejects with AggregateError on multiple sync throws", async () => {
    class A {
      [Symbol.dispose]() {
        throw new Error("a-fail");
      }
    }
    class B {
      [Symbol.dispose]() {
        throw new Error("b-fail");
      }
    }
    const injector = Injector.create({
      providers: [
        { provide: A, useClass: A },
        { provide: B, useClass: B },
      ],
    });
    injector.resolve(A);
    injector.resolve(B);
    await assert.rejects(() => injector.dispose(), AggregateError);
  });

  it("useValue disposable is not disposed", async () => {
    let disposed = false;
    const RES = new InjectionToken<{ [Symbol.dispose](): void }>("RES");
    const res = {
      [Symbol.dispose]() {
        disposed = true;
      },
    };
    const injector = Injector.create({
      providers: [{ provide: RES, useValue: res }],
    });
    injector.resolve(RES);
    await injector.dispose();
    assert.equal(disposed, false);
  });
});
