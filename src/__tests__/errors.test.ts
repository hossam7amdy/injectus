import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CaptiveDependencyError,
  CircularDependencyError,
  InjectionContextError,
  InjectorDisposedError,
  prependTokenToDependencyPath,
  TokenNotFoundError,
} from "../errors.ts";
import { Lifetime } from "../lifetime.ts";
import { InjectionToken } from "../token.ts";
import { TEST_OPTIONS } from "./test.config.ts";

const T = new InjectionToken<number>("T");

describe("errors — TokenNotFoundError", TEST_OPTIONS, () => {
  it("names token and injector", () => {
    const err = new TokenNotFoundError(T, "root");
    assert.match(err.message, /InjectionToken\(T\)/);
    assert.match(err.message, /"root"/);
    assert.equal(err.name, "TokenNotFoundError");
  });
});

describe("errors — CircularDependencyError", TEST_OPTIONS, () => {
  it("starts with chain = [leaf]", () => {
    const err = new CircularDependencyError(T);
    assert.deepEqual(err.chain, [T]);
    assert.equal(err.name, "CircularDependencyError");
  });

  it("renders chain in message", () => {
    const A = new InjectionToken<number>("A");
    const B = new InjectionToken<number>("B");
    const err = new CircularDependencyError(A);
    err.chain.unshift(B);
    assert.match(
      err.message,
      /Circular dependency: InjectionToken\(B\) -> InjectionToken\(A\)\./,
    );
  });
});

describe("errors — CaptiveDependencyError", TEST_OPTIONS, () => {
  it("dependency getter returns chain tail", () => {
    const err = new CaptiveDependencyError(T);
    assert.equal(err.dependency, T);
    assert.equal(err.name, "CaptiveDependencyError");
  });

  it("uses '<singleton>' placeholder when unset", () => {
    const err = new CaptiveDependencyError(T);
    assert.match(err.message, /<singleton>/);
  });

  it("names consumer once set", () => {
    class Owner {}
    const err = new CaptiveDependencyError(T);
    err.consumer = Owner;
    assert.match(err.message, /Owner \(singleton\)/);
    assert.match(err.message, /InjectionToken\(T\) \(scoped\)/);
  });
});

describe("errors — prependTokenToDependencyPath", TEST_OPTIONS, () => {
  it("prepends to circular chain", () => {
    const A = new InjectionToken<number>("A");
    const B = new InjectionToken<number>("B");
    const err = new CircularDependencyError(B);
    prependTokenToDependencyPath(err, A, Lifetime.Singleton);
    assert.deepEqual(err.chain, [A, B]);
  });

  it("sets consumer at first singleton frame", () => {
    const Scoped = new InjectionToken<number>("Scoped");
    const TransientToken = new InjectionToken<number>("TT");
    const Sing = new InjectionToken<number>("Sing");
    const err = new CaptiveDependencyError(Scoped);

    prependTokenToDependencyPath(err, TransientToken, Lifetime.Transient);
    assert.equal(err.consumer, undefined);
    assert.deepEqual(err.chain, [TransientToken, Scoped]);

    prependTokenToDependencyPath(err, Sing, Lifetime.Singleton);
    assert.equal(err.consumer, Sing);
    assert.deepEqual(err.chain, [Sing, TransientToken, Scoped]);
  });

  it("does not overwrite consumer", () => {
    const Scoped = new InjectionToken<number>("Scoped");
    const Inner = new InjectionToken<number>("Inner");
    const Outer = new InjectionToken<number>("Outer");
    const err = new CaptiveDependencyError(Scoped);

    prependTokenToDependencyPath(err, Inner, Lifetime.Singleton);
    prependTokenToDependencyPath(err, Outer, Lifetime.Singleton);
    assert.equal(err.consumer, Inner);
  });
});

describe("errors — InjectionContextError", TEST_OPTIONS, () => {
  it("explains synchronous-only requirement", () => {
    const err = new InjectionContextError(T);
    assert.match(err.message, /InjectionToken\(T\)/);
    assert.match(err.message, /injection context/);
    assert.equal(err.name, "InjectionContextError");
  });
});

describe("errors — InjectorDisposedError", TEST_OPTIONS, () => {
  it("names disposed injector", () => {
    const err = new InjectorDisposedError("request");
    assert.match(err.message, /"request"/);
    assert.equal(err.name, "InjectorDisposedError");
  });
});
