import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Lifetime, minLifetime } from "../lifetime.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("Lifetime — constant", TEST_OPTIONS, () => {
  it("exposes singleton, scoped, transient string values", () => {
    assert.equal(Lifetime.Singleton, "singleton");
    assert.equal(Lifetime.Scoped, "scoped");
    assert.equal(Lifetime.Transient, "transient");
  });

  it("is frozen", () => {
    assert.equal(Object.isFrozen(Lifetime), true);
  });
});

describe("minLifetime — strictness ordering", TEST_OPTIONS, () => {
  it("returns `a` when `b` is undefined", () => {
    assert.equal(minLifetime(Lifetime.Scoped, undefined), Lifetime.Scoped);
    assert.equal(
      minLifetime(Lifetime.Singleton, undefined),
      Lifetime.Singleton,
    );
    assert.equal(
      minLifetime(Lifetime.Transient, undefined),
      Lifetime.Transient,
    );
  });

  it("singleton is strictest — beats scoped and transient", () => {
    assert.equal(
      minLifetime(Lifetime.Singleton, Lifetime.Scoped),
      Lifetime.Singleton,
    );
    assert.equal(
      minLifetime(Lifetime.Scoped, Lifetime.Singleton),
      Lifetime.Singleton,
    );
    assert.equal(
      minLifetime(Lifetime.Singleton, Lifetime.Transient),
      Lifetime.Singleton,
    );
  });

  it("scoped beats transient", () => {
    assert.equal(
      minLifetime(Lifetime.Scoped, Lifetime.Transient),
      Lifetime.Scoped,
    );
    assert.equal(
      minLifetime(Lifetime.Transient, Lifetime.Scoped),
      Lifetime.Scoped,
    );
  });

  it("identical lifetimes return that lifetime", () => {
    assert.equal(
      minLifetime(Lifetime.Singleton, Lifetime.Singleton),
      Lifetime.Singleton,
    );
    assert.equal(
      minLifetime(Lifetime.Scoped, Lifetime.Scoped),
      Lifetime.Scoped,
    );
    assert.equal(
      minLifetime(Lifetime.Transient, Lifetime.Transient),
      Lifetime.Transient,
    );
  });
});
