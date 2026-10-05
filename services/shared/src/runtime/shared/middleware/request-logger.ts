import { context, isSpanContextValid, trace } from "@opentelemetry/api";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Logger } from "../logging/logger.js";

export function requestLoggerMiddleware(logger: Logger): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    const activeSpanContext = trace.getSpan(context.active())?.spanContext();
    const spanContext = activeSpanContext && isSpanContextValid(activeSpanContext) ? activeSpanContext : undefined;
    const path = request.path;

    response.once("finish", () => {
      const durationNanoseconds = process.hrtime.bigint() - startedAt;
      const durationMilliseconds = Number(durationNanoseconds) / 1_000_000;

      logger.info("HTTP request completed", {
        requestId: request.requestId,
        traceId: spanContext?.traceId ?? null,
        spanId: spanContext?.spanId ?? null,
        method: request.method,
        path,
        status: response.statusCode,
        durationMs: Math.round(durationMilliseconds * 100) / 100
      });
    });

    next();
  };
}
