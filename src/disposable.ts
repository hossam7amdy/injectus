/** Any object implementing TC39 Explicit Resource Management (`Symbol.dispose` or `Symbol.asyncDispose`). */
export type DisposableLike =
  | { [Symbol.dispose](): void }
  | { [Symbol.asyncDispose](): Promise<void> };

/** @internal */
export function isDisposable(value: unknown): value is DisposableLike {
  if (value == null) return false;
  return (
    typeof (value as any)[Symbol.asyncDispose] === "function" ||
    typeof (value as any)[Symbol.dispose] === "function"
  );
}

/** @internal Invoke the disposer. May return a Promise. */
export function disposerOf(value: any): void | Promise<void> {
  if (typeof value[Symbol.asyncDispose] === "function") {
    return value[Symbol.asyncDispose]();
  }
  return value[Symbol.dispose]();
}
