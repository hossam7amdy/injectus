import type { RequestHandler } from "express";

import { Logger } from "../common/logger.ts";
import { REQUEST_CONTEXT } from "./request-scope.ts";

export const requestLogger: RequestHandler = (req, _res, next) => {
  const { id, method, path } = req.scope.resolve(REQUEST_CONTEXT);
  const logger = req.scope.resolve(Logger);
  logger.info(`[${id}] ${method} ${path}`);
  next();
};
