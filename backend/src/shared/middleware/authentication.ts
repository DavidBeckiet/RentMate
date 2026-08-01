import type { NextFunction, Request, RequestHandler } from "express";
import { ApplicationError } from "../errors/application-error.js";
import {
  isUserRole,
  isVerifiedSessionClaims,
  type AuthenticatedPrincipal,
  type AuthenticationAccount,
  type LoadAuthenticationAccount,
  type VerifySessionToken
} from "../types/authentication.js";

const sessionCookieName = "rentmate_session";

export const authenticationRequiredMessage = "Authentication is required to access this resource.";

export interface AuthenticationMiddlewareDependencies {
  readonly verifySessionToken: VerifySessionToken;
  readonly loadAuthenticationAccount: LoadAuthenticationAccount;
}

function isAuthenticationAccount(value: AuthenticationAccount): boolean {
  return (
    Number.isInteger(value.id) &&
    value.id > 0 &&
    value.id <= 2_147_483_647 &&
    isUserRole(value.role) &&
    typeof value.isActive === "boolean"
  );
}

async function resolvePrincipal(
  request: Request,
  dependencies: AuthenticationMiddlewareDependencies
): Promise<AuthenticatedPrincipal | null> {
  const token = request.cookies[sessionCookieName];
  if (!token) {
    return null;
  }

  const verification = await dependencies.verifySessionToken(token);
  if (verification.status === "invalid" || !isVerifiedSessionClaims(verification.claims)) {
    return null;
  }

  const account = await dependencies.loadAuthenticationAccount(verification.claims.userId);
  if (account === null) {
    return null;
  }

  if (!isAuthenticationAccount(account)) {
    throw new Error("Authentication account loader returned invalid data.");
  }

  if (!account.isActive || account.id !== verification.claims.userId || account.role !== verification.claims.role) {
    return null;
  }

  return Object.freeze({
    userId: account.id,
    role: account.role
  });
}

function attachPrincipal(request: Request, principal: AuthenticatedPrincipal): void {
  Object.defineProperty(request, "auth", {
    configurable: false,
    enumerable: false,
    value: principal,
    writable: false
  });
}

function runAuthentication(
  request: Request,
  next: NextFunction,
  dependencies: AuthenticationMiddlewareDependencies,
  required: boolean
): void {
  void resolvePrincipal(request, dependencies)
    .then((principal) => {
      if (principal) {
        attachPrincipal(request, principal);
        next();
        return;
      }

      if (required) {
        next(new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage));
        return;
      }

      next();
    })
    .catch(next);
}

export function createProtectedAuthenticationMiddleware(
  dependencies: AuthenticationMiddlewareDependencies
): RequestHandler {
  return (request, _response, next): void => {
    runAuthentication(request, next, dependencies, true);
  };
}

export function createOptionalAuthenticationMiddleware(
  dependencies: AuthenticationMiddlewareDependencies
): RequestHandler {
  return (request, _response, next): void => {
    runAuthentication(request, next, dependencies, false);
  };
}
