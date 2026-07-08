import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InjectionToken, Injector } from "../index.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("disposal — explicit resource management", TEST_OPTIONS, () => {
  it("await using triggers asyncDispose at block exit", async () => {
    let disposed = false;
    class R {
      [Symbol.dispose]() {
        disposed = true;
      }
    }
    {
      await using injector = Injector.create({
        providers: [{ provide: R, useClass: R }],
      });
      injector.resolve(R);
    }
    assert.equal(disposed, true);
  });

  it("await using propagates AggregateError when disposers throw", async () => {
    class A {
      [Symbol.dispose]() {
        throw new Error("a-fail");
      }
    }
    class B {
      [Symbol.dispose]() {
        throw new Error("b-fail");
      }
    }
    await assert.rejects(
      async () => {
        await using injector = Injector.create({
          providers: [
            { provide: A, useClass: A },
            { provide: B, useClass: B },
          ],
        });
        injector.resolve(A);
        injector.resolve(B);
      },
      (err: unknown) => {
        assert.ok(err instanceof AggregateError);
        assert.equal(err.errors.length, 2);
        return true;
      },
    );
  });

  it("useValue disposable is not disposed", async () => {
    let disposed = false;
    const RES = new InjectionToken<{ [Symbol.dispose](): void }>("RES");
    const res = {
      [Symbol.dispose]() {
        disposed = true;
      },
    };
    {
      await using injector = Injector.create({
        providers: [{ provide: RES, useValue: res }],
      });
      injector.resolve(RES);
    }
    assert.equal(disposed, false);
  });
});
