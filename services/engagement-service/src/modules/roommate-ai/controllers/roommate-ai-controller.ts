import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { validateBodyFields, validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { RoommateAiCapabilityService } from "../services/roommate-ai-capability-service.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

export function getRoommateAiCapabilitiesHandler(service: RoommateAiCapabilityService): RequestHandler {
  return (request, response, next) => {
    try {
      validateQueryKeys(request.query, []);
      if (request.body !== undefined) validateBodyFields(request.body, []);
      sendObject(response, service.getCapabilities(principal(request)));
    } catch (error) {
      next(error);
    }
  };
}
