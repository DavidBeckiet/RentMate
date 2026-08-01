import type { RequestHandler } from "express";
import { sendObject } from "../../shared/http/responses.js";
import type { SessionCookieService } from "./session-cookie.js";
import type { SessionTokenService } from "./session-token.js";
import { validateRegistrationInput, type RegistrationRole } from "./registration-validation.js";
import type { RegistrationService } from "./registration-service.js";
import { mapUserProfileToDto } from "../users/user-profile.js";

export interface RegistrationControllerDependencies {
  readonly registrationService: RegistrationService;
  readonly sessionTokenService: SessionTokenService;
  readonly sessionCookieService: SessionCookieService;
}

export function createRegistrationHandler(
  role: RegistrationRole,
  dependencies: RegistrationControllerDependencies
): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const input = validateRegistrationInput(request.body, role);
      const registeredUser = await dependencies.registrationService.register(role, input);
      const token = await dependencies.sessionTokenService.sign({
        userId: registeredUser.id,
        role: registeredUser.role
      });

      dependencies.sessionCookieService.set(response, token);
      sendObject(response, mapUserProfileToDto(registeredUser), 201);
    })().catch(next);
  };
}
