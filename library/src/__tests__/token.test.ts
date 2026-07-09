import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TokenNotFoundError } from "../errors.ts";
import { Injector } from "../injector.ts";
import { InjectionToken, tokenName } from "../token.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("InjectionToken — identity & toString", TEST_OPTIONS, () => {
  it("toString includes the description", () => {
    const T = new InjectionToken<number>("API_URL");
    assert.equal(T.toString(), "InjectionToken(API_URL)");
  });

  it("exposes the description via the readonly field", () => {
    const T = new InjectionToken<number>("ID");
    assert.equal(T.description, "ID");
  });

  it("two tokens with the same description are distinct identities", () => {
    const A = new InjectionToken<number>("dup");
    const B = new InjectionToken<number>("dup");
    assert.notEqual(A, B);

    const injector = Injector.create({
      providers: [{ provide: A, useValue: 1 }],
    });
    assert.equal(injector.resolve(A), 1);
    assert.throws(() => injector.resolve(B), TokenNotFoundError);
  });
});

describe("tokenName — human-readable name", TEST_OPTIONS, () => {
  it("uses InjectionToken.toString() for InjectionToken inputs", () => {
    const T = new InjectionToken<number>("CONFIG");
    assert.equal(tokenName(T), "InjectionToken(CONFIG)");
  });

  it("uses the class .name for class tokens", () => {
    class Service {}
    assert.equal(tokenName(Service), "Service");
  });

  it("falls back to String(token) when class .name is empty", () => {
    const Anon = new Function("return class {}")() as new (
      ...args: never[]
    ) => unknown;
    assert.equal(tokenName(Anon), String(Anon));
  });

  it("falls back to String(token) instead of throwing for null", () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentionally invalid token
    assert.equal(tokenName(null as any), "null");
  });

  it("falls back to String(token) instead of throwing for undefined", () => {
    // biome-ignore lint/suspicious/noExplicitAny: intentionally invalid token
    assert.equal(tokenName(undefined as any), "undefined");
  });
});
