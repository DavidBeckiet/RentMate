import type { RequestHandler } from "express";
import { sendNoContent, sendObject } from "../../shared/http/responses.js";
import type { SessionCookieService } from "./session-cookie.js";
import type { SessionTokenService } from "./session-token.js";
import type { LoginService } from "./login-service.js";
import { validateLoginInput, validateLogoutBody } from "./login-validation.js";
import { mapUserProfileToDto } from "../users/user-profile.js";

export interface LoginControllerDependencies {
  readonly loginService: LoginService;
  readonly sessionTokenService: SessionTokenService;
  readonly sessionCookieService: SessionCookieService;
}

export interface LogoutControllerDependencies {
  readonly sessionCookieService: SessionCookieService;
}

export function createLoginHandler(dependencies: LoginControllerDependencies): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const input = validateLoginInput(request.body);
      const user = await dependencies.loginService.login(input);
      const token = await dependencies.sessionTokenService.sign({ userId: user.id, role: user.role });

      dependencies.sessionCookieService.set(response, token);
      sendObject(response, mapUserProfileToDto(user));
    })().catch(next);
  };
}

export function createLogoutHandler(dependencies: LogoutControllerDependencies): RequestHandler {
  return (request, response, next): void => {
    try {
      validateLogoutBody(request.body);
      dependencies.sessionCookieService.clear(response);
      sendNoContent(response);
    } catch (error) {
      next(error);
    }
  };
}
