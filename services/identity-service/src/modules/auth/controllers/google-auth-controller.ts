import type { RequestHandler } from "express";
import { sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import {
  readScalarQueryValue,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { SessionCookieService } from "../session-cookie.js";
import type { SessionTokenService } from "../session-token.js";
import type { GoogleOAuthClient } from "../google-oauth-client.js";
import type { GoogleOAuthStateService } from "../google-oauth-state.js";
import type { GoogleAuthService } from "../services/google-auth-service.js";
import { validateGoogleAuthStartInput } from "../validations/google-auth-validation.js";

export interface GoogleAuthControllerDependencies {
  readonly client: GoogleOAuthClient | null;
  readonly service: GoogleAuthService | null;
  readonly stateService: GoogleOAuthStateService;
  readonly sessionTokenService: SessionTokenService;
  readonly sessionCookieService: SessionCookieService;
  readonly frontendOrigin: string;
}

function notConfigured(): ApplicationError {
  return new ApplicationError("GOOGLE_AUTH_NOT_CONFIGURED", "Google sign-in is not configured.");
}

function errorSlug(error: unknown): string {
  if (!(error instanceof ApplicationError)) return "failed";
  if (error.code === "GOOGLE_AUTH_NOT_CONFIGURED") return "not-configured";
  if (error.code === "GOOGLE_ACCOUNT_EXISTS") return "account-exists";
  if (error.code === "GOOGLE_ACCOUNT_NOT_REGISTERED") return "not-registered";
  if (error.code === "INVALID_CREDENTIALS") return "account-unavailable";
  return "failed";
}

function errorRedirect(
  frontendOrigin: string,
  intent: "LOGIN" | "REGISTER",
  role: "TENANT" | "LANDLORD" | null,
  error: unknown
): string {
  const path = intent === "REGISTER" && role ? `/register/${role === "LANDLORD" ? "landlord" : "tenant"}` : "/login";
  const url = new URL(path, frontendOrigin);
  url.searchParams.set("googleError", errorSlug(error));
  return url.href;
}

function defaultErrorRedirect(frontendOrigin: string, error: unknown): string {
  return errorRedirect(frontendOrigin, "LOGIN", null, error);
}

export function createGoogleStartHandler(dependencies: GoogleAuthControllerDependencies): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      validateQueryKeys(request.query, []);
      if (!dependencies.client || !dependencies.service) throw notConfigured();
      const input = validateGoogleAuthStartInput(request.body);
      const state = dependencies.stateService.create(response, input);
      const redirectUrl = dependencies.client.createAuthorizationUrl(state);
      sendObject(response, { redirectUrl });
    })().catch(next);
  };
}

export function createGoogleCallbackHandler(dependencies: GoogleAuthControllerDependencies): RequestHandler {
  return (request, response): void => {
    void (async () => {
      let intent: "LOGIN" | "REGISTER" = "LOGIN";
      let role: "TENANT" | "LANDLORD" | null = null;
      let consumedState = false;

      try {
        validateQueryKeys(request.query, ["code", "error", "error_description", "state"]);
        const stateValue = readScalarQueryValue(request.query.state, "state");
        if (!stateValue)
          throw new ApplicationError("GOOGLE_AUTH_FAILED", "Google authentication could not be verified.");

        const state = dependencies.stateService.consume(request, response, stateValue);
        consumedState = true;
        intent = state.intent;
        role = state.role;

        const providerError = readScalarQueryValue(request.query.error, "error");
        if (providerError) {
          response.redirect(
            303,
            errorRedirect(
              dependencies.frontendOrigin,
              intent,
              role,
              new ApplicationError("GOOGLE_AUTH_FAILED", "Google authentication was cancelled.")
            )
          );
          return;
        }

        const code = readScalarQueryValue(request.query.code, "code");
        if (!code || !dependencies.service) throw notConfigured();
        const user = await dependencies.service.complete({ code, state });
        const token = await dependencies.sessionTokenService.sign({ userId: user.id, role: user.role });
        dependencies.sessionCookieService.set(response, token);
        response.redirect(303, dependencies.frontendOrigin);
      } catch (error) {
        if (!consumedState) dependencies.stateService.clear(response);
        if (!response.headersSent)
          response.redirect(303, errorRedirect(dependencies.frontendOrigin, intent, role, error));
      }
    })();
  };
}
