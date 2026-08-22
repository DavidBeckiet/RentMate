import type { RequestHandler } from "express";
import { ApplicationError } from "../errors/application-error.js";
import { isUserRole, type UserRole } from "../types/authentication.js";
import { authenticationRequiredMessage } from "./authentication.js";

export const forbiddenRoleMessage = "You do not have permission to access this resource.";

export function createRoleMiddleware(allowedRoles: readonly [UserRole, ...UserRole[]]): RequestHandler {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0 || allowedRoles.some((role) => !isUserRole(role))) {
    throw new Error("Role middleware requires at least one valid role.");
  }

  const allowedRoleSet = new Set<UserRole>([...allowedRoles]);

  return (request, _response, next): void => {
    if (!request.auth) {
      next(new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage));
      return;
    }

    if (!allowedRoleSet.has(request.auth.role)) {
      next(new ApplicationError("FORBIDDEN", forbiddenRoleMessage));
      return;
    }

    next();
  };
}
