# AI Instructions

Injectus is a zero-dependency, decorator-free IoC container for Node.js. Native ESM,
TypeScript. Server-side only; resolution is **synchronous by design**.

## Monorepo layout

pnpm workspace (`pnpm-workspace.yaml`): `library`, `benchmarks`, `examples/*`.

| Directory           | Purpose                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| `library/`          | The published `injectus` package — most work happens here, in `library/src/`.         |
| `benchmarks/`       | Comparative benchmarks: injectus vs awilix vs tsyringe (`mitata`). Not published.     |
| `examples/express/` | Worked Express integration: app injector + per-request child injector. Not published. |

Examples are self-contained workspace packages under `examples/*` — their own
`package.json`/`tsconfig.json`/`README.md`, run via `pnpm -F <name> <script>`. Never add
example-specific scripts to the root `package.json`; that keeps the published package's
own script list clean.

## Essential Commands

Run from the repo root unless noted otherwise:

- `pnpm install` — install dependencies (workspace-wide)
- `pnpm build` — `pnpm -r run build`; for `library/` this emits `dist/` via
  `tsconfig.build.json` (rewrites `.ts` import specifiers to `.js`)
- `pnpm typecheck` — builds, then `tsc --noEmit` in every package, including `library`'s
  type-level `types.test-d.ts`
- `pnpm test` — builds, then `node --test` in every package
- `pnpm test:cov` — `library`'s tests plus a hard 100% line/function/branch coverage gate
- `pnpm test:cov:node22` — same, excluding `*.esnext.test.ts` (Node 22 can't parse `await using`)
- `pnpm check` / `pnpm check:fix` — Biome (TS/JSON) + Prettier (md/yaml), workspace-wide
- `pnpm bench` — builds, then runs the `benchmarks/` suite

Single test, run from `library/`:

- One file: `node --test src/__tests__/injector.cycles.test.ts`
- One test by name: `node --test --test-name-pattern="captive" src/__tests__/*.test.ts`

CI (`.github/workflows/ci.yaml`) runs the full matrix on Node 22 / 24 / current: build,
`pnpm check`, `pnpm typecheck`, then coverage (`test:cov:node22` on Node 22, `test:cov`
otherwise). Coveralls uploads from `library/lcov.info` on the `current` job only.

## Library architecture

Single public entry `library/src/index.ts` re-exports everything. The codebase is ~9
small modules; the non-obvious part is the coupling between `injector.ts` and `context.ts`.

```
library/src/
├── index.ts          → Public entry point; re-exports the whole package
├── injector.ts       → `Injector`: resolve/hydrate, owner resolution, scoped shadowing, disposal
├── context.ts        → Ambient `currentContext` powering synchronous `inject()`; circular with injector.ts by design
├── binding.ts        → `Binding` state machine (EMPTY → CIRCULAR → instance), built via `makeBinding`
├── lifetime.ts       → Lifetime ranking (singleton < scoped < transient) + O(1) captive-dependency detection
├── provider.ts       → Provider shapes: `useValue`, `useFactory`, class providers
├── token.ts          → `InjectionToken` + prototype-based token typing
├── disposable.ts     → Detects `Symbol.dispose` / `Symbol.asyncDispose` on instances
└── errors.ts         → `DependencyPathError` hierarchy: `CircularDependencyError`, `CaptiveDependencyError`
```

Tests live in `library/src/__tests__/`, one file per module plus `*.esnext.test.ts` for
`await using` disposal tests (see [Conventions](#code-conventions)).

## Code Conventions

- **ESM with `.ts` extensions** in imports (enforced by Biomejs).
- Type-only imports must use `import type` (`verbatimModuleSyntax` + Biome `useImportType`).
- Type-stripping no enums, no parameter properties (`erasableSyntaxOnly`).
- Class **methods** use the TypeScript `private` keyword (`private hydrate(...)`),  
  `#` is reserved for **fields** (`#bindings`, `#disposers`, `#disposing`).
- **JSDoc required** on public APIs, exported functions (first overload only for overload sets).
- `@internal` (first word if single-line) for non-public exports.
- Comments earn their place: let clear naming carry intent. Don't narrate what the code already says.
- Tests use `node:test` (`describe`/`it`) + `node:assert/strict` with shared `TEST_OPTIONS`
  from `test.config.ts`. `types.test-d.ts` is type-level (checked by `typecheck`, not run).
  Name disposal tests that use `await using` as `*.esnext.test.ts`.
- Coverage must stay at 100% for `library/` — enforced by CI and the lefthook `pre-commit`
  hook (which also runs lint, format, and typecheck).

## Other rules

- **Source code is the single source of truth.** Documentation (READMEs, this file) must
  match `library/src/`.
- **Lint and format after modifying code.** Run `pnpm check:fix` on the files you changed
  so CI's `pnpm check` passes.
- **Use the GitHub CLI (`gh`) for GitHub-related tasks** — pull requests, issues, checks.
- **pnpm only.** lefthook's pre-commit hook fails the commit if a `package-lock.json` or
  `yarn.lock` is present.
