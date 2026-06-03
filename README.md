# injectus

Zero-dependency, decorator-free IoC container for Node.js.

```ts
import { Injector, inject, Lifetime, InjectionToken } from "injectus";

const DB_URL = new InjectionToken<string>("DB_URL");

class Database {
  url = inject(DB_URL);
}

class UserService {
  db = inject(Database);
  findAll() {
    return this.db.url;
  }
}

await using injector = Injector.create({
  providers: [
    { provide: DB_URL, useValue: "postgres://localhost/app" },
    Database,
    UserService,
  ],
});

injector.resolve(UserService).findAll();
```

## Install

```sh
npm install injectus
pnpm add injectus
yarn add injectus
```

**Requires Node.js ≥ 22.6.0.** The library uses `Symbol.asyncDispose` (TC39 Explicit Resource Management) and ships as native ESM. No browser support — designed for server-side use where synchronous resolution is a guarantee.

> **Design note:** The functional `inject()` API is directly inspired by Angular's modern DI (v14+). Everything else is stripped for the backend: no zone.js, no component trees, no async factories — just plain injectors, explicit lifetimes, and safe disposal.

---

## Providers

Five registration forms, all accepted in the `providers` array:

```ts
// Bare class — sugar for { provide: C, useClass: C, lifetime: Singleton }
providers: [MyService]

// Construct a class (inject() works in field initializers)
{ provide: Cache, useClass: RedisCache, lifetime: Lifetime.Singleton }

// Factory function (inject() works inside the body)
{ provide: Config, useFactory: () => loadConfig() }

// Pre-built value — the injector never disposes it
{ provide: DB_URL, useValue: "postgres://localhost/app" }

// Alias — re-dispatches through the calling injector, so child overrides apply
{ provide: ICache, useExisting: RedisCache }
```

Last registration for a token wins — child injectors shadow parent bindings.

---

## Tokens

Classes are their own tokens. For interfaces, primitives, and config use `InjectionToken`:

```ts
import { InjectionToken } from "injectus";

const PORT = new InjectionToken<number>("PORT");
const DB_URL = new InjectionToken<string>("DB_URL");
abstract class Cache {
  abstract get(k: string): string | null;
}
```

Two tokens with the same description are **distinct keys** — identity, not name, is the key.

---

## Lifetimes

| Lifetime                | Behaviour                                                                       |
| ----------------------- | ------------------------------------------------------------------------------- |
| `Singleton` _(default)_ | One instance per owning injector. Cached.                                       |
| `Scoped`                | One instance per child injector.                                                |
| `Transient`             | Fresh instance on every `resolve()` / `inject()`. Never cached, never disposed. |

```ts
import { Lifetime } from "injectus";

{ provide: Logger,    useClass: Logger,    lifetime: Lifetime.Singleton  }
{ provide: Session,   useClass: Session,   lifetime: Lifetime.Scoped     }
{ provide: RequestId, useFactory: () => crypto.randomUUID(),
                                           lifetime: Lifetime.Transient  }
```

**Captive dependency detection.** Resolving a `Singleton` that depends — directly or transitively — on a `Scoped` throws `CaptiveDependencyError` at resolve time, not silently in production. This is a deliberate safety guarantee that most DI libraries skip.

---

## Hierarchy

Child injectors inherit all parent bindings and own their `Scoped` instances independently. This maps naturally to HTTP request lifecycles.

```ts
const app = Injector.create({
  name: "app",
  providers: [Database, UserService],
});

// per-request child
const req = Injector.create({
  name: "request",
  parent: app,
  providers: [
    {
      provide: REQUEST_ID,
      useFactory: () => crypto.randomUUID(),
      lifetime: Lifetime.Scoped,
    },
    {
      provide: RequestLogger,
      useClass: RequestLogger,
      lifetime: Lifetime.Scoped,
    },
  ],
});

req.resolve(UserService); // Database comes from app
req.resolve(RequestLogger); // owned and cached by req
```

Each injector disposes only what it constructed — disposing `req` never touches `app`'s instances.

---

## inject()

Resolves a token through the **active injection context** — the injector currently constructing an instance. Valid only synchronously inside a `useFactory` body or a class field initializer.

```ts
class Mailer {
  smtp = inject(SmtpClient);
  audit = inject(AuditService, { optional: true }); // null if not registered
}
```

Calling `inject()` outside a construction context throws `InjectionContextError`. It does not work across async boundaries (`await`, `setTimeout`, `Promise`) — all wiring must be synchronous.

---

## withInjector()

Runs a function under a given injector's context. `inject()` calls inside `fn` resolve through `injector`. Useful for manual wiring and test setup.

```ts
import { withInjector } from "injectus";

const svc = withInjector(injector, () => new MyService());
```

---

## Disposal

Injectors implement TC39 Explicit Resource Management. Instances with `Symbol.dispose` or `Symbol.asyncDispose` are tracked and called in **reverse construction order (LIFO)** on `dispose()`.

```ts
class DbPool {
  async [Symbol.asyncDispose]() { await this.pool.end(); }
}

// Manual
await injector.dispose();

// Automatic with `await using`
{
  await using injector = Injector.create({ providers: [...] });
  // injector.dispose() is called at block exit, even on throw
}
```

**Rules:**

- Each injector disposes only what it constructed. Parents and children are independent.
- `useValue` providers are **never disposed** — the caller owns them.
- `Transient` instances are **never tracked** — manage their lifecycle at the call site.
- `dispose()` is idempotent. Concurrent calls share one run.
- Multiple failing disposers are collected into a single `AggregateError`.

---

## Testing

**Unit — swap real deps with values:**

```ts
import { Injector, inject, withInjector } from "injectus";

class UserService {
  db = inject(Database);
  logger = inject(Logger);
}

const injector = Injector.create({
  providers: [
    { provide: Database, useValue: mockDb },
    { provide: Logger, useValue: mockLogger },
    UserService,
  ],
});

const svc = injector.resolve(UserService);
// svc.db === mockDb, svc.logger === mockLogger
```

**Integration — shadow a single binding in production config:**

```ts
const injector = Injector.create({
  providers: [
    ...productionProviders,
    { provide: Database, useValue: testDb }, // shadows the real Database
  ],
});
```

---

## Error reference

| Error                     | When                                                           |
| ------------------------- | -------------------------------------------------------------- |
| `TokenNotFoundError`      | No provider registered for the token                           |
| `CircularDependencyError` | Cycle in the dependency graph (`A → B → A`)                    |
| `CaptiveDependencyError`  | Singleton holds a Scoped dependency (directly or transitively) |
| `InjectionContextError`   | `inject()` called outside a factory or constructor             |
| `InjectorDisposedError`   | Resolved from a disposed injector, or ancestor was disposed    |

`CircularDependencyError` and `CaptiveDependencyError` carry a `chain: Token[]` with the full dependency path root-to-leaf.

---

## API reference

### `Injector.create(options)`

| Option            | Type         | Default                       | Description                            |
| ----------------- | ------------ | ----------------------------- | -------------------------------------- |
| `providers`       | `Provider[]` | required                      | Bindings for this injector             |
| `parent`          | `Injector`   | —                             | Parent injector; omit for root         |
| `name`            | `string`     | `"root"` / `"<parent>.child"` | Debug label, appears in error messages |
| `defaultLifetime` | `Lifetime`   | `Lifetime.Singleton`          | Lifetime when a provider omits one     |

### `injector.resolve(token, options?)`

Resolves synchronously. Pass `{ optional: true }` to get `null` instead of throwing on a missing token.

### `inject(token, options?)`

Functional injection. Must be called synchronously during provider construction. Mirrors `injector.resolve()` through the active context.

### `withInjector(injector, fn)`

Runs `fn` with `injector` as the active context. Returns `fn`'s return value.

### `Injector` properties

| Property                | Type                  | Description                         |
| ----------------------- | --------------------- | ----------------------------------- |
| `parent`                | `Injector \| null`    | Parent injector, or `null` for root |
| `name`                  | `string`              | Debug label                         |
| `disposed`              | `boolean`             | `true` after `dispose()` is called  |
| `dispose()`             | `() => Promise<void>` | Dispose tracked instances LIFO      |
| `[Symbol.asyncDispose]` | `() => Promise<void>` | Alias — enables `await using`       |

### `InjectionToken<T>`

```ts
const TOKEN = new InjectionToken<T>("description");
token.description; // string
token.toString(); // "InjectionToken(description)"
```

### `Lifetime`

```ts
Lifetime.Singleton; // "singleton"
Lifetime.Scoped; // "scoped"
Lifetime.Transient; // "transient"
```

---

## Author

[Hossam Hamdy](https://github.com/hossam7amdy) · [Issues](https://github.com/hossam7amdy/injectus/issues)
