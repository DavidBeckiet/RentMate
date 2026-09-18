import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { IdentityOverviewService } from "../services/identity-overview-service.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

export function createGetIdentityOverviewHandler(service: IdentityOverviewService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      sendObject(response, await service.read(principal(request)));
    })().catch(next);
  };
}
