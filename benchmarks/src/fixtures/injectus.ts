// injectus fixtures — idiomatic class-field inject() for the 3-node graph,
// factory providers for the generated deep/wide graphs.
import { InjectionToken, Injector, inject, Lifetime } from "injectus";

const DB_URL = new InjectionToken<string>("DB_URL");

class Database {
  url = inject(DB_URL);
}

class UserService {
  db = inject(Database);
}

export function cachedContainer(): () => unknown {
  const injector = Injector.create({
    providers: [
      { provide: DB_URL, useValue: "postgres://localhost/app" },
      Database, // bare class === Singleton
      UserService,
    ],
  });
  injector.resolve(UserService); // warm the singleton cache
  return () => injector.resolve(UserService);
}

export function transientContainer(): () => unknown {
  const injector = Injector.create({
    providers: [
      { provide: DB_URL, useValue: "postgres://localhost/app" },
      {
        provide: Database,
        useClass: Database,
        lifetime: Lifetime.Transient,
      },
      {
        provide: UserService,
        useClass: UserService,
        lifetime: Lifetime.Transient,
      },
    ],
  });
  return () => injector.resolve(UserService);
}

export function deepChain(depth: number): () => unknown {
  const tokens = Array.from(
    { length: depth },
    (_, i) => new InjectionToken<unknown>(`deep-${i}`),
  );
  const providers = tokens.map((token, i) => ({
    provide: token,
    useFactory: () => ({
      next: i + 1 < depth ? inject(tokens[i + 1]) : null,
    }),
    lifetime: Lifetime.Transient,
  }));
  const injector = Injector.create({ providers });
  const root = tokens[0];
  return () => injector.resolve(root);
}

export function wideGraph(width: number): () => unknown {
  const leaves = Array.from(
    { length: width },
    (_, i) => new InjectionToken<number>(`wide-${i}`),
  );
  const ROOT = new InjectionToken<unknown[]>("wide-root");
  const providers = [
    ...leaves.map((token, i) => ({
      provide: token,
      useFactory: () => i,
      lifetime: Lifetime.Transient,
    })),
    {
      provide: ROOT,
      useFactory: () => leaves.map((token) => inject(token)),
      lifetime: Lifetime.Transient,
    },
  ];
  const injector = Injector.create({ providers });
  return () => injector.resolve(ROOT);
}
