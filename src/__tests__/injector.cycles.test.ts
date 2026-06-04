import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CircularDependencyError,
  InjectionToken,
  Injector,
  inject,
  Lifetime,
} from "../index.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("circular dependency — singleton graphs", TEST_OPTIONS, () => {
  it("throws on A<->B cycle", () => {
    class A {
      b = inject(B);
    }
    class B {
      a = inject(A);
    }
    const injector = Injector.create({
      providers: [
        { provide: A, useClass: A },
        { provide: B, useClass: B },
      ],
    });
    assert.throws(() => injector.resolve(A), CircularDependencyError);
  });

  it("throws on self-cycle", () => {
    class X {
      self = inject(X);
    }
    const injector = Injector.create({
      providers: [{ provide: X, useClass: X }],
    });
    assert.throws(() => injector.resolve(X), CircularDependencyError);
  });

  it("throws on A->B->C->A cycle", () => {
    const A = new InjectionToken<object>("A");
    const B = new InjectionToken<object>("B");
    const C = new InjectionToken<object>("C");
    const injector = Injector.create({
      providers: [
        {
          provide: A,
          useFactory: () => ({ b: inject(B) }),
          lifetime: "singleton",
        },
        {
          provide: B,
          useFactory: () => ({ c: inject(C) }),
          lifetime: "singleton",
        },
        {
          provide: C,
          useFactory: () => ({ a: inject(A) }),
          lifetime: "singleton",
        },
      ],
    });
    assert.throws(() => injector.resolve(A), CircularDependencyError);
  });

  it("embeds each token name in message", () => {
    const A = new InjectionToken<object>("Alpha");
    const B = new InjectionToken<object>("Beta");
    const injector = Injector.create({
      providers: [
        {
          provide: A,
          useFactory: () => ({ b: inject(B) }),
          lifetime: "singleton",
        },
        {
          provide: B,
          useFactory: () => ({ a: inject(A) }),
          lifetime: "singleton",
        },
      ],
    });
    assert.throws(
      () => injector.resolve(A),
      (err: unknown) => {
        assert.ok(err instanceof CircularDependencyError);
        assert.match(err.message, /Alpha/);
        assert.match(err.message, /Beta/);
        return true;
      },
    );
  });

  it("non-cyclic diamond resolves cleanly", () => {
    const D = new InjectionToken<object>("D");
    const B = new InjectionToken<object>("B");
    const C = new InjectionToken<object>("C");
    const A = new InjectionToken<object>("A");
    const injector = Injector.create({
      providers: [
        {
          provide: D,
          useFactory: () => ({}),
          lifetime: "singleton",
        },
        {
          provide: B,
          useFactory: () => ({ d: inject(D) }),
          lifetime: "singleton",
        },
        {
          provide: C,
          useFactory: () => ({ d: inject(D) }),
          lifetime: "singleton",
        },
        {
          provide: A,
          useFactory: () => ({ b: inject(B), c: inject(C) }),
          lifetime: "singleton",
        },
      ],
    });
    assert.doesNotThrow(() => injector.resolve(A));
  });

  it("chain is root-to-leaf", () => {
    class A {
      b = inject(B);
    }
    class B {
      a = inject(A);
    }
    const injector = Injector.create({
      providers: [
        { provide: A, useClass: A },
        { provide: B, useClass: B },
      ],
    });
    let caught: CircularDependencyError | undefined;
    try {
      injector.resolve(A);
    } catch (e) {
      caught = e as CircularDependencyError;
    }
    assert.ok(caught instanceof CircularDependencyError);
    assert.deepEqual(caught.chain, [A, B, A]);
  });
});

describe("circular dependency — alias chains", TEST_OPTIONS, () => {
  it("throws on A->B->A alias cycle", () => {
    const A = new InjectionToken<number>("A");
    const B = new InjectionToken<number>("B");
    const injector = Injector.create({
      providers: [
        { provide: A, useExisting: B },
        { provide: B, useExisting: A },
      ],
    });
    assert.throws(() => injector.resolve(A), CircularDependencyError);
  });
});

describe("circular dependency — transient graphs", TEST_OPTIONS, () => {
  it("throws on transient self-cycle", () => {
    const T = new InjectionToken<unknown>("T");
    const injector = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => ({ self: inject(T) }),
          lifetime: Lifetime.Transient,
        },
      ],
    });
    assert.throws(() => injector.resolve(T), CircularDependencyError);
  });

  it("throws on transient indirect cycle", () => {
    const T = new InjectionToken<unknown>("T");
    const T2 = new InjectionToken<unknown>("T2");
    const injector = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => ({ t2: inject(T2) }),
          lifetime: Lifetime.Transient,
        },
        {
          provide: T2,
          useFactory: () => ({ t: inject(T) }),
          lifetime: Lifetime.Transient,
        },
      ],
    });
    assert.throws(() => injector.resolve(T), CircularDependencyError);
  });

  it("sequential resolves are not flagged", () => {
    let n = 0;
    const T = new InjectionToken<number>("T");
    const injector = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => ++n,
          lifetime: Lifetime.Transient,
        },
      ],
    });
    assert.equal(injector.resolve(T), 1);
    assert.equal(injector.resolve(T), 2);
  });
});
