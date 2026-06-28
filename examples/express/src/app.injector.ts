import { Injector, type Provider } from "injectus";

import { Database } from "./common/database.ts";
import { ConsoleLogger, Logger } from "./common/logger.ts";
import { UserRepository } from "./user-module/user.repository.ts";
import { UserService } from "./user-module/user.service.ts";

export function createAppInjector(overrides?: Provider[]): Injector {
  return Injector.create({
    name: "app",
    providers: [
      Database,
      UserService,
      UserRepository,
      { provide: Logger, useClass: ConsoleLogger },
      ...(overrides ?? []),
    ],
  });
}
