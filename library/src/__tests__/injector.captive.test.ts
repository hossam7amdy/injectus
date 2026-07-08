import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CaptiveDependencyError,
  InjectionToken,
  Injector,
  inject,
  Lifetime,
} from "../index.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("captive dependency — singleton reaching scoped", TEST_OPTIONS, () => {
  it("throws on Singleton->Scoped", () => {
    const Scoped = new InjectionToken<object>("scoped");
    const Singleton = new InjectionToken<object>("singleton");
    const root = Injector.create({
      providers: [
        { provide: Scoped, useFactory: () => ({}), lifetime: "scoped" },
        {
          provide: Singleton,
          useFactory: () => {
            inject(Scoped);
            return {};
          },
          lifetime: "singleton",
        },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    assert.throws(() => child.resolve(Singleton), CaptiveDependencyError);
  });

  it("throws on transitive Singleton->Scoped", () => {
    const Scoped = new InjectionToken<object>("scoped");
    const Mid = new InjectionToken<object>("mid");
    const Singleton = new InjectionToken<object>("singleton");
    const root = Injector.create({
      providers: [
        { provide: Scoped, useFactory: () => ({}), lifetime: "scoped" },
        {
          provide: Mid,
          useFactory: () => ({ scoped: inject(Scoped) }),
          lifetime: "singleton",
        },
        {
          provide: Singleton,
          useFactory: () => ({ mid: inject(Mid) }),
          lifetime: "singleton",
        },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    assert.throws(() => child.resolve(Singleton), CaptiveDependencyError);
  });

  it("throws on Singleton->Transient->Scoped", () => {
    class S {}
    class T {
      s = inject(S);
    }
    class Sing {
      t = inject(T);
    }
    const root = Injector.create({
      providers: [
        { provide: S, useClass: S, lifetime: Lifetime.Scoped },
        { provide: T, useClass: T, lifetime: Lifetime.Transient },
        { provide: Sing, useClass: Sing },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    assert.throws(() => child.resolve(Sing), CaptiveDependencyError);
  });

  it("throws even when the scoped binding was already cached on its owner", () => {
    const Scoped = new InjectionToken<{ id: number }>("scoped");
    const Sing = new InjectionToken<object>("singleton");
    const root = Injector.create({
      providers: [
        {
          provide: Scoped,
          useFactory: () => ({ id: Math.random() }),
          lifetime: "scoped",
        },
        {
          provide: Sing,
          useFactory: () => ({ dep: inject(Scoped) }),
          lifetime: "singleton",
        },
      ],
    });
    // Stray direct resolve caches the scoped value on root's binding.
    root.resolve(Scoped);
    // Captive detection must still fire — cache must not mask it.
    const child = Injector.create({ providers: [], parent: root });
    assert.throws(() => child.resolve(Sing), CaptiveDependencyError);
  });

  it("alias inherits target lifetime", () => {
    class Scoped {}
    const IScoped = new InjectionToken<Scoped>("IScoped");
    class Sing {
      dep = inject(IScoped);
    }
    const root = Injector.create({
      providers: [
        {
          provide: Scoped,
          useClass: Scoped,
          lifetime: Lifetime.Scoped,
        },
        { provide: IScoped, useExisting: Scoped },
        { provide: Sing, useClass: Sing },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    assert.throws(() => child.resolve(Sing), CaptiveDependencyError);
  });
});

describe("captive dependency — allowed combinations", TEST_OPTIONS, () => {
  it("Singleton->Transient allowed", () => {
    const Transient = new InjectionToken<object>("transient");
    const Singleton = new InjectionToken<object>("singleton");
    const root = Injector.create({
      providers: [
        { provide: Transient, useFactory: () => ({}), lifetime: "transient" },
        {
          provide: Singleton,
          useFactory: () => ({ dep: inject(Transient) }),
          lifetime: "singleton",
        },
      ],
    });
    assert.doesNotThrow(() => root.resolve(Singleton));
  });

  it("Scoped->Singleton allowed", () => {
    const Singleton = new InjectionToken<object>("singleton");
    const Scoped = new InjectionToken<object>("scoped");
    const root = Injector.create({
      providers: [
        { provide: Singleton, useFactory: () => ({}), lifetime: "singleton" },
        {
          provide: Scoped,
          useFactory: () => ({ dep: inject(Singleton) }),
          lifetime: "scoped",
        },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    assert.doesNotThrow(() => child.resolve(Scoped));
  });

  it("Scoped->Scoped allowed", () => {
    const A = new InjectionToken<object>("a");
    const B = new InjectionToken<object>("b");
    const root = Injector.create({
      providers: [
        { provide: A, useFactory: () => ({}), lifetime: "scoped" },
        {
          provide: B,
          useFactory: () => ({ a: inject(A) }),
          lifetime: "scoped",
        },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    assert.doesNotThrow(() => child.resolve(B));
  });
});

describe("captive dependency — error metadata", TEST_OPTIONS, () => {
  it("renders the full path through nested singletons", () => {
    class C {}
    class B {
      c = inject(C);
    }
    class A {
      b = inject(B);
    }
    const root = Injector.create({
      providers: [
        { provide: C, useClass: C, lifetime: Lifetime.Scoped },
        { provide: B, useClass: B },
        { provide: A, useClass: A },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    let caught: CaptiveDependencyError | undefined;
    try {
      child.resolve(A);
    } catch (e) {
      caught = e as CaptiveDependencyError;
    }
    assert.ok(caught instanceof CaptiveDependencyError);
    assert.match(caught.message, /C \(scoped\)/);
    assert.match(caught.message, /Chain: A -> B -> C\./);
  });

  it("renders the full path across a transient", () => {
    class C {}
    class T {
      c = inject(C);
    }
    class A {
      t = inject(T);
    }
    const root = Injector.create({
      providers: [
        { provide: C, useClass: C, lifetime: Lifetime.Scoped },
        { provide: T, useClass: T, lifetime: Lifetime.Transient },
        { provide: A, useClass: A },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    let caught: CaptiveDependencyError | undefined;
    try {
      child.resolve(A);
    } catch (e) {
      caught = e as CaptiveDependencyError;
    }
    assert.ok(caught instanceof CaptiveDependencyError);
    assert.match(caught.message, /C \(scoped\)/);
    assert.match(caught.message, /Chain: A -> T -> C\./);
  });

  it("message reflects prepended chain", () => {
    class Scoped {}
    class Sing {
      s = inject(Scoped);
    }
    const root = Injector.create({
      providers: [
        {
          provide: Scoped,
          useClass: Scoped,
          lifetime: Lifetime.Scoped,
        },
        { provide: Sing, useClass: Sing },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    let caught: CaptiveDependencyError | undefined;
    try {
      child.resolve(Sing);
    } catch (e) {
      caught = e as CaptiveDependencyError;
    }
    assert.ok(caught !== undefined);
    assert.match(caught.message, /Chain: Sing -> Scoped\./);
  });
});
