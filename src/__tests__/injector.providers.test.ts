import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InjectionToken, Injector, inject } from "../index.ts";
import { Counter } from "./helpers.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("useValue — identity", TEST_OPTIONS, () => {
  it("returns exact object reference", () => {
    const obj = { id: Symbol("v") };
    const T = new InjectionToken<typeof obj>("T");
    const scope = Injector.create({
      providers: [{ provide: T, useValue: obj }],
    });
    assert.equal(scope.resolve(T), obj);
    assert.equal(
      scope.resolve(T),
      obj,
      "repeated resolve() yields the same reference",
    );
  });

  it("carries primitive values faithfully", () => {
    const T = new InjectionToken<string>("T");
    const scope = Injector.create({
      providers: [{ provide: T, useValue: "literal" }],
    });
    assert.equal(scope.resolve(T), "literal");
  });
});

describe("useClass — instantiation", TEST_OPTIONS, () => {
  it("resolves class via new Class()", () => {
    class Logger {
      label = "log";
    }
    const scope = Injector.create({
      providers: [{ provide: Logger, useClass: Logger, lifetime: "singleton" }],
    });
    const logger = scope.resolve(Logger);
    assert.ok(logger instanceof Logger);
    assert.equal(logger.label, "log");
  });

  it("abstract maps to concrete impl", () => {
    abstract class Repo {
      abstract find(): string;
    }
    class SqlRepo extends Repo {
      find(): string {
        return "sql";
      }
    }
    const scope = Injector.create({
      providers: [{ provide: Repo, useClass: SqlRepo, lifetime: "singleton" }],
    });
    const repo = scope.resolve(Repo);
    assert.ok(repo instanceof SqlRepo);
    assert.equal(repo.find(), "sql");
  });

  it("constructs with no arguments", () => {
    let argCount = -1;
    class Service {
      constructor(...args: never[]) {
        argCount = args.length;
      }
    }
    const scope = Injector.create({
      providers: [{ provide: Service, useClass: Service }],
    });
    scope.resolve(Service);
    assert.equal(argCount, 0);
  });
});

describe("useClass — shorthand", TEST_OPTIONS, () => {
  it("resolves a bare class via new Class()", () => {
    class Logger {
      label = "log";
    }
    const scope = Injector.create({ providers: [Logger] });
    const logger = scope.resolve(Logger);
    assert.ok(logger instanceof Logger);
    assert.equal(logger.label, "log");
  });

  it("defaults to Singleton — repeated resolve yields same instance", () => {
    class Service {}
    const scope = Injector.create({ providers: [Service] });
    assert.equal(scope.resolve(Service), scope.resolve(Service));
  });

  it("behaves identically to { provide, useClass } self-bind", () => {
    class A {}
    class B {}
    const shorthand = Injector.create({ providers: [A] });
    const verbose = Injector.create({
      providers: [{ provide: B, useClass: B }],
    });
    assert.ok(shorthand.resolve(A) instanceof A);
    assert.ok(verbose.resolve(B) instanceof B);
  });

  it("works as an inject() dependency of another provider", () => {
    class Dep {
      value = "dep";
    }
    class Consumer {
      dep = inject(Dep);
    }
    const scope = Injector.create({ providers: [Dep, Consumer] });
    const consumer = scope.resolve(Consumer);
    assert.ok(consumer.dep instanceof Dep);
    assert.equal(consumer.dep.value, "dep");
    assert.equal(
      consumer.dep,
      scope.resolve(Dep),
      "shorthand singleton shared with direct resolve",
    );
  });

  it("mixes with other provider forms in one array", () => {
    const T = new InjectionToken<string>("T");
    class Svc {}
    const scope = Injector.create({
      providers: [Svc, { provide: T, useValue: "v" }],
    });
    assert.ok(scope.resolve(Svc) instanceof Svc);
    assert.equal(scope.resolve(T), "v");
  });

  it("a later verbose binding overrides the shorthand", () => {
    class Base {
      kind = "base";
    }
    class Special extends Base {
      override kind = "special";
    }
    const scope = Injector.create({
      providers: [Base, { provide: Base, useClass: Special }],
    });
    assert.equal(scope.resolve(Base).kind, "special");
  });

  it("child can override an inherited shorthand binding", () => {
    class Svc {
      label = "root";
    }
    class ChildSvc extends Svc {
      override label = "child";
    }
    const root = Injector.create({ providers: [Svc] });
    const child = Injector.create({
      providers: [{ provide: Svc, useClass: ChildSvc }],
      parent: root,
    });
    assert.equal(root.resolve(Svc).label, "root");
    assert.equal(child.resolve(Svc).label, "child");
  });
});

describe("useExisting — alias collapse", TEST_OPTIONS, () => {
  it("chained aliases collapse to one instance", () => {
    const Real = new InjectionToken<object>("real");
    const A = new InjectionToken<object>("a");
    const B = new InjectionToken<object>("b");
    const counter = new Counter();
    const scope = Injector.create({
      providers: [
        {
          provide: Real,
          useFactory: () => {
            counter.hit();
            return {};
          },
          lifetime: "singleton",
        },
        { provide: A, useExisting: Real },
        { provide: B, useExisting: A },
      ],
    });

    const all = [scope.resolve(Real), scope.resolve(A), scope.resolve(B)];
    assert.equal(new Set(all).size, 1, "all aliases collapse to one instance");
    assert.equal(counter.count, 1);
  });

  it("A->B->C class alias resolves to underlying", () => {
    class C {}
    const A = new InjectionToken<C>("A");
    const B = new InjectionToken<C>("B");
    const scope = Injector.create({
      providers: [
        { provide: C, useClass: C },
        { provide: B, useExisting: C },
        { provide: A, useExisting: B },
      ],
    });
    assert.equal(scope.resolve(A), scope.resolve(C));
  });

  it("token alias to class yields same instance", () => {
    class ICache {
      get(_: string): unknown {
        return null;
      }
    }
    class MemCache extends ICache {
      override get(_: string) {
        return "mem";
      }
    }
    const scope = Injector.create({
      providers: [
        { provide: MemCache, useClass: MemCache },
        { provide: ICache, useExisting: MemCache },
      ],
    });
    const a = scope.resolve(ICache);
    const b = scope.resolve(MemCache);
    assert.equal(a, b);
    assert.ok(a instanceof MemCache);
  });
});

describe("registration — sealed + overrides", TEST_OPTIONS, () => {
  it("no register()/bind() exposed", () => {
    const scope = Injector.create({ providers: [] });
    const asRecord = scope as unknown as Record<string, unknown>;
    assert.equal(typeof asRecord.register, "undefined");
    assert.equal(typeof asRecord.bind, "undefined");
  });

  it("last duplicate wins silently", () => {
    const T = new InjectionToken<string>("T");
    let scope!: Injector;
    assert.doesNotThrow(() => {
      scope = Injector.create({
        providers: [
          { provide: T, useValue: "first" },
          { provide: T, useValue: "last" },
        ],
      });
    });
    assert.equal(scope.resolve(T), "last");
  });

  it("child override propagates to descendants", () => {
    const T = new InjectionToken<string>("T");
    const root = Injector.create({
      providers: [{ provide: T, useValue: "root" }],
    });
    const child = Injector.create({
      providers: [{ provide: T, useValue: "child" }],
      parent: root,
    });
    const grandchild = Injector.create({ providers: [], parent: child });

    assert.equal(root.resolve(T), "root", "parent binding is unaffected");
    assert.equal(child.resolve(T), "child", "child sees its own override");
    assert.equal(
      grandchild.resolve(T),
      "child",
      "descendants inherit the override",
    );
  });

  it("child override can change lifetime", () => {
    const T = new InjectionToken<object>("T");
    const root = Injector.create({
      providers: [
        { provide: T, useFactory: () => ({}), lifetime: "singleton" },
      ],
    });
    const child = Injector.create({
      providers: [
        { provide: T, useFactory: () => ({}), lifetime: "transient" },
      ],
      parent: root,
    });
    const a = child.resolve(T);
    const b = child.resolve(T);
    assert.notEqual(a, b);
  });
});

describe("providers — invalid", TEST_OPTIONS, () => {
  it("malformed provider throws TypeError", () => {
    const T = new InjectionToken<number>("T");
    // biome-ignore lint/suspicious/noExplicitAny: intentionally malformed
    const bad = { provide: T } as any;
    assert.throws(
      () => Injector.create({ providers: [bad] }).resolve(T),
      TypeError,
    );
  });
});
