import type { ErrorRequestHandler } from "express";

import { HttpError } from "../common/http-error.ts";
import { Logger } from "../common/logger.ts";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const logger = req.scope.resolve(Logger);
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) {
    logger.error(err?.message ?? "Unexpected error", err);
  }
  res.status(status).json({
    message: err.message ?? "Something went wrong!",
  });
};
