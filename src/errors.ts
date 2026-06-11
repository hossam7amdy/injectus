import { type Token, tokenName } from "./token.ts";

/**
 * Base for errors that accumulate a dependency path as the exception
 * unwinds through nested `hydrate()` frames.
 */
export abstract class DependencyPathError extends Error {
  readonly #path: Token[];

  constructor(leaf: Token) {
    super();
    this.#path = [leaf];
  }

  /** Full dependency path, root-to-leaf. */
  get path(): readonly Token[] {
    return this.#path;
  }

  /** @internal Prepend `token` to `error`'s path as the exception unwinds one frame. */
  static prepend(error: DependencyPathError, token: Token): void {
    error.#path.unshift(token);
  }
}

/** Thrown when a cycle is detected in the dependency graph. The message renders the full path root-to-leaf. */
export class CircularDependencyError extends DependencyPathError {
  override readonly name = "CircularDependencyError";

  override get message(): string {
    return `Circular dependency: ${this.path.map(tokenName).join(" -> ")}.`;
  }
}

/**
 * Thrown when a singleton holds — directly or transitively — a scoped dependency.
 * The message labels the scoped dependency and renders the full path root-to-leaf.
 */
export class CaptiveDependencyError extends DependencyPathError {
  override readonly name = "CaptiveDependencyError";

  override get message(): string {
    const path = this.path;
    const scoped = tokenName(path[path.length - 1]!);
    return (
      `Captive dependency: ${scoped} (scoped) cannot live inside a singleton. ` +
      `Chain: ${path.map(tokenName).join(" -> ")}.`
    );
  }
}

/** Thrown when no provider is registered for a token. */
export class TokenNotFoundError extends Error {
  override readonly name = "TokenNotFoundError";

  constructor(token: Token, name: string) {
    super(
      `No provider registered for ${tokenName(token)} (Injector: "${name}").`,
    );
  }
}

/** Thrown when `inject()` is called outside an active injection context. */
export class InjectionContextError extends Error {
  override readonly name = "InjectionContextError";

  constructor(token: Token) {
    super(
      `inject(${tokenName(token)}) called outside an injection context. ` +
        `inject() may only run synchronously inside a factory or class field initializer invoked by an Injector.`,
    );
  }
}

/** Thrown when an operation is attempted on a disposed injector. */
export class InjectorDisposedError extends Error {
  override readonly name = "InjectorDisposedError";

  constructor(name: string) {
    super(`Injector "${name}" has been disposed.`);
  }
}

/** Thrown when the module import graph contains a cycle. Renders the module-name path. */
export class ModuleCycleError extends Error {
  override readonly name = "ModuleCycleError";

  constructor(path: readonly string[]) {
    super(`Circular module imports: ${path.join(" -> ")}.`);
  }
}
