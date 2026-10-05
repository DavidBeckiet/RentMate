import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const incomingRequestId = request.header("x-request-id");
  const requestId =
    incomingRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(incomingRequestId)
      ? incomingRequestId
      : `req_${randomUUID().replaceAll("-", "")}`;

  request.requestId = requestId;
  response.locals.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
}
