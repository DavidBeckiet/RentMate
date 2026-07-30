import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Logger } from "../logging/logger.js";

export function requestLoggerMiddleware(logger: Logger): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();

    response.once("finish", () => {
      const durationNanoseconds = process.hrtime.bigint() - startedAt;
      const durationMilliseconds = Number(durationNanoseconds) / 1_000_000;

      logger.info("HTTP request completed", {
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.round(durationMilliseconds * 100) / 100
      });
    });

    next();
  };
}
