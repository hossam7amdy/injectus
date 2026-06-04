import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CaptiveDependencyError,
  CircularDependencyError,
  DependencyPathError,
  InjectionContextError,
  InjectorDisposedError,
  TokenNotFoundError,
} from "../errors.ts";
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
  it("renders the leaf in the message", () => {
    const err = new CircularDependencyError(T);
    assert.match(err.message, /Circular dependency: InjectionToken\(T\)\./);
    assert.equal(err.name, "CircularDependencyError");
  });

  it("renders the prepended path root-to-leaf", () => {
    const A = new InjectionToken<number>("A");
    const B = new InjectionToken<number>("B");
    const err = new CircularDependencyError(A);
    DependencyPathError.prepend(err, B);
    assert.match(
      err.message,
      /Circular dependency: InjectionToken\(B\) -> InjectionToken\(A\)\./,
    );
  });
});

describe("errors — CaptiveDependencyError", TEST_OPTIONS, () => {
  it("labels the scoped dependency in the message", () => {
    const err = new CaptiveDependencyError(T);
    assert.match(err.message, /InjectionToken\(T\) \(scoped\)/);
    assert.equal(err.name, "CaptiveDependencyError");
  });

  it("renders the prepended path root-to-leaf", () => {
    const Scoped = new InjectionToken<number>("Scoped");
    const Sing = new InjectionToken<number>("Sing");
    const err = new CaptiveDependencyError(Scoped);
    DependencyPathError.prepend(err, Sing);
    assert.match(err.message, /InjectionToken\(Scoped\) \(scoped\)/);
    assert.match(
      err.message,
      /Chain: InjectionToken\(Sing\) -> InjectionToken\(Scoped\)\./,
    );
  });
});

describe("errors — DependencyPathError.prepend", TEST_OPTIONS, () => {
  it("prepends across multiple frames in order", () => {
    const Scoped = new InjectionToken<number>("Scoped");
    const Mid = new InjectionToken<number>("Mid");
    const Outer = new InjectionToken<number>("Outer");
    const err = new CaptiveDependencyError(Scoped);

    DependencyPathError.prepend(err, Mid);
    DependencyPathError.prepend(err, Outer);
    assert.match(
      err.message,
      /Chain: InjectionToken\(Outer\) -> InjectionToken\(Mid\) -> InjectionToken\(Scoped\)\./,
    );
  });

  it("exposes the accumulated path root-to-leaf", () => {
    const Scoped = new InjectionToken<number>("Scoped");
    const Mid = new InjectionToken<number>("Mid");
    const Outer = new InjectionToken<number>("Outer");
    const err = new CaptiveDependencyError(Scoped);

    assert.deepEqual(err.path, [Scoped]);
    DependencyPathError.prepend(err, Mid);
    DependencyPathError.prepend(err, Outer);
    assert.deepEqual(err.path, [Outer, Mid, Scoped]);
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
