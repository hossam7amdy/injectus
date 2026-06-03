import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InjectionToken, Injector, InjectorDisposedError } from "../index.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("injector tree — getters", TEST_OPTIONS, () => {
  it("parent getter", () => {
    const root = Injector.create({ providers: [] });
    assert.equal(root.parent, null);

    const child = Injector.create({ providers: [], parent: root });
    assert.equal(child.parent, root);
  });

  it("name getter", () => {
    const injector = Injector.create({ providers: [], name: "app" });
    assert.equal(injector.name, "app");

    const child = Injector.create({
      providers: [],
      parent: injector,
      name: "request",
    });
    assert.equal(child.name, "request");
  });

  it("default names", () => {
    const root = Injector.create({ providers: [] });
    assert.equal(root.name, "root");

    const child = Injector.create({ providers: [], parent: root });
    assert.equal(child.name, "root.child");
  });

  it("disposed false on fresh injector", () => {
    const injector = Injector.create({ providers: [] });
    assert.equal(injector.disposed, false);
  });
});

describe("injector tree — token lookup via resolve", TEST_OPTIONS, () => {
  it("resolves local binding", () => {
    const T = new InjectionToken<number>("T");
    const injector = Injector.create({
      providers: [{ provide: T, useValue: 1 }],
    });
    assert.equal(injector.resolve(T, { optional: true }), 1);
  });

  it("returns null for unknown token", () => {
    const T = new InjectionToken<number>("T");
    const injector = Injector.create({ providers: [] });
    assert.equal(injector.resolve(T, { optional: true }), null);
  });

  it("resolves via parent", () => {
    const T = new InjectionToken<number>("T");
    const root = Injector.create({ providers: [{ provide: T, useValue: 1 }] });
    const child = Injector.create({ providers: [], parent: root });
    assert.equal(child.resolve(T, { optional: true }), 1);
  });

  it("resolves via distant ancestor", () => {
    const T = new InjectionToken("T");
    const root = Injector.create({ providers: [{ provide: T, useValue: 1 }] });
    const grandchild = Injector.create({
      providers: [],
      parent: Injector.create({ providers: [], parent: root }),
    });
    assert.equal(grandchild.resolve(T, { optional: true }), 1);
  });

  it("returns null when not in chain", () => {
    const T = new InjectionToken<number>("T");
    const root = Injector.create({ providers: [] });
    const child = Injector.create({ providers: [], parent: root });
    const grand = Injector.create({ providers: [], parent: child });
    assert.equal(grand.resolve(T, { optional: true }), null);
  });
});

describe("injector tree — disposed-ancestor walk", TEST_OPTIONS, () => {
  it("resolve() throws on disposed self", async () => {
    const T = new InjectionToken<number>("T");
    const injector = Injector.create({
      providers: [{ provide: T, useValue: 1 }],
    });
    await injector.dispose();
    assert.throws(() => injector.resolve(T), InjectorDisposedError);
  });

  it("resolve() throws via disposed ancestor", async () => {
    const T = new InjectionToken<number>("T");
    const root = Injector.create({ providers: [{ provide: T, useValue: 1 }] });
    const child = Injector.create({ providers: [], parent: root });

    await root.dispose();

    assert.equal(child.disposed, false);
    assert.throws(() => child.resolve(T), InjectorDisposedError);
  });

  it("resolve() throws via disposed grandparent", async () => {
    const T = new InjectionToken<number>("T");
    const root = Injector.create({ providers: [{ provide: T, useValue: 1 }] });
    const mid = Injector.create({ providers: [], parent: root });
    const leaf = Injector.create({ providers: [], parent: mid });
    await root.dispose();
    assert.throws(() => leaf.resolve(T), InjectorDisposedError);
  });

  it("resolve() short-circuits on local hit before disposed ancestor", async () => {
    const T = new InjectionToken<number>("T");
    const root = Injector.create({ providers: [] });
    const child = Injector.create({
      providers: [{ provide: T, useValue: 1 }],
      parent: root,
    });
    await root.dispose();
    assert.equal(child.resolve(T), 1);
  });
});
