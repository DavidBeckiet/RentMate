import type { RequestHandler } from "express";
import { ApplicationError } from "../errors/application-error.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createOriginGuard(frontendOrigin: string): RequestHandler {
  return (request, _response, next): void => {
    if (!unsafeMethods.has(request.method) || request.headers.origin === frontendOrigin) {
      next();
      return;
    }

    next(new ApplicationError("FORBIDDEN", "The request origin is not allowed."));
  };
}
