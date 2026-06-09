import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compose,
  defineModule,
  InjectionToken,
  Injector,
  type Module,
  ModuleCycleError,
} from "../index.ts";
import { Counter, DisposeTracker } from "./helpers.ts";
import { TEST_OPTIONS } from "./test.config.ts";

describe("compose — basics", TEST_OPTIONS, () => {
  it("composes a single module and resolves its provider", async () => {
    const T = new InjectionToken<number>("T");
    const M = defineModule({
      name: "m",
      setup: () => [{ provide: T, useValue: 1 }],
    });
    const app = await compose(M);
    assert.equal(app.injector.resolve(T), 1);
    await app.dispose();
  });

  it("async setup: an awaited value is registered and resolvable", async () => {
    const CONFIG = new InjectionToken<{ url: string }>("CONFIG");
    const M = defineModule({
      name: "config",
      setup: async () => {
        const config = await Promise.resolve({ url: "db://x" });
        return [{ provide: CONFIG, useValue: config }];
      },
    });
    const app = await compose(M);
    assert.deepEqual(app.injector.resolve(CONFIG), { url: "db://x" });
    await app.dispose();
  });

  it("composes an anonymous module (no name)", async () => {
    const T = new InjectionToken<number>("T");
    const M = defineModule({ setup: () => [{ provide: T, useValue: 7 }] });
    const app = await compose(M);
    assert.equal(app.injector.resolve(T), 7);
    await app.dispose();
  });

  it("composes a module that omits setup (contributes no providers)", async () => {
    const T = new InjectionToken<number>("T");
    const Leaf = defineModule({
      name: "leaf",
      setup: () => [{ provide: T, useValue: 5 }],
    });
    const Aggregator = defineModule({ name: "agg", imports: [Leaf] }); // no setup
    const app = await compose(Aggregator);
    assert.equal(app.injector.resolve(T), 5);
    await app.dispose();
  });

  it("allows a non-disposable useValue alongside classes and factories", async () => {
    class Svc {}
    const T = new InjectionToken<number>("T");
    const F = new InjectionToken<number>("F");
    const M = defineModule({
      name: "mixed",
      setup: () => [
        Svc,
        { provide: F, useFactory: () => 42 },
        { provide: T, useValue: 1 },
      ],
    });
    const app = await compose(M);
    assert.ok(app.injector.resolve(Svc) instanceof Svc);
    assert.equal(app.injector.resolve(F), 42);
    assert.equal(app.injector.resolve(T), 1);
    await app.dispose(); // non-disposable useValue passes the guard, disposes nothing
  });
});

describe("compose — imports", TEST_OPTIONS, () => {
  it("a setup resolves an imported module's value", async () => {
    const CONFIG = new InjectionToken<{ dbUrl: string }>("CONFIG");
    const POOL = new InjectionToken<string>("POOL");

    const ConfigModule = defineModule({
      name: "config",
      setup: () => [{ provide: CONFIG, useValue: { dbUrl: "pg://h" } }],
    });
    const DbModule = defineModule({
      name: "db",
      imports: [ConfigModule],
      setup: (injector) => {
        const cfg = injector.resolve(CONFIG);
        return [{ provide: POOL, useValue: `pool(${cfg.dbUrl})` }];
      },
    });

    const app = await compose(DbModule);
    assert.equal(app.injector.resolve(POOL), "pool(pg://h)");
    assert.deepEqual(app.injector.resolve(CONFIG), { dbUrl: "pg://h" });
    await app.dispose();
  });

  it("dedups a diamond — the shared module runs once", async () => {
    const counter = new Counter();
    const FLAG = new InjectionToken<number>("FLAG");

    const Shared = defineModule({
      name: "shared",
      setup: () => [{ provide: FLAG, useValue: counter.hit() }],
    });
    const B = defineModule({ name: "b", imports: [Shared], setup: () => [] });
    const C = defineModule({ name: "c", imports: [Shared], setup: () => [] });
    const App = defineModule({ name: "app", imports: [B, C], setup: () => [] });

    const app = await compose(App);
    assert.equal(counter.count, 1);
    assert.equal(app.injector.resolve(FLAG), 1);
    await app.dispose();
  });

  it("an importer shadows a token its import also provides", async () => {
    const T = new InjectionToken<string>("T");
    const Base = defineModule({
      name: "base",
      setup: () => [{ provide: T, useValue: "base" }],
    });
    const Over = defineModule({
      name: "over",
      imports: [Base],
      setup: () => [{ provide: T, useValue: "over" }],
    });
    const app = await compose(Over);
    assert.equal(app.injector.resolve(T), "over");
    await app.dispose();
  });
});

describe("compose — cycles", TEST_OPTIONS, () => {
  it("throws ModuleCycleError on a cycle, rendering the path", async () => {
    // Build the cycle directly — defineModule defensively copies imports.
    const a = {
      name: "a",
      global: false,
      imports: [] as Module[],
      setup: () => [],
    };
    const b = {
      name: "b",
      global: false,
      imports: [a] as Module[],
      setup: () => [],
    };
    a.imports.push(b);

    await assert.rejects(
      () => compose(a as Module),
      (error: unknown) => {
        assert.ok(error instanceof ModuleCycleError);
        assert.match(error.message, /Circular module imports: a -> b -> a\./);
        return true;
      },
    );
  });

  it("ignores caller mutation of the imports array after defineModule", async () => {
    const T = new InjectionToken<number>("T");
    const imports: Module[] = [];
    const M = defineModule({
      name: "m",
      imports,
      setup: () => [{ provide: T, useValue: 1 }],
    });
    const Sneaky = defineModule({ name: "sneaky", setup: () => [] });
    imports.push(Sneaky); // must not enter M's graph

    const app = await compose(M);
    assert.equal(app.injector.resolve(T), 1);
    await app.dispose();
  });
});

describe("compose — disposal", TEST_OPTIONS, () => {
  it("rejects a disposable returned as useValue", async () => {
    const tracker = new DisposeTracker();
    const POOL = new InjectionToken("POOL");
    const M = defineModule({
      name: "leaky",
      setup: () => [
        { provide: POOL, useValue: tracker.asyncDisposable("pool") },
      ],
    });
    await assert.rejects(
      () => compose(M),
      (error: unknown) => {
        assert.ok(error instanceof TypeError);
        assert.match(
          error.message,
          /Module "leaky" provides a disposable as useValue/,
        );
        return true;
      },
    );
  });

  it("disposes chain links tip-first", async () => {
    const tracker = new DisposeTracker();
    const POOL = new InjectionToken("POOL");
    const SVC = new InjectionToken("SVC");

    const DbModule = defineModule({
      name: "db",
      setup: () => [
        { provide: POOL, useFactory: () => tracker.asyncDisposable("pool") },
      ],
    });
    const AppModule = defineModule({
      name: "app",
      imports: [DbModule],
      setup: () => [
        { provide: SVC, useFactory: () => tracker.asyncDisposable("svc") },
      ],
    });

    const app = await compose(AppModule);
    app.injector.resolve(SVC);
    app.injector.resolve(POOL);

    await app.dispose();

    assert.equal(tracker.disposeCountOf("svc"), 1);
    assert.equal(tracker.disposeCountOf("pool"), 1);
    assert.deepEqual(tracker.leaked(), []);
    assert.ok(tracker.wasSequential);
    // app link (svc) tears down before db link (pool)
    assert.deepEqual(tracker.startOrder, ["svc", "pool"]);
  });

  it("disposes a dependent module's resource before its dependency's", async () => {
    const tracker = new DisposeTracker();
    const CONN = new InjectionToken("CONN");
    const CLIENT = new InjectionToken("CLIENT");

    const DepModule = defineModule({
      name: "dep",
      setup: () => [
        { provide: CONN, useFactory: () => tracker.asyncDisposable("conn") },
      ],
    });
    const AppModule = defineModule({
      name: "app",
      imports: [DepModule],
      setup: (injector) => {
        injector.resolve(CONN); // construct conn on its defining link
        return [
          {
            provide: CLIENT,
            useFactory: () => tracker.asyncDisposable("client"),
          },
        ];
      },
    });

    const app = await compose(AppModule);
    app.injector.resolve(CLIENT);
    await app.dispose();

    assert.equal(tracker.disposeCountOf("client"), 1);
    assert.equal(tracker.disposeCountOf("conn"), 1);
    assert.ok(tracker.wasSequential);
    // dependent (client) tears down before dependency (conn)
    assert.deepEqual(tracker.startOrder, ["client", "conn"]);
  });

  it("disposes same-module resources in reverse construction order", async () => {
    const tracker = new DisposeTracker();
    const POOL = new InjectionToken("POOL");
    const SVC = new InjectionToken("SVC");

    const DbModule = defineModule({
      name: "db",
      setup: () => [
        { provide: POOL, useFactory: () => tracker.asyncDisposable("pool") },
        { provide: SVC, useFactory: () => tracker.asyncDisposable("svc") },
      ],
    });

    const app = await compose(DbModule);
    app.injector.resolve(POOL); // construct pool first
    app.injector.resolve(SVC); // then svc
    await app.dispose();

    assert.equal(tracker.disposeCountOf("svc"), 1);
    assert.equal(tracker.disposeCountOf("pool"), 1);
    // reverse construction order: svc (built last) before pool (built first)
    assert.deepEqual(tracker.startOrder, ["svc", "pool"]);
  });

  it("Symbol.asyncDispose delegates to dispose()", async () => {
    const tracker = new DisposeTracker();
    const SVC = new InjectionToken("SVC");
    const M = defineModule({
      name: "m",
      setup: () => [
        { provide: SVC, useFactory: () => tracker.asyncDisposable("svc") },
      ],
    });
    const app = await compose(M);
    app.injector.resolve(SVC);
    await app[Symbol.asyncDispose]();
    assert.equal(tracker.disposeCountOf("svc"), 1);
  });

  it("dispose is idempotent — second call does not re-dispose", async () => {
    const tracker = new DisposeTracker();
    const POOL = new InjectionToken("POOL");
    const M = defineModule({
      name: "m",
      setup: () => [
        { provide: POOL, useFactory: () => tracker.asyncDisposable("pool") },
      ],
    });
    const app = await compose(M);
    app.injector.resolve(POOL);
    await app.dispose();
    await app.dispose();
    assert.equal(tracker.disposeCountOf("pool"), 1);
    assert.deepEqual(tracker.doubleDisposed(), []);
  });

  it("rolls back earlier resources when a later setup throws", async () => {
    const tracker = new DisposeTracker();
    const POOL = new InjectionToken("POOL");

    const ConfigModule = defineModule({
      name: "config",
      setup: () => [
        { provide: POOL, useFactory: () => tracker.asyncDisposable("pool") },
      ],
    });
    const BadModule = defineModule({
      name: "bad",
      imports: [ConfigModule],
      setup: (injector) => {
        injector.resolve(POOL); // construct so rollback has something to dispose
        throw new Error("boom");
      },
    });

    await assert.rejects(() => compose(BadModule), /boom/);
    assert.equal(tracker.disposeCountOf("pool"), 1); // rolled back
  });

  it("surfaces both setup and rollback errors when rollback also fails", async () => {
    const tracker = new DisposeTracker();
    const POOL = new InjectionToken("POOL");

    const ConfigModule = defineModule({
      name: "config",
      setup: () => [
        {
          provide: POOL,
          useFactory: () =>
            tracker.asyncDisposable("pool", { throwOnDispose: true }),
        },
      ],
    });
    const BadModule = defineModule({
      name: "bad",
      imports: [ConfigModule],
      setup: (injector) => {
        injector.resolve(POOL); // construct so rollback tries (and fails) to dispose
        throw new Error("boom");
      },
    });

    await assert.rejects(
      () => compose(BadModule),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.errors.length, 2);
        assert.match(error.errors[0].message, /boom/); // setup error first
        assert.match(error.errors[1].message, /async dispose failed: pool/);
        return true;
      },
    );
  });

  it("rethrows a single teardown failure as-is", async () => {
    const tracker = new DisposeTracker();
    const POOL = new InjectionToken("POOL");
    const M = defineModule({
      name: "m",
      setup: () => [
        {
          provide: POOL,
          useFactory: () =>
            tracker.asyncDisposable("pool", { throwOnDispose: true }),
        },
      ],
    });
    const app = await compose(M);
    app.injector.resolve(POOL);
    await assert.rejects(() => app.dispose(), /async dispose failed: pool/);
  });

  it("aggregates failures across module links", async () => {
    const tracker = new DisposeTracker();
    const SVC = new InjectionToken("SVC");
    const POOL = new InjectionToken("POOL");

    const DepModule = defineModule({
      name: "dep",
      setup: () => [
        {
          provide: SVC,
          useFactory: () =>
            tracker.asyncDisposable("svc", { throwOnDispose: true }),
        },
      ],
    });
    const AppModule = defineModule({
      name: "app",
      imports: [DepModule],
      setup: () => [
        {
          provide: POOL,
          useFactory: () =>
            tracker.asyncDisposable("pool", { throwOnDispose: true }),
        },
      ],
    });

    const app = await compose(AppModule);
    app.injector.resolve(SVC);
    app.injector.resolve(POOL);
    await assert.rejects(
      () => app.dispose(),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.errors.length, 2);
        return true;
      },
    );
  });
});

describe("compose — parent", TEST_OPTIONS, () => {
  it("inherits a supplied parent and never disposes it", async () => {
    const tracker = new DisposeTracker();
    const BASE = new InjectionToken("BASE");
    const SVC = new InjectionToken("SVC");

    const parent = Injector.create({
      providers: [
        { provide: BASE, useFactory: () => tracker.asyncDisposable("base") },
      ],
    });
    parent.resolve(BASE); // construct in the parent

    const M = defineModule({
      name: "m",
      setup: (injector) => {
        assert.ok(injector.resolve(BASE)); // parent visible during compose
        return [
          { provide: SVC, useFactory: () => tracker.asyncDisposable("svc") },
        ];
      },
    });

    const app = await compose(M, { parent });
    app.injector.resolve(SVC);
    assert.ok(app.injector.resolve(BASE)); // inherited

    await app.dispose();
    assert.equal(tracker.disposeCountOf("svc"), 1);
    assert.equal(tracker.disposeCountOf("base"), 0); // parent untouched

    await parent.dispose();
    assert.equal(tracker.disposeCountOf("base"), 1);
  });

  it("names the owned base root when no parent is supplied", async () => {
    const T = new InjectionToken<number>("T");
    const M = defineModule({
      name: "m",
      setup: () => [{ provide: T, useValue: 1 }],
    });
    const app = await compose(M, { name: "custom-root" });
    assert.equal(app.injector.name, "m");
    assert.equal(app.injector.parent?.name, "custom-root");
    await app.dispose();
  });
});

describe("compose — global modules", TEST_OPTIONS, () => {
  it("resolves a global module in a consumer that does not import it", async () => {
    const CONFIG = new InjectionToken<{ name: string }>("CONFIG");
    const GREETING = new InjectionToken<string>("GREETING");

    const ConfigModule = defineModule({
      name: "config",
      global: true,
      setup: () => [{ provide: CONFIG, useValue: { name: "prod" } }],
    });
    const UserModule = defineModule({
      name: "user",
      setup: (injector) => {
        const cfg = injector.resolve(CONFIG); // never imported, still visible
        return [{ provide: GREETING, useValue: `hello ${cfg.name}` }];
      },
    });
    // user listed first: without the flag it would sit below config and fail.
    const AppModule = defineModule({
      name: "app",
      imports: [UserModule, ConfigModule],
      setup: () => [],
    });

    const app = await compose(AppModule);
    assert.equal(app.injector.resolve(GREETING), "hello prod");
    assert.deepEqual(app.injector.resolve(CONFIG), { name: "prod" });
    await app.dispose();
  });

  it("without the flag the same graph cannot resolve across sibling order", async () => {
    const CONFIG = new InjectionToken<{ name: string }>("CONFIG");
    const GREETING = new InjectionToken<string>("GREETING");

    const ConfigModule = defineModule({
      name: "config",
      setup: () => [{ provide: CONFIG, useValue: { name: "prod" } }],
    });
    const UserModule = defineModule({
      name: "user",
      setup: (injector) => [
        { provide: GREETING, useValue: `hi ${injector.resolve(CONFIG).name}` },
      ],
    });
    const AppModule = defineModule({
      name: "app",
      imports: [UserModule, ConfigModule],
      setup: () => [],
    });

    await assert.rejects(
      () => compose(AppModule),
      /No provider registered for InjectionToken\(CONFIG\)/,
    );
  });

  it("hoists a global's non-global import along with it (transitive closure)", async () => {
    const RETRY = new InjectionToken<number>("RETRY");
    const MONGO = new InjectionToken<string>("MONGO");
    const SEEN = new InjectionToken<string>("SEEN");

    const RetryModule = defineModule({
      name: "retry",
      setup: () => [{ provide: RETRY, useValue: 3 }],
    });
    const MongoModule = defineModule({
      name: "mongo",
      global: true,
      imports: [RetryModule],
      setup: (injector) => {
        const retries = injector.resolve(RETRY); // retry hoisted to base too
        return [{ provide: MONGO, useValue: `mongo(retry=${retries})` }];
      },
    });
    const UserModule = defineModule({
      name: "user",
      setup: (injector) => [
        { provide: SEEN, useValue: injector.resolve(MONGO) },
      ],
    });
    // user first: closure must pull retry + mongo beneath it.
    const AppModule = defineModule({
      name: "app",
      imports: [UserModule, MongoModule],
      setup: () => [],
    });

    const app = await compose(AppModule);
    assert.equal(app.injector.resolve(MONGO), "mongo(retry=3)");
    assert.equal(app.injector.resolve(SEEN), "mongo(retry=3)");
    await app.dispose();
  });

  it("an upper module overrides a token a global provides", async () => {
    const CONFIG = new InjectionToken<string>("CONFIG");

    const ConfigModule = defineModule({
      name: "config",
      global: true,
      setup: () => [{ provide: CONFIG, useValue: "prod" }],
    });
    const OverModule = defineModule({
      name: "over",
      setup: () => [{ provide: CONFIG, useValue: "test" }],
    });
    const AppModule = defineModule({
      name: "app",
      imports: [ConfigModule, OverModule],
      setup: () => [],
    });

    const app = await compose(AppModule);
    assert.equal(app.injector.resolve(CONFIG), "test"); // child shadows base
    await app.dispose();
  });

  it("hoists a module shared by two globals exactly once", async () => {
    const counter = new Counter();
    const FLAG = new InjectionToken<number>("FLAG");

    const SharedModule = defineModule({
      name: "shared",
      setup: () => [{ provide: FLAG, useValue: counter.hit() }],
    });
    const A = defineModule({
      name: "a",
      global: true,
      imports: [SharedModule],
      setup: () => [],
    });
    const B = defineModule({
      name: "b",
      global: true,
      imports: [SharedModule],
      setup: () => [],
    });
    const AppModule = defineModule({
      name: "app",
      imports: [A, B],
      setup: () => [],
    });

    const app = await compose(AppModule);
    assert.equal(counter.count, 1); // closure dedups the shared import
    assert.equal(app.injector.resolve(FLAG), 1);
    await app.dispose();
  });

  it("disposes a global base resource last", async () => {
    const tracker = new DisposeTracker();
    const CONFIG = new InjectionToken("CONFIG");
    const SVC = new InjectionToken("SVC");

    const ConfigModule = defineModule({
      name: "config",
      global: true,
      setup: () => [
        {
          provide: CONFIG,
          useFactory: () => tracker.asyncDisposable("config"),
        },
      ],
    });
    const AppModule = defineModule({
      name: "app",
      imports: [ConfigModule],
      setup: () => [
        { provide: SVC, useFactory: () => tracker.asyncDisposable("svc") },
      ],
    });

    const app = await compose(AppModule);
    app.injector.resolve(SVC);
    app.injector.resolve(CONFIG);
    await app.dispose();

    assert.deepEqual(tracker.leaked(), []);
    assert.ok(tracker.wasSequential);
    // app link tears down before the global config base
    assert.deepEqual(tracker.startOrder, ["svc", "config"]);
  });

  it("composes a graph whose root is itself global", async () => {
    const DEP = new InjectionToken<number>("DEP");
    const APP = new InjectionToken<number>("APP");

    const DepModule = defineModule({
      name: "dep",
      setup: () => [{ provide: DEP, useValue: 1 }],
    });
    const AppModule = defineModule({
      name: "app",
      global: true,
      imports: [DepModule],
      setup: (injector) => [
        { provide: APP, useValue: injector.resolve(DEP) + 1 },
      ],
    });

    const app = await compose(AppModule); // whole graph falls into the closure
    assert.equal(app.injector.resolve(APP), 2);
    await app.dispose();
  });
});
