import type { RequestHandler } from "express";
import { ApplicationError } from "../errors/application-error.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createOriginGuard(frontendOrigin: string): RequestHandler {
  return (request, _response, next): void => {
    // Service-to-service routes authenticate with the internal token instead of a browser Origin.
    if (request.path.startsWith("/internal/")) {
      next();
      return;
    }

    if (!unsafeMethods.has(request.method) || request.headers.origin === frontendOrigin) {
      next();
      return;
    }

    next(new ApplicationError("FORBIDDEN", "The request origin is not allowed."));
  };
}
