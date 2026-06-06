import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Injector } from "../injector.ts";
import { InjectionToken } from "../token.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("Injector — toString", TEST_OPTIONS, () => {
  it("summarizes name, binding count, disposed flag, and null parent", () => {
    const TOKEN = new InjectionToken<number>("PORT");
    const injector = Injector.create({
      name: "app",
      providers: [{ provide: TOKEN, useValue: 8080 }],
    });

    assert.equal(
      injector.toString(),
      "Injector(app) { bindings: 1, disposed: false, parent: null }",
    );
  });

  it("shows the parent's name for a child injector", () => {
    const app = Injector.create({ name: "app", providers: [] });
    const child = Injector.create({ name: "req", parent: app, providers: [] });

    assert.equal(
      child.toString(),
      "Injector(req) { bindings: 0, disposed: false, parent: app }",
    );
  });

  it("reflects disposed state and cleared bindings after dispose()", async () => {
    const TOKEN = new InjectionToken<number>("N");
    const injector = Injector.create({
      name: "root",
      providers: [{ provide: TOKEN, useValue: 1 }],
    });
    await injector.dispose();

    assert.equal(
      injector.toString(),
      "Injector(root) { bindings: 0, disposed: true, parent: null }",
    );
  });

  it("interpolates in template strings", () => {
    const injector = Injector.create({ name: "app", providers: [] });
    assert.equal(`${injector}`, injector.toString());
  });
});
