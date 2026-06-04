# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-04

First release out of the `alpha` prerelease line.

### Changed

- **BREAKING:** Error dependency path is now exposed as `path: readonly Token[]`.
  `CircularDependencyError` and `CaptiveDependencyError` no longer carry
  `chain`, and `CaptiveDependencyError` no longer carries `consumer` or
  `dependency`. Both errors now extend a shared `DependencyPathError` base.

  Migration:
  - `error.chain` → `error.path`
  - `error.dependency` (captive) → `error.path[error.path.length - 1]`
  - `error.consumer` (captive) → removed; the full path is in `error.path`
    and rendered in `error.message`

### Added

- `DependencyPathError` base class, exported from the package root. Catch it to
  handle `CircularDependencyError` and `CaptiveDependencyError` uniformly.

## [0.1.1-alpha.0]

Initial published alpha.

[0.2.0]: https://github.com/hossam7amdy/injectus/releases/tag/v0.2.0
[0.1.1-alpha.0]: https://github.com/hossam7amdy/injectus/releases/tag/v0.1.1-alpha.0
