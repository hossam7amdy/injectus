# Benchmarks

Comparative micro-benchmarks for `injectus` against two real-world IoC
containers:

- **[awilix](https://github.com/jeffijoe/awilix)** — decorator-free, sync, no
  `reflect-metadata`. The closest paradigm peer, and therefore the fair fight.
- **[tsyringe](https://github.com/microsoft/tsyringe)** — decorator-based,
  `reflect-metadata`. Representative of the popular decorator DI style.

Every library resolves the **same dependency-graph shape** in each scenario.
The harness is [mitata](https://github.com/evanwashere/mitata), run with
`--expose-gc` so GC is controlled between samples. Numbers below come from a
single canonical run; see [Environment](#environment) and
[Reproduce](#reproduce).

## TL;DR

Across all four scenarios, `injectus` is **1.1×–2.1× faster than awilix** and
**2.1×–3.0× faster than tsyringe**, while allocating the **least memory** of the
three. The cached-resolve margin over awilix is slim (~1.1×) and noise-sensitive
— see [Caveats](#caveats); the wins on construction-heavy graphs are larger and
stable.

## Results

`relative` is wall-clock time normalised to `injectus` (lower is better;
`injectus` = 1.00× baseline). `alloc/iter` is average heap allocated per
resolve.

### Cached singleton resolve

Resolve an already-constructed singleton in a hot loop — pure cache-hit / lookup
cost.

| library  | avg/iter |  relative | alloc/iter |
| :------- | -------: | --------: | ---------: |
| injectus | 22.24 ns | **1.00×** |     40.5 b |
| awilix   | 24.82 ns |     1.12× |    120.2 b |
| tsyringe | 66.03 ns |     2.97× |    216.2 b |

### Transient resolve (3-node graph)

`A → B → value`, all transient — fresh construction + wiring on every resolve.

| library  |  avg/iter |  relative | alloc/iter |
| :------- | --------: | --------: | ---------: |
| injectus | 144.39 ns | **1.00×** |    265.0 b |
| awilix   | 232.05 ns |     1.61× |    352.3 b |
| tsyringe | 315.96 ns |     2.19× |    840.6 b |

### Deep chain resolve (depth 10)

A 10-link transient chain — resolution overhead that scales with graph depth.

| library  | avg/iter |  relative | alloc/iter |
| :------- | -------: | --------: | ---------: |
| injectus | 0.545 µs | **1.00×** |    1.06 kb |
| awilix   |  1.12 µs |     2.06× |    1.25 kb |
| tsyringe |  1.26 µs |     2.31× |    2.42 kb |

### Wide graph resolve (fan-out 20)

A transient root with 20 direct dependencies — broad fan-out.

| library  | avg/iter |  relative | alloc/iter |
| :------- | -------: | --------: | ---------: |
| injectus |  1.05 µs | **1.00×** |    1.08 kb |
| awilix   |  1.85 µs |     1.76× |    2.27 kb |
| tsyringe |  2.24 µs |     2.14× |    4.73 kb |

## Methodology

The fairness contract is that each library expresses the **identical graph
shape** per scenario, and only `resolve()` is timed:

- **Setup excluded.** Containers are built once outside the measured loop; the
  hot loop calls only `resolve()`. (Container construction is not what these
  numbers measure.)
- **Idiomatic 3-node graphs.** The cached and transient scenarios use each
  library's normal class API: `injectus` field-initializer `inject()`, awilix
  PROXY-mode cradle injection, tsyringe `@injectable` classes. tsyringe uses
  explicit `@inject(token)` on every constructor parameter — this still pays the
  full `reflect-metadata` runtime cost, but avoids `emitDecoratorMetadata`,
  which the `tsx`/esbuild runner cannot emit.
- **Generated graphs.** The deep and wide scenarios register programmatically
  via each library's factory/function API (injectus `useFactory`, awilix
  `asFunction`, tsyringe `useFactory`) so the comparison is the resolution
  graph-walk itself, not per-library registration ergonomics.
- **Built artifact.** Benchmarks import `injectus` from the published `dist/`
  build — exactly what npm ships — not the TypeScript source.
- **`--expose-gc` enabled.** `pnpm bench` runs with `node --expose-gc` so
  mitata controls garbage collection between samples (its
  [recommended mode](https://github.com/evanwashere/mitata#recommendations)).
  Without it, GC noise at the ~22 ns cached-singleton floor is large enough to
  flip the injectus/awilix ordering between runs.
- mitata handles warmup and outlier statistics. Each scenario prints a relative
  summary.

## Environment

|        |                                                   |
| :----- | :------------------------------------------------ |
| node   | v24.16.0 (V8 13.6.233.17-node.49)                 |
| os     | Linux 6.17.0-35-generic x64                       |
| cpu    | 11th Gen Intel Core i7-1165G7 @ 2.80GHz (8 cores) |
| memory | 15.3 GiB                                          |
| date   | 2026-06-16                                        |

The runner prints this block on every run, so pasted numbers always travel with
the machine that produced them.

## Reproduce

```sh
pnpm bench                      # builds dist/ then runs the full suite
pnpm --filter benchmarks bench  # skip rebuild, run suite directly
```

`pnpm bench` builds the library first (the bench imports the built `dist/`),
then runs the suite with `node --expose-gc`.

## Caveats

- **Numbers are machine-dependent.** Absolute timings vary with CPU, Node
  version, and load; the relative ordering is the durable signal. Run it on your
  own hardware.
- **Cached resolve is noise-sensitive.** At ~22 ns/iter it sits near the
  measurement floor; the `injectus` vs `awilix` margin there swings roughly
  1.1×–1.2× across runs and should be read as "on par / slightly ahead," not a
  blowout. The construction-heavy scenarios (transient, deep, wide) are where
  the lead is both larger and stable.
- **tsyringe pays a `reflect-metadata` tax by design.** That cost is inherent to
  the decorator paradigm, not a harness artifact — it is precisely the
  trade-off `injectus` avoids by being decorator-free.
