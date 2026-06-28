import type { Express } from "express";
import express from "express";
import type { Injector } from "injectus";

import { createAppInjector } from "./app.injector.ts";
import { errorHandler } from "./middlewares/error-handler.ts";
import { requestLogger } from "./middlewares/request-logger.ts";
import { requestScope } from "./middlewares/request-scope.ts";
import { usersRouter } from "./user-module/user.router.ts";

export interface Application
  extends Express,
    Pick<Injector, "dispose" | "resolve"> {}

export function createApp(injector?: Injector): Application {
  const app = express();
  injector ??= createAppInjector();

  app.use(express.json());
  app.use(requestScope(injector));
  app.use(requestLogger);
  app.use("/users", usersRouter);
  app.use(errorHandler);

  return Object.assign(app, {
    dispose: injector.dispose.bind(injector),
    resolve: injector.resolve.bind(injector),
  });
}
