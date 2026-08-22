import type { NextFunction, Request, RequestHandler, Response } from "express";

const internalTokenHeader = "x-rentmate-internal-token";

export function createInternalServiceGuard(expectedToken: string | undefined): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!expectedToken) {
      response.status(503).json({
        error: {
          code: "INTERNAL_AUTHENTICATION_NOT_CONFIGURED",
          message: "Internal service authentication is not configured."
        }
      });
      return;
    }

    if (request.header(internalTokenHeader) !== expectedToken) {
      response.status(401).json({
        error: {
          code: "INTERNAL_AUTHENTICATION_REQUIRED",
          message: "Internal service authentication is required."
        }
      });
      return;
    }

    next();
  };
}

export { internalTokenHeader };
