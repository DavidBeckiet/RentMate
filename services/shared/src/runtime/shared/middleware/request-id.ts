import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const requestId = `req_${randomUUID().replaceAll("-", "")}`;

  request.requestId = requestId;
  response.locals.requestId = requestId;
  next();
}
