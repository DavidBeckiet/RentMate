import { metrics } from "@opentelemetry/api";
import type { NextFunction, Request, RequestHandler, Response } from "express";

const meter = metrics.getMeter("rentmate.service.http");
const requestCounter = meter.createCounter("rentmate.service.http.server.request.count", {
  description: "Service HTTP requests completed"
});
const requestDuration = meter.createHistogram("rentmate.service.http.server.request.duration", {
  description: "Service HTTP request duration",
  unit: "s"
});
const activeRequests = meter.createUpDownCounter("rentmate.service.http.server.request.active", {
  description: "Service HTTP requests currently in flight"
});

export function normalizedHttpRoute(path: string): string {
  return path
    .replace(/\/[0-9]+(?=\/|$)/g, "/:id")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":uuid")
    .slice(0, 160);
}

export function httpMetricsMiddleware(): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const route = normalizedHttpRoute(request.path);
    const startedAt = process.hrtime.bigint();
    const baseAttributes = {
      "http.request.method": request.method,
      "http.route": route
    };
    let completed = false;

    activeRequests.add(1, baseAttributes);
    const complete = (): void => {
      if (completed) return;
      completed = true;
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      const attributes = {
        ...baseAttributes,
        "http.response.status_code": response.statusCode
      };
      activeRequests.add(-1, baseAttributes);
      requestCounter.add(1, attributes);
      requestDuration.record(durationSeconds, attributes);
    };

    response.once("finish", complete);
    response.once("close", complete);
    next();
  };
}
