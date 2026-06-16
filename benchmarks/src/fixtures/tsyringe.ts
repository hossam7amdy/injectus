// tsyringe fixtures — idiomatic @injectable + explicit @inject() constructor
// injection for the 3-node graph (still pays the reflect-metadata runtime cost;
// explicit tokens avoid the emitDecoratorMetadata that esbuild/tsx can't emit),
// useFactory registrations for the generated graphs.

import "reflect-metadata/lite";

import { container, inject, injectable } from "tsyringe";

const DB_URL = "DB_URL";

@injectable()
class Database {
  constructor(@inject(DB_URL) public url: string) {}
}

@injectable()
class UserService {
  constructor(@inject(Database) public db: Database) {}
}

export function cachedContainer(): () => unknown {
  const child = container.createChildContainer();
  child.register(DB_URL, { useValue: "postgres://localhost/app" });
  child.registerSingleton(Database);
  child.registerSingleton(UserService);
  child.resolve(UserService); // warm the singleton cache
  return () => child.resolve(UserService);
}

export function transientContainer(): () => unknown {
  const child = container.createChildContainer();
  child.register(DB_URL, { useValue: "postgres://localhost/app" });
  // @injectable classes resolve transient by default (no registration needed)
  return () => child.resolve(UserService);
}

export function deepChain(depth: number): () => unknown {
  const child = container.createChildContainer();
  for (let i = 0; i < depth; i++) {
    const next = i + 1 < depth ? `deep${i + 1}` : null;
    child.register(`deep${i}`, {
      useFactory: (dep) => ({
        next: next ? dep.resolve(next) : null,
      }),
    });
  }
  return () => child.resolve("deep0");
}

export function wideGraph(width: number): () => unknown {
  const child = container.createChildContainer();
  const names: string[] = [];
  for (let i = 0; i < width; i++) {
    const value = i;
    child.register(`wide${i}`, { useFactory: () => value });
    names.push(`wide${i}`);
  }
  child.register("wideRoot", {
    useFactory: (dep) => names.map((n) => dep.resolve(n)),
  });
  return () => child.resolve("wideRoot");
}
