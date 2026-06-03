import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isDisposable } from "../disposable.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("isDisposable", TEST_OPTIONS, () => {
  it("returns false for null", () => {
    assert.equal(isDisposable(null), false);
  });

  it("returns false for undefined", () => {
    assert.equal(isDisposable(undefined), false);
  });
});
