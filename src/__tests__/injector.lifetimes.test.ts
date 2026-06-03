import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InjectionToken, Injector } from "../index.ts";
import { Counter } from "./helpers.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("lifetimes — default", TEST_OPTIONS, () => {
  it("FactoryProvider defaults to singleton", () => {
    const counter = new Counter();
    const T = new InjectionToken<object>("T");
    const scope = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => {
            counter.hit();
            return {};
          },
        },
      ],
    });

    const a = scope.resolve(T);
    const b = scope.resolve(T);
    assert.equal(a, b, "default lifetime must cache like a singleton");
    assert.equal(counter.count, 1);
  });

  it("ClassProvider defaults to singleton", () => {
    let constructed = 0;
    class Service {
      constructor() {
        constructed += 1;
      }
    }
    const scope = Injector.create({
      providers: [{ provide: Service, useClass: Service }],
    });

    assert.equal(scope.resolve(Service), scope.resolve(Service));
    assert.equal(constructed, 1);
  });
});

describe("lifetimes — singleton", TEST_OPTIONS, () => {
  it("shares one instance within scope", () => {
    const counter = new Counter();
    const T = new InjectionToken<object>("T");
    const scope = Injector.create({
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

    assert.equal(scope.resolve(T), scope.resolve(T));
    assert.equal(counter.count, 1);
  });

  it("child resolves parent's singleton", () => {
    const counter = new Counter();
    const T = new InjectionToken<object>("T");
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
    const child = Injector.create({ providers: [], parent: root });

    const fromRoot = root.resolve(T);
    const fromChild = child.resolve(T);

    assert.equal(
      fromRoot,
      fromChild,
      "descendant must share the parent's singleton",
    );
    assert.equal(counter.count, 1, "a singleton is constructed exactly once");
  });

  it("siblings share parent's singleton", () => {
    const counter = new Counter();
    const T = new InjectionToken<object>("T");
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

    const a = Injector.create({ providers: [], parent: root }).resolve(T);
    const b = Injector.create({ providers: [], parent: root }).resolve(T);
    assert.equal(a, b);
    assert.equal(counter.count, 1);
  });
});

describe("lifetimes — scoped", TEST_OPTIONS, () => {
  it("one instance per scope, cached", () => {
    const counter = new Counter();
    const T = new InjectionToken<object>("T");
    const root = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => {
            counter.hit();
            return {};
          },
          lifetime: "scoped",
        },
      ],
    });
    const c1 = Injector.create({ providers: [], parent: root });
    const c2 = Injector.create({ providers: [], parent: root });

    const a1 = c1.resolve(T);
    const a1Again = c1.resolve(T);
    const a2 = c2.resolve(T);

    assert.equal(
      a1,
      a1Again,
      "scoped instance is cached within its child scope",
    );
    assert.notEqual(a1, a2, "each child scope gets its own scoped instance");
    assert.equal(counter.count, 2, "constructed once per resolving scope");
  });

  it("child-owned scoped resolves locally", () => {
    const T = new InjectionToken<object>("T");
    const root = Injector.create({ providers: [] });
    const child = Injector.create({
      providers: [{ provide: T, useFactory: () => ({}), lifetime: "scoped" }],
      parent: root,
    });
    assert.doesNotThrow(() => child.resolve(T));
  });
});

describe("lifetimes — transient", TEST_OPTIONS, () => {
  it("fresh instance per resolve", () => {
    const counter = new Counter();
    const T = new InjectionToken<object>("T");
    const scope = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => {
            counter.hit();
            return {};
          },
          lifetime: "transient",
        },
      ],
    });

    const a = scope.resolve(T);
    const b = scope.resolve(T);
    const c = scope.resolve(T);
    assert.equal(
      new Set([a, b, c]).size,
      3,
      "every resolve yields a new instance",
    );
    assert.equal(counter.count, 3);
  });
});
