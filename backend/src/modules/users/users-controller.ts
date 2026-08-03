import type { RequestHandler } from "express";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { sendObject } from "../../shared/http/responses.js";
import { validateQueryKeys } from "../../shared/validation/request.js";
import { mapUserProfileToDto } from "./user-profile.js";
import { validateUpdateCurrentUserInput } from "./user-validation.js";
import type { UsersService } from "./users-service.js";

function requirePrincipal(request: Parameters<RequestHandler>[0]): NonNullable<typeof request.auth> {
  if (!request.auth) {
    throw new ApplicationError("AUTHENTICATION_REQUIRED", "Authentication is required to access this resource.");
  }

  return request.auth;
}

export function createGetCurrentUserHandler(usersService: UsersService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      // Authentication must be resolved before query validation to preserve 401 disclosure ordering.
      validateQueryKeys(request.query, []);
      const profile = await usersService.getCurrentUser(principal);
      sendObject(response, mapUserProfileToDto(profile));
    })().catch(next);
  };
}

export function createPatchCurrentUserHandler(usersService: UsersService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      validateQueryKeys(request.query, []);
      const input = validateUpdateCurrentUserInput(request.body, principal.role);
      const profile = await usersService.updateCurrentUserPhone(principal, input);
      sendObject(response, mapUserProfileToDto(profile));
    })().catch(next);
  };
}
