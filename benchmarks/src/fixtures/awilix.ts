// awilix fixtures — PROXY injection mode (decorator-free, cradle destructuring)
// for the 3-node graph; asFunction registrations for the generated graphs.
import { asClass, asFunction, asValue, createContainer } from "awilix";

class Database {
  url: string;
  constructor({ dbUrl }: { dbUrl: string }) {
    this.url = dbUrl;
  }
}

class UserService {
  db: Database;
  constructor({ database }: { database: Database }) {
    this.db = database;
  }
}

export function cachedContainer(): () => unknown {
  const container = createContainer();
  container.register({
    dbUrl: asValue("postgres://localhost/app"),
    database: asClass(Database).singleton(),
    userService: asClass(UserService).singleton(),
  });
  container.resolve("userService"); // warm the singleton cache
  return () => container.resolve("userService");
}

export function transientContainer(): () => unknown {
  const container = createContainer();
  container.register({
    dbUrl: asValue("postgres://localhost/app"),
    database: asClass(Database).transient(),
    userService: asClass(UserService).transient(),
  });
  return () => container.resolve("userService");
}

export function deepChain(depth: number): () => unknown {
  const container = createContainer();
  const registrations: Record<string, ReturnType<typeof asFunction>> = {};
  for (let i = 0; i < depth; i++) {
    const next = i + 1 < depth ? `deep${i + 1}` : null;
    registrations[`deep${i}`] = asFunction((cradle) => ({
      next: next ? cradle[next] : null,
    })).transient();
  }
  container.register(registrations);
  return () => container.resolve("deep0");
}

export function wideGraph(width: number): () => unknown {
  const container = createContainer();
  const registrations: Record<string, ReturnType<typeof asFunction>> = {};
  const names: string[] = [];
  for (let i = 0; i < width; i++) {
    const value = i;
    registrations[`wide${i}`] = asFunction(() => value).transient();
    names.push(`wide${i}`);
  }
  registrations.wideRoot = asFunction((cradle) =>
    names.map((name) => cradle[name]),
  ).transient();
  container.register(registrations);
  return () => container.resolve("wideRoot");
}
