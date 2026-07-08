import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { inject, withInjector } from "../context.ts";
import { InjectionContextError } from "../errors.ts";
import { Injector } from "../injector.ts";
import { InjectionToken } from "../token.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("inject() — valid contexts", TEST_OPTIONS, () => {
  it("works inside factory body", () => {
    const Dep = new InjectionToken<string>("dep");
    const Svc = new InjectionToken<{ dep: string }>("svc");
    const injector = Injector.create({
      providers: [
        { provide: Dep, useValue: "wired" },
        {
          provide: Svc,
          useFactory: () => ({ dep: inject(Dep) }),
          lifetime: "singleton",
        },
      ],
    });
    assert.equal(injector.resolve(Svc).dep, "wired");
  });

  it("works inside class field initializer", () => {
    const Dep = new InjectionToken<string>("dep");
    class Service {
      readonly dep: string = inject(Dep);
    }
    const injector = Injector.create({
      providers: [
        { provide: Dep, useValue: "wired" },
        { provide: Service, useClass: Service, lifetime: "singleton" },
      ],
    });
    assert.equal(injector.resolve(Service).dep, "wired");
  });

  it("constructs class with no arguments", () => {
    let argCount = -1;
    class Service {
      constructor(...args: never[]) {
        argCount = args.length;
      }
    }
    const injector = Injector.create({
      providers: [{ provide: Service, useClass: Service }],
    });
    injector.resolve(Service);
    assert.equal(argCount, 0);
  });

  it("resolves transitively through nested factories", () => {
    const C = new InjectionToken<string>("c");
    const B = new InjectionToken<{ c: string }>("b");
    const A = new InjectionToken<{ b: { c: string } }>("a");
    const injector = Injector.create({
      providers: [
        { provide: C, useValue: "leaf" },
        {
          provide: B,
          useFactory: () => ({ c: inject(C) }),
          lifetime: "singleton",
        },
        {
          provide: A,
          useFactory: () => ({ b: inject(B) }),
          lifetime: "singleton",
        },
      ],
    });
    assert.equal(injector.resolve(A).b.c, "leaf");
  });

  it("supports optional overload", () => {
    const Missing = new InjectionToken<number>("missing");
    const Svc = new InjectionToken<{ dep: number | null }>("svc");
    const injector = Injector.create({
      providers: [
        {
          provide: Svc,
          useFactory: () => ({ dep: inject(Missing, { optional: true }) }),
          lifetime: "singleton",
        },
      ],
    });
    assert.equal(injector.resolve(Svc).dep, null);
  });
});

describe("inject() — invalid contexts", TEST_OPTIONS, () => {
  it("throws when called at top level", () => {
    assert.throws(
      () => inject(new InjectionToken("orphan")),
      InjectionContextError,
    );
  });

  it("throws inside scheduled callback", async () => {
    const Dep = new InjectionToken<number>("dep");
    const Svc = new InjectionToken<object>("svc");
    let caught: unknown;
    const injector = Injector.create({
      providers: [
        { provide: Dep, useValue: 1 },
        {
          provide: Svc,
          useFactory: () => {
            setTimeout(() => {
              try {
                inject(Dep);
              } catch (err) {
                caught = err;
              }
            }, 0);
            return {};
          },
          lifetime: "singleton",
        },
      ],
    });

    injector.resolve(Svc);
    await sleep(10);
    assert.ok(caught instanceof InjectionContextError);
  });

  it("throws after await boundary", async () => {
    const Dep = new InjectionToken<number>("dep");
    const Svc = new InjectionToken<object>("svc");
    let caught: unknown;
    const injector = Injector.create({
      providers: [
        { provide: Dep, useValue: 1 },
        {
          provide: Svc,
          useFactory: () => {
            void (async () => {
              await sleep();
              try {
                inject(Dep);
              } catch (err) {
                caught = err;
              }
            })();
            return {};
          },
          lifetime: "singleton",
        },
      ],
    });

    injector.resolve(Svc);
    await sleep(10);
    assert.ok(caught instanceof InjectionContextError);
  });

  it("throws inside [Symbol.asyncDispose] handler", async () => {
    const Dep = new InjectionToken<number>("dep");
    let caught: unknown;
    class Resource {
      async [Symbol.asyncDispose](): Promise<void> {
        try {
          inject(Dep);
        } catch (err) {
          caught = err;
        }
      }
    }
    const injector = Injector.create({
      providers: [
        { provide: Dep, useValue: 1 },
        { provide: Resource, useClass: Resource, lifetime: "singleton" },
      ],
    });

    injector.resolve(Resource);
    await injector.dispose();
    assert.ok(caught instanceof InjectionContextError);
  });
});

describe("inject() — lifecycle boundaries", TEST_OPTIONS, () => {
  it("throws inside [Symbol.dispose]", async () => {
    class Dep {}
    let caught: unknown;
    class Owner {
      [Symbol.dispose]() {
        try {
          inject(Dep);
        } catch (e) {
          caught = e;
        }
      }
    }
    const injector = Injector.create({
      providers: [
        { provide: Dep, useClass: Dep },
        { provide: Owner, useClass: Owner },
      ],
    });
    injector.resolve(Owner);
    await injector.dispose();
    assert.ok(caught instanceof InjectionContextError);
  });

  it("throws inside [Symbol.asyncDispose]", async () => {
    class Dep {}
    let caught: unknown;
    class Owner {
      async [Symbol.asyncDispose]() {
        try {
          inject(Dep);
        } catch (e) {
          caught = e;
        }
      }
    }
    const injector = Injector.create({
      providers: [
        { provide: Dep, useClass: Dep },
        { provide: Owner, useClass: Owner },
      ],
    });
    injector.resolve(Owner);
    await injector.dispose();
    assert.ok(caught instanceof InjectionContextError);
  });

  it("throws when called after construction", () => {
    class Dep {}
    class Svc {
      d = inject(Dep);
      lateInject() {
        return inject(Dep);
      }
    }
    const injector = Injector.create({
      providers: [
        { provide: Dep, useClass: Dep },
        { provide: Svc, useClass: Svc },
      ],
    });
    const svc = injector.resolve(Svc);
    assert.ok(svc.d instanceof Dep);
    assert.throws(() => svc.lateInject(), InjectionContextError);
  });
});

describe("withInjector — nesting", TEST_OPTIONS, () => {
  it("restores outer resolver after inner returns", () => {
    const T = new InjectionToken<string>("T");
    const outer = Injector.create({
      providers: [{ provide: T, useValue: "outer" }],
    });
    const inner = Injector.create({
      providers: [{ provide: T, useValue: "inner" }],
    });

    let outerBefore = "";
    let innerVal = "";
    let outerAfter = "";

    withInjector(outer, () => {
      outerBefore = inject(T);
      withInjector(inner, () => {
        innerVal = inject(T);
      });
      outerAfter = inject(T);
    });

    assert.equal(outerBefore, "outer");
    assert.equal(innerVal, "inner");
    assert.equal(outerAfter, "outer");
  });

  it("is out-of-context after callback returns", () => {
    const T = new InjectionToken<number>("T");
    const injector = Injector.create({
      providers: [{ provide: T, useValue: 1 }],
    });
    withInjector(injector, () => inject(T));
    assert.throws(() => inject(T), InjectionContextError);
  });

  it("restores context when callback throws", () => {
    const T = new InjectionToken<number>("T");
    const injector = Injector.create({
      providers: [{ provide: T, useValue: 1 }],
    });
    assert.throws(() =>
      withInjector(injector, () => {
        throw new Error("boom");
      }),
    );
    assert.throws(() => inject(T), InjectionContextError);
  });
});
