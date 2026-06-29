import {
  type CaptiveDependencyError,
  type CircularDependencyError,
  type ClassProvider,
  type Constructor,
  type DependencyPathError,
  type ExistingProvider,
  type FactoryProvider,
  type InjectionContextError,
  InjectionToken,
  type InjectOptions,
  Injector,
  type InjectorDisposedError,
  type InjectorOptions,
  inject,
  type Lifetime,
  type Provider,
  type Token,
  type TokenNotFoundError,
  type ValueProvider,
  withInjector,
} from "../index.ts";

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

class Service {}
const TOKEN_S = new InjectionToken<string>("S");
const TOKEN_N = new InjectionToken<number>("N");

declare const injector: Injector;

const injectReq = inject(TOKEN_S);
const injectOpt = inject(TOKEN_S, { optional: true });
const resolveReq = injector.resolve(TOKEN_S);
const resolveOpt = injector.resolve(TOKEN_S, { optional: true });
const runInCtx = withInjector(injector, () => 42);
const injectorCreateChild = Injector.create({
  providers: [],
  parent: injector,
  name: "c",
});
const injectorCreateWithOpts = Injector.create({
  providers: [{ provide: TOKEN_S, useValue: "x" }],
  name: "root",
});
const injectorShorthand = Injector.create({ providers: [Service] });

// Classes usable only as identity keys (never constructed by the container)
declare class WeirdParamClass {
  constructor(...[cfg]: [cfg?: { region: string }]);
}
declare class PrivateCtorClass {
  private constructor();
  static create(): PrivateCtorClass;
}
const injectWeird = inject(WeirdParamClass);
const injectPrivate = inject(PrivateCtorClass);
const injectService = inject(Service);
const weirdKeyProvider = {
  provide: WeirdParamClass,
  useFactory: () => null,
} satisfies FactoryProvider;
const privateKeyProvider = {
  provide: PrivateCtorClass,
  useFactory: () => null,
} satisfies FactoryProvider;

export type Contracts = [
  // ── inject ──
  Expect<Equal<typeof injectReq, string>>,
  Expect<Equal<typeof injectOpt, string | null>>,
  Expect<Equal<Parameters<typeof inject<string>>[0], Token<string>>>,
  // ── Injector.resolve ──
  Expect<Equal<typeof resolveReq, string>>,
  Expect<Equal<typeof resolveOpt, string | null>>,
  // ── withInjector ──
  Expect<Equal<typeof runInCtx, number>>,
  // ── Lifetime literals ──
  Expect<Equal<typeof Lifetime.Singleton, "singleton">>,
  Expect<Equal<typeof Lifetime.Scoped, "scoped">>,
  Expect<Equal<typeof Lifetime.Transient, "transient">>,
  Expect<Equal<Lifetime, "singleton" | "scoped" | "transient">>,
  // ── Token / Constructor / InjectionToken ──
  Expect<
    Equal<
      Token<string>,
      InjectionToken<string> | Constructor<string> | { prototype: string }
    >
  >,
  Expect<Equal<Constructor<Service>, new (...args: never[]) => Service>>,
  // ── class-as-key: complex-param + private ctor accepted, instance type inferred ──
  Expect<Equal<typeof injectWeird, WeirdParamClass>>,
  Expect<Equal<typeof injectPrivate, PrivateCtorClass>>,
  // dual-arm union must still infer a normal class precisely, not `unknown`
  Expect<Equal<typeof injectService, Service>>,
  Expect<Equal<(typeof weirdKeyProvider)["provide"], typeof WeirdParamClass>>,
  Expect<
    Equal<(typeof privateKeyProvider)["provide"], typeof PrivateCtorClass>
  >,
  Expect<Equal<InjectionToken<string>["description"], string>>,
  Expect<
    Equal<ConstructorParameters<typeof InjectionToken>, [description: string]>
  >,
  // ── InjectOptions ──
  Expect<Equal<InjectOptions, { optional?: boolean }>>,
  // ── InjectorOptions ──
  Expect<
    Equal<
      InjectorOptions,
      {
        providers: Provider[];
        name?: string;
        parent?: Injector;
        defaultLifetime?: Lifetime;
      }
    >
  >,
  // ── Injector public shape ──
  Expect<Equal<Injector["name"], string>>,
  Expect<Equal<Injector["parent"], Injector | null>>,
  Expect<Equal<Injector["disposed"], boolean>>,
  Expect<Equal<ReturnType<Injector["dispose"]>, Promise<void>>>,
  Expect<Equal<typeof injectorCreateChild, Injector>>,
  Expect<Equal<typeof injectorCreateWithOpts, Injector>>,
  Expect<Equal<Parameters<typeof Injector.create>, [options: InjectorOptions]>>,
  Expect<Injector extends AsyncDisposable ? true : false>,
  // ── Provider variants ──
  Expect<Equal<ValueProvider<string>["provide"], Token<string>>>,
  Expect<Equal<ValueProvider<string>["useValue"], string>>,
  Expect<Equal<FactoryProvider<number>["provide"], Token<number>>>,
  Expect<Equal<FactoryProvider<number>["useFactory"], () => number>>,
  Expect<Equal<FactoryProvider<number>["lifetime"], Lifetime | undefined>>,
  Expect<Equal<ClassProvider<Service>["provide"], Token<Service>>>,
  Expect<Equal<ClassProvider<Service>["useClass"], Constructor<Service>>>,
  Expect<Equal<ClassProvider<Service>["lifetime"], Lifetime | undefined>>,
  Expect<Equal<ExistingProvider<string>["provide"], Token<string>>>,
  Expect<Equal<ExistingProvider<string>["useExisting"], Token<string>>>,
  Expect<
    Equal<
      Provider<string>,
      | ValueProvider<string>
      | FactoryProvider<string>
      | ClassProvider<string>
      | ExistingProvider<string>
      | Constructor<string>
    >
  >,
  Expect<Equal<typeof injectorShorthand, Injector>>,
  // ── Errors: ctor params + key fields + extends Error ──
  Expect<
    Equal<ConstructorParameters<typeof TokenNotFoundError>, [Token, string]>
  >,
  Expect<TokenNotFoundError extends Error ? true : false>,
  Expect<Equal<ConstructorParameters<typeof CircularDependencyError>, [Token]>>,
  Expect<CircularDependencyError extends Error ? true : false>,
  Expect<Equal<ConstructorParameters<typeof CaptiveDependencyError>, [Token]>>,
  Expect<CaptiveDependencyError extends Error ? true : false>,
  Expect<Equal<DependencyPathError["path"], readonly Token[]>>,
  Expect<Equal<CircularDependencyError["path"], readonly Token[]>>,
  Expect<Equal<CaptiveDependencyError["path"], readonly Token[]>>,
  Expect<CircularDependencyError extends DependencyPathError ? true : false>,
  Expect<CaptiveDependencyError extends DependencyPathError ? true : false>,
  Expect<Equal<ConstructorParameters<typeof InjectionContextError>, [Token]>>,
  Expect<InjectionContextError extends Error ? true : false>,
  Expect<Equal<ConstructorParameters<typeof InjectorDisposedError>, [string]>>,
  Expect<InjectorDisposedError extends Error ? true : false>,
];

export function negatives(): void {
  // @ts-expect-error: token argument required
  inject();

  // @ts-expect-error: primitives are not valid tokens — no construct sig, no `prototype`
  inject(42);

  // @ts-expect-error: useValue must match token T (number ≠ string)
  const bad1: ValueProvider<string> = { provide: TOKEN_S, useValue: 123 };
  void bad1;

  // @ts-expect-error: provide token T must match useValue T
  const bad2: ValueProvider<string> = { provide: TOKEN_N, useValue: "ok" };
  void bad2;

  const bad3: FactoryProvider<string> = {
    provide: TOKEN_S,
    // @ts-expect-error: useFactory return must match T
    useFactory: () => 1,
  };
  void bad3;

  const bad3async: FactoryProvider<string> = {
    provide: TOKEN_S,
    // @ts-expect-error: async factory returns Promise<string>, not string — sync only
    useFactory: async () => "x",
  };
  void bad3async;

  const bad3promise: FactoryProvider<string> = {
    provide: TOKEN_S,
    // @ts-expect-error: factory returning Promise.resolve is not sync — sync only
    useFactory: () => Promise.resolve("x"),
  };
  void bad3promise;

  const bad4: ClassProvider<string> = {
    provide: TOKEN_S,
    // @ts-expect-error: useClass T must match Provider T
    useClass: Service,
  };
  void bad4;

  const bad5: ExistingProvider<string> = {
    provide: TOKEN_S,
    // @ts-expect-error: useExisting token T must match
    useExisting: TOKEN_N,
  };
  void bad5;

  abstract class AbstractSvc {}
  // @ts-expect-error: abstract class can't be a bare shorthand provider — use { provide, useClass }
  Injector.create({ providers: [AbstractSvc] });

  // @ts-expect-error: InjectionToken requires description string
  new InjectionToken<string>();
}
