# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`injectus` — a zero-dependency, decorator-free IoC container for Node.js. Native ESM,
TypeScript source compiled to `dist/`. Server-side only; resolution is **synchronous by
design**. Requires Node ≥ 22.6.0 (tests using `await using` need ≥ 24). pnpm is enforced.

## Commands

- `pnpm build` — emit `dist/` via `tsconfig.build.json` (rewrites `.ts` import specifiers to `.js`)
- `pnpm typecheck` — `tsc --noEmit` over all `.ts`, including tests and `types.test-d.ts`
- `pnpm test` — native `node --test` runner; runs `.ts` directly (Node strips types)
- `pnpm test:cov` — tests + a hard 100% line/function/branch coverage gate
- `pnpm check` / `pnpm check:fix` — Biome (TS/JSON) + Prettier (md/yaml)
- Single test file: `node --test src/__tests__/injector.cycles.test.ts`
- Single test by name: `node --test --test-name-pattern="captive" src/__tests__/*.test.ts`

`test:cov:node22` exists because Node 22 cannot parse `await using`; it excludes
`*.esnext.test.ts`. CI runs the matrix Node 22 / 24 / current.

## Architecture

Single public entry `src/index.ts` re-exports everything. The codebase is ~9 small
modules; the non-obvious part is the coupling between `injector.ts` and `context.ts`.

### Ambient injection context (core mechanism)

`inject(token)` takes no injector argument. It reads a module-global mutable
`currentContext` in `src/context.ts`. `Injector.resolve()` sets that context around each
factory body / class-field initializer and restores it in a `finally`. Consequences:

- `inject()` only works **synchronously** inside a `useFactory` body or a class field
  initializer. Any `await` / `setTimeout` / `Promise` loses the context →
  `InjectionContextError`.
- `injector.ts` and `context.ts` are intentionally circular; changing resolution means
  touching both.

### Lifetimes + O(1) captive detection

`src/lifetime.ts` ranks singleton < scoped < transient. The context carries
`effectiveLifetime` = the strictest lifetime seen down the current resolution stack
(`minLifetime`). On resolve, a parent singleton depending on a current scoped binding
throws `CaptiveDependencyError` — no graph traversal.

### Binding state machine

`src/binding.ts`: each `Binding.value` moves EMPTY → CIRCULAR (in-construction cycle
marker) → instance (or back to EMPTY for transient / on throw). `hydrate()` in
`injector.ts` drives it; re-entering a CIRCULAR binding throws `CircularDependencyError`.
Field order in `makeBinding` is fixed on purpose to keep V8's hidden class monomorphic on
the hot resolve path — always build bindings through `makeBinding`.

### Owner resolution & scoped shadowing

`Injector.resolve()` holds the subtlest logic here: singletons hydrate/cache on their
**defining** injector, while a scoped binding found in a parent is copied into the child's
own `#bindings` so each child owns its scoped instance and a child override never poisons
the parent's singleton cache. Read the inline comments before editing.

### Disposal

Each injector tracks (`#disposers`) only the disposable instances it constructed.
`dispose()` runs them LIFO, sequentially, idempotently (guarded by a `#disposing`
promise); multiple disposer failures collapse into one `AggregateError`. `useValue` and
`Transient` instances are never tracked. `src/disposable.ts` detects `Symbol.dispose` /
`Symbol.asyncDispose`.

### Errors

`src/errors.ts`: `CircularDependencyError` and `CaptiveDependencyError` extend
`DependencyPathError`, whose `path` is built by `DependencyPathError.prepend()` called in
`hydrate()`'s catch block as the exception unwinds each frame — producing a full
root-to-leaf path in the message.

## Conventions

- **Relative imports must include the `.ts` extension** (`from "./context.ts"`) — Biome's
  `useImportExtensions` errors otherwise. The build rewrites them to `.js`.
- Type-only imports must use `import type` (`verbatimModuleSyntax` + Biome `useImportType`).
- JSDoc: single-line by default; use a multi-line block only for headline public API that
  carries an `@example` (e.g. `Injector`, `inject`, `withInjector`, `InjectionToken`).
- `@internal` (first word if single-line) for non-public exports.
- Comments earn their place: let clear naming carry intent and add a comment only for the
  non-obvious _why_ — a tradeoff or invariant (e.g. "child shadow poisons parent cache",
  "LIFO so consumers dispose before their deps"). Don't narrate what the code already says.
- Tests use `node:test` (`describe`/`it`) + `node:assert/strict` with shared `TEST_OPTIONS`
  from `test.config.ts`. `types.test-d.ts` is type-level (checked by `typecheck`, not run).
  Name disposal tests that use `await using` as `*.esnext.test.ts`.
- Coverage must stay at 100% — enforced by `preversion`, `prepublishOnly`, and the lefthook
  `pre-commit` hook (which also runs typecheck and a pnpm-only lockfile guard).
- Last provider registration for a token wins; child injectors shadow parent bindings.
