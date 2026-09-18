import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import type { AdminUserService } from "../services/admin-user-service.js";
import {
  parseAdminUserId,
  validateAdminUserActivationBody,
  validateAdminUserActivationQuery,
  validateAdminUserCollectionQuery,
  validateAdminUserDetailQuery,
  validateAdminUserReadBody
} from "../validations/admin-user-validation.js";
import { mapAdminUserDetailToDto, mapUserProfileToDto } from "../user-profile.js";

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

export function createListAdminUsersHandler(service: AdminUserService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const query = validateAdminUserCollectionQuery(request.query);
      validateAdminUserReadBody(request.body);
      const page = await service.listUsers(principal, query);
      sendPaginated(response, page.users.map(mapUserProfileToDto), page);
    })().catch(next);
  };
}

export function createGetAdminUserHandler(service: AdminUserService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const userId = parseAdminUserId(request.params.userId);
      validateAdminUserDetailQuery(request.query);
      validateAdminUserReadBody(request.body);
      sendObject(response, mapAdminUserDetailToDto(await service.getUser(principal, userId)));
    })().catch(next);
  };
}

export function createSetAdminUserActivationHandler(service: AdminUserService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const userId = parseAdminUserId(request.params.userId);
      validateAdminUserActivationQuery(request.query);
      const input = validateAdminUserActivationBody(request.body);
      const profile = await service.setActivation(principal, userId, input);
      sendObject(response, mapUserProfileToDto(profile));
    })().catch(next);
  };
}
