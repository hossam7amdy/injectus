# Express + injectus

A minimal [Express 5](https://expressjs.com/) app showing the canonical injectus
integration: an **app injector** for singletons and a **per-request child
injector** created in middleware and disposed when the response closes.

> **Status:** This is a worked, tested reference pattern, not a packaged
> adapter. Everything here — the per-request child injector, the disposal
> hook, the captive-dependency guard — is real and covered by the
> integration tests in this example. There's no `injectus`-provided
> middleware to import yet; copy and adapt `request-scope.ts` into your
> own app.

## What it shows

- **App injector** — `createAppInjector(overrides?)` registers the app-lifetime
  singletons: `Database`, `UserRepository`, `UserService`, and `Logger` (bound to
  `ConsoleLogger`). `overrides` is the swap seam.
- **Per-request scope** — `requestScope(appInjector)` creates a child injector
  per request, parents it to the app injector, attaches it as `req.scope`, and
  provides `REQUEST_CONTEXT` (`{ id, method, path }`). It is disposed on
  `res.on("close")`.
- **Explicit resolution** — middleware and route handlers pull what they need via
  `req.scope.resolve(...)`. Singletons resolve from the app injector; the request
  context from the child.
- **Captive-dependency safety** — `UserService` is a singleton, so it must _not_
  inject the scoped `REQUEST_CONTEXT` (injectus throws `CaptiveDependencyError`
  at resolve time). The request id is added by `requestLogger`, which reads the
  context from `req.scope`.
- **Synchronous SQLite** — `Database` wraps Node's `node:sqlite` `DatabaseSync`
  (an in-memory `:memory:` connection); `UserRepository` owns its `users` table and
  queries it through the connection.
- **Real disposal** — `Database` implements `Symbol.dispose` to close the
  connection. injectus tracks it on the app injector, so graceful shutdown
  (`SIGINT` / `SIGTERM` → `app.dispose()`) closes SQLite (LIFO, idempotent).

## Swapping the logger

`Logger` is an abstract-class token, so you replace it wholesale at the
composition root — last registration wins, no consumer changes:

```ts
const silent: Logger = { info() {}, error() {} };
const injector = createAppInjector([{ provide: Logger, useValue: silent }]);
const app = createApp(injector);
```

That is exactly how the tests swap in a silent logger.

## Layout

- `src/app.injector.ts` — `createAppInjector(overrides?)`: the app injector and
  its singleton providers.
- `src/app.ts` — `createApp(injector?)`: builds the Express app, wires middleware
  and routes, and exposes `dispose` / `resolve`.
- `src/server.ts` — entry point: `listen` + graceful shutdown.
- `src/common/` — `database.ts` (the disposable SQLite connection), `logger.ts`
  (`Logger` + `ConsoleLogger`), and `http-error.ts`.
- `src/middlewares/` — `request-scope.ts`, `request-logger.ts`, and
  `error-handler.ts`.
- `src/user-module/` — the `/users` feature: `model`, `repository`, `service`,
  `router`.

## Run

The example imports `injectus` as a workspace dependency that resolves to the
built `dist/`, so build the library first.

```sh
pnpm install            # at repo root (links the workspace)
pnpm build              # at repo root (builds injectus dist/)
pnpm -F example-express start
```

```sh
curl localhost:3000/users
curl localhost:3000/users/1
curl localhost:3000/users/999
curl -X POST localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"name":"Grace Hopper"}'
```

Each request logs an access line tagged with a fresh id, then `request scope
disposed` once the response closes; `POST` also logs `created user <id>`. Created
users persist across requests within a run — one in-memory connection stays open
— and reset on restart. `Ctrl-C` prints `database connection closed` as the
`Database` disposer runs.

## Test

```sh
pnpm -F example-express test
```

Native `node:test` integration tests drive the app over real HTTP
(`app.listen(0)` + `fetch`). Each test gets its own injector, app, and `:memory:`
database, so they run concurrently with no shared state.
