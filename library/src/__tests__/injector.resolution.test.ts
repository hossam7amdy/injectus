import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import {
  InjectionToken,
  Injector,
  InjectorDisposedError,
  inject,
  Lifetime,
  TokenNotFoundError,
} from "../index.ts";
import { Counter } from "./helpers.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("resolution — synchronous contract", TEST_OPTIONS, () => {
  it("returns plain value, never thenable", () => {
    const T = new InjectionToken<{ v: number }>("svc");
    const injector = Injector.create({
      providers: [{ provide: T, useValue: { v: 1 } }],
    });

    const result = injector.resolve(T);

    assert.equal(result instanceof Promise, false);
    assert.notEqual(typeof result, "function");
    assert.equal(
      typeof (result as { then?: unknown }).then,
      "undefined",
      "resolved value must not be thenable",
    );
    assert.deepEqual(result, { v: 1 });
  });

  it("useFactory runs synchronously during resolve()", () => {
    const T = new InjectionToken<number>("T");
    let ran = false;
    const injector = Injector.create({
      providers: [
        {
          provide: T,
          useFactory: () => {
            ran = true;
            return 42;
          },
          lifetime: "singleton",
        },
      ],
    });

    assert.equal(ran, false, "factory must not run before resolve()");
    const value = injector.resolve(T);
    assert.equal(
      ran,
      true,
      "factory must have run synchronously inside resolve()",
    );
    assert.equal(value, 42);
  });

  it("does not await async setup", () => {
    class Connection {
      ready = false;
      readonly init: Promise<void> = (async () => {
        await sleep();
        this.ready = true;
      })();
    }
    const injector = Injector.create({
      providers: [
        { provide: Connection, useClass: Connection, lifetime: "singleton" },
      ],
    });

    const conn = injector.resolve(Connection);
    assert.equal(conn.ready, false);
  });
});

describe("resolution — inject() in factories & fields", TEST_OPTIONS, () => {
  it("resolves inject() inside factory", () => {
    const CONFIG = new InjectionToken<{ url: string }>("CONFIG");
    class Client {
      url: string;
      constructor(url: string) {
        this.url = url;
      }
    }
    const injector = Injector.create({
      providers: [
        { provide: CONFIG, useValue: { url: "https://example.com" } },
        {
          provide: Client,
          useFactory: () => new Client(inject(CONFIG).url),
        },
      ],
    });
    assert.equal(injector.resolve(Client).url, "https://example.com");
  });

  it("resolves inject() in class field", () => {
    class Logger {
      log(_: string) {}
    }
    class Service {
      logger = inject(Logger);
    }
    const injector = Injector.create({
      providers: [
        { provide: Logger, useClass: Logger },
        { provide: Service, useClass: Service },
      ],
    });
    const svc = injector.resolve(Service);
    assert.ok(svc.logger instanceof Logger);
  });

  it("resolves transitively through nested factories", () => {
    const C = new InjectionToken<string>("c");
    const B = new InjectionToken<{ c: string }>("b");
    const A = new InjectionToken<{ b: { c: string } }>("a");
    const injector = Injector.create({
      providers: [
        { provide: C, useValue: "leaf" },
        {
          provide: B,
          useFactory: () => ({ c: inject(C) }),
          lifetime: "singleton",
        },
        {
          provide: A,
          useFactory: () => ({ b: inject(B) }),
          lifetime: "singleton",
        },
      ],
    });
    assert.equal(injector.resolve(A).b.c, "leaf");
  });
});

describe("resolution — unknown token", TEST_OPTIONS, () => {
  it("throws on unregistered token", () => {
    const injector = Injector.create({ providers: [] });
    assert.throws(
      () => injector.resolve(new InjectionToken("missing")),
      TokenNotFoundError,
    );
  });

  it("optional returns null for unregistered", () => {
    const injector = Injector.create({ providers: [] });
    assert.equal(
      injector.resolve(new InjectionToken("missing"), { optional: true }),
      null,
    );
  });

  it("optional returns value for registered", () => {
    const T = new InjectionToken<number>("T");
    const injector = Injector.create({
      providers: [{ provide: T, useValue: 7 }],
    });
    assert.equal(injector.resolve(T, { optional: true }), 7);
  });

  it("optional resolve reflects registration", () => {
    const Known = new InjectionToken("K");
    const Unknown = new InjectionToken("U");
    const injector = Injector.create({
      providers: [{ provide: Known, useValue: 1 }],
    });
    assert.notEqual(injector.resolve(Known, { optional: true }), null);
    assert.equal(injector.resolve(Unknown, { optional: true }), null);
  });

  it("throws on unregistered class token", () => {
    class Unregistered {}
    const injector = Injector.create({ providers: [] });
    assert.throws(() => injector.resolve(Unregistered), TokenNotFoundError);
  });
});

describe("resolution — inject() and optional", TEST_OPTIONS, () => {
  it("optional returns null for missing", () => {
    const Missing = new InjectionToken<number>("missing");
    const Svc = new InjectionToken<{ dep: number | null }>("svc");
    const injector = Injector.create({
      providers: [
        {
          provide: Svc,
          useFactory: () => ({ dep: inject(Missing, { optional: true }) }),
          lifetime: "singleton",
        },
      ],
    });
    assert.equal(injector.resolve(Svc).dep, null);
  });

  it("optional propagates through alias", () => {
    const Missing = new InjectionToken<number>("Missing");
    const Alias = new InjectionToken<number>("Alias");
    const injector = Injector.create({
      providers: [{ provide: Alias, useExisting: Missing }],
    });
    assert.equal(injector.resolve(Alias, { optional: true }), null);
  });

  it("non-optional alias throws on missing target", () => {
    const Missing = new InjectionToken<number>("Missing");
    const Alias = new InjectionToken<number>("Alias");
    const injector = Injector.create({
      providers: [{ provide: Alias, useExisting: Missing }],
    });
    assert.throws(() => injector.resolve(Alias), TokenNotFoundError);
  });
});

describe("resolution — ancestor walk & shadowing", TEST_OPTIONS, () => {
  it("child resolves parent binding", () => {
    const T = new InjectionToken<number>("T");
    const root = Injector.create({ providers: [{ provide: T, useValue: 99 }] });
    const child = Injector.create({ providers: [], parent: root });
    assert.equal(child.resolve(T), 99);
  });

  it("grandchild resolves grandparent singleton", () => {
    class Logger {}
    const root = Injector.create({
      providers: [{ provide: Logger, useClass: Logger }],
    });
    const child = Injector.create({ providers: [], parent: root });
    const grand = Injector.create({ providers: [], parent: child });
    const a = grand.resolve(Logger);
    const b = root.resolve(Logger);
    assert.equal(a, b);
  });

  it("child shadow leaves parent untouched", () => {
    class Logger {
      name = "real";
    }
    class FakeLogger {
      name = "fake";
    }
    const root = Injector.create({
      providers: [{ provide: Logger, useClass: Logger }],
    });
    const child = Injector.create({
      providers: [{ provide: Logger, useClass: FakeLogger }],
      parent: root,
    });
    assert.equal(child.resolve(Logger).name, "fake");
    assert.equal(root.resolve(Logger).name, "real");
  });

  it("mid-tier shadow wins over grandparent", () => {
    const T = new InjectionToken<string>("T");
    const root = Injector.create({
      providers: [{ provide: T, useValue: "root" }],
    });
    const mid = Injector.create({
      providers: [{ provide: T, useValue: "mid" }],
      parent: root,
    });
    const leaf = Injector.create({ providers: [], parent: mid });
    assert.equal(leaf.resolve(T), "mid");
  });

  it("scoped caches on resolving injector", () => {
    class S {}
    const root = Injector.create({
      providers: [{ provide: S, useClass: S, lifetime: Lifetime.Scoped }],
    });
    const child = Injector.create({ providers: [], parent: root });
    const grand = Injector.create({ providers: [], parent: child });
    const a = grand.resolve(S);
    const b = grand.resolve(S);
    const c = child.resolve(S);
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});

describe("resolution — singleton owner-view", TEST_OPTIONS, () => {
  it("parent singleton's deps resolve from owner, not caller", () => {
    class Dep {
      name = "real";
    }
    class FakeDep {
      name = "fake";
    }
    class Service {
      dep = inject(Dep);
    }
    const root = Injector.create({
      providers: [
        { provide: Service, useClass: Service },
        { provide: Dep, useClass: Dep },
      ],
    });
    const child = Injector.create({
      providers: [{ provide: Dep, useClass: FakeDep }],
      parent: root,
    });

    assert.equal(child.resolve(Service).dep.name, "real");
    assert.equal(root.resolve(Service).dep.name, "real");
  });

  it("no sibling poisoning after child-first resolve", () => {
    class Dep {
      name = "real";
    }
    class FakeDep {
      name = "fake";
    }
    class Service {
      dep = inject(Dep);
    }
    const root = Injector.create({
      providers: [
        { provide: Service, useClass: Service },
        { provide: Dep, useClass: Dep },
      ],
    });
    const a = Injector.create({
      providers: [{ provide: Dep, useClass: FakeDep }],
      parent: root,
    });
    a.resolve(Service);
    const b = Injector.create({ providers: [], parent: root });
    assert.equal(b.resolve(Service).dep.name, "real");
  });

  it("singleton identity stable across resolvers", () => {
    class Dep {}
    class Service {
      dep = inject(Dep);
    }
    const root = Injector.create({
      providers: [
        { provide: Service, useClass: Service },
        { provide: Dep, useClass: Dep },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });
    assert.equal(root.resolve(Service), child.resolve(Service));
  });

  it("useExisting alias under shadowing child does not poison target", () => {
    class Dep {
      name = "real";
    }
    class FakeDep {
      name = "fake";
    }
    class Target {
      dep = inject(Dep);
    }
    const ALIAS = new InjectionToken<Target>("alias");
    const root = Injector.create({
      providers: [
        { provide: Target, useClass: Target },
        { provide: Dep, useClass: Dep },
        { provide: ALIAS, useExisting: Target },
      ],
    });
    const child = Injector.create({
      providers: [{ provide: Dep, useClass: FakeDep }],
      parent: root,
    });

    assert.equal(child.resolve(ALIAS).dep.name, "real");
    assert.equal(root.resolve(Target).dep.name, "real");
  });

  it("child-defined singleton sees child's own shadowed deps", () => {
    class Dep {
      name = "real";
    }
    class FakeDep {
      name = "fake";
    }
    class Service {
      dep = inject(Dep);
    }
    const root = Injector.create({
      providers: [{ provide: Dep, useClass: Dep }],
    });
    const child = Injector.create({
      providers: [
        { provide: Service, useClass: Service },
        { provide: Dep, useClass: FakeDep },
      ],
      parent: root,
    });
    assert.equal(child.resolve(Service).dep.name, "fake");
  });
});

describe("resolution — alias re-dispatch", TEST_OPTIONS, () => {
  it("re-dispatches via calling injector", () => {
    class A {
      kind = "root";
    }
    class B extends A {
      override kind = "child";
    }
    const ITarget = new InjectionToken<A>("ITarget");
    const root = Injector.create({
      providers: [
        { provide: A, useClass: A },
        { provide: ITarget, useExisting: A },
      ],
    });
    const child = Injector.create({
      providers: [{ provide: A, useClass: B }],
      parent: root,
    });

    assert.equal(child.resolve(A).kind, "child");
    assert.equal(child.resolve(ITarget).kind, "child");
  });

  it("scoped alias resolves from child", () => {
    class Svc {
      kind = "scoped";
    }
    const IAlias = new InjectionToken<Svc>("IAlias");
    const root = Injector.create({
      providers: [
        { provide: Svc, useClass: Svc, lifetime: Lifetime.Scoped },
        { provide: IAlias, useExisting: Svc },
      ],
    });
    const child = Injector.create({ providers: [], parent: root });

    const instance = child.resolve(IAlias);
    assert.ok(instance instanceof Svc);
    assert.equal(child.resolve(IAlias), instance);
  });

  it("child alias shadows root alias", () => {
    class A {
      kind = "rootA";
    }
    class B {
      kind = "childB";
    }
    const ITarget = new InjectionToken<{ kind: string }>("ITarget");
    const root = Injector.create({
      providers: [
        { provide: A, useClass: A },
        { provide: ITarget, useExisting: A },
      ],
    });
    const child = Injector.create({
      providers: [
        { provide: B, useClass: B },
        { provide: ITarget, useExisting: B },
      ],
      parent: root,
    });
    assert.equal(child.resolve(ITarget).kind, "childB");
    assert.equal(root.resolve(ITarget).kind, "rootA");
  });

  it("constructs target once across aliases", () => {
    const Real = new InjectionToken<object>("real");
    const Alias = new InjectionToken<object>("alias");
    const counter = new Counter();
    const injector = Injector.create({
      providers: [
        {
          provide: Real,
          useFactory: () => {
            counter.hit();
            return {};
          },
          lifetime: "singleton",
        },
        { provide: Alias, useExisting: Real },
      ],
    });

    const viaAlias = injector.resolve(Alias);
    const viaReal = injector.resolve(Real);

    assert.equal(viaAlias, viaReal);
    assert.equal(counter.count, 1);
  });
});

describe("resolution — through disposed ancestors", TEST_OPTIONS, () => {
  it("alias throws via disposed parent", async () => {
    class C {}
    const A = new InjectionToken<C>("A");
    const root = Injector.create({
      providers: [{ provide: C, useClass: C }],
    });
    const child = Injector.create({
      providers: [{ provide: A, useExisting: C }],
      parent: root,
    });
    await root.dispose();
    assert.throws(() => child.resolve(A), InjectorDisposedError);
  });

  it("throws via disposed grandparent", async () => {
    class S {}
    const root = Injector.create({ providers: [{ provide: S, useClass: S }] });
    const mid = Injector.create({ providers: [], parent: root });
    const leaf = Injector.create({ providers: [], parent: mid });
    await root.dispose();
    assert.throws(() => leaf.resolve(S), InjectorDisposedError);
  });
});
