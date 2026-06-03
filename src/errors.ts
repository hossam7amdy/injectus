import { Lifetime } from "./lifetime.ts";
import { type Token, tokenName } from "./token.ts";

/** Thrown when no provider is registered for a token. */
export class TokenNotFoundError extends Error {
  override readonly name = "TokenNotFoundError";
  readonly token: Token;
  readonly injectorName: string;

  constructor(token: Token, name: string) {
    super(
      `No provider registered for ${tokenName(token)} (Injector: "${name}").`,
    );
    this.token = token;
    this.injectorName = name;
  }
}

/** Thrown when a cycle is detected in the dependency graph. `chain` is filled root-to-leaf. */
export class CircularDependencyError extends Error {
  override readonly name = "CircularDependencyError";
  readonly chain: Token[];

  constructor(leaf: Token) {
    super();
    this.chain = [leaf];
  }

  override get message(): string {
    return `Circular dependency: ${this.chain.map(tokenName).join(" -> ")}.`;
  }
}

/**
 * Thrown when a singleton holds — directly or transitively — a scoped dependency.
 * `consumer` is the innermost singleton in the chain; `chain` is the full path root-to-leaf.
 */
export class CaptiveDependencyError extends Error {
  override readonly name = "CaptiveDependencyError";
  consumer: Token | undefined;
  readonly chain: Token[];

  constructor(dependency: Token) {
    super();
    this.consumer = undefined;
    this.chain = [dependency];
  }

  override get message(): string {
    const consumerName =
      this.consumer !== undefined ? tokenName(this.consumer) : "<singleton>";
    return (
      `Captive dependency: ${consumerName} (singleton) depends on ` +
      `${tokenName(this.dependency)} (scoped). ` +
      `A scoped instance cannot live inside a singleton. ` +
      `Chain: ${this.chain.map(tokenName).join(" -> ")}.`
    );
  }

  get dependency(): Token {
    return this.chain[this.chain.length - 1]!;
  }
}

/** @internal Prepend `token` to `error.chain`; set `consumer` on the first Singleton frame. */
export function prependTokenToDependencyPath(
  error: CaptiveDependencyError | CircularDependencyError,
  token: Token,
  lifetime: Lifetime,
): void {
  error.chain.unshift(token);
  if (
    error instanceof CaptiveDependencyError &&
    error.consumer === undefined &&
    lifetime === Lifetime.Singleton
  ) {
    error.consumer = token;
  }
}

/** Thrown when `inject()` is called outside an active injection context. */
export class InjectionContextError extends Error {
  override readonly name = "InjectionContextError";
  readonly token: Token;

  constructor(token: Token) {
    super(
      `inject(${tokenName(token)}) called outside an injection context. ` +
        `inject() may only run synchronously inside a factory or class constructor invoked by an Injector.`,
    );
    this.token = token;
  }
}

/** Thrown when an operation is attempted on a disposed injector. */
export class InjectorDisposedError extends Error {
  override readonly name = "InjectorDisposedError";
  readonly injectorName: string;

  constructor(name: string) {
    super(`Injector "${name}" has been disposed.`);
    this.injectorName = name;
  }
}
