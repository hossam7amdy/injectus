import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";
import { InjectionToken, Injector } from "injectus";

import { Logger } from "../common/logger.ts";

declare global {
  namespace Express {
    interface Request {
      scope: Injector;
    }
  }
}

export interface RequestContext {
  id: string;
  method: string;
  path: string;
}

export const REQUEST_CONTEXT = new InjectionToken<RequestContext>(
  "REQUEST_CONTEXT",
);

export function requestScope(appInjector: Injector): RequestHandler {
  return (req, res, next) => {
    const ctx: RequestContext = {
      id: randomUUID(),
      method: req.method,
      path: req.path,
    };

    req.scope = Injector.create({
      name: `request-${ctx.id}`,
      parent: appInjector,
      providers: [{ provide: REQUEST_CONTEXT, useValue: ctx }],
    });

    res.on("close", () => {
      const logger = req.scope.resolve(Logger);
      void req.scope.dispose().then(
        () => logger.info(`[${ctx.id}] request scope disposed`),
        (err) => logger.error(`[${ctx.id}] dispose failed`, err),
      );
    });

    next();
  };
}
