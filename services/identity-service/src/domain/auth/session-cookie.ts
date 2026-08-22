import type { CookieOptions, Response } from "express";
import { jwtLifetimeSeconds } from "../../../../shared/src/runtime/config/env.js";
import { sessionCookieName } from "../../../../shared/src/runtime/shared/types/authentication.js";

const sessionCookiePath = "/";

export interface SessionCookieService {
  set(response: Response, token: string): void;
  clear(response: Response): void;
}

export function createSessionCookieService(options: Readonly<{ secure: boolean }>): SessionCookieService {
  if (typeof options.secure !== "boolean") {
    throw new Error("Session cookie secure configuration must be a boolean.");
  }

  const matchingOptions: Readonly<CookieOptions> = Object.freeze({
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure,
    path: sessionCookiePath
  });

  return Object.freeze({
    set(response: Response, token: string): void {
      if (typeof token !== "string" || token.trim().length === 0) {
        throw new Error("Session token is required.");
      }

      response.cookie(sessionCookieName, token, {
        ...matchingOptions,
        maxAge: jwtLifetimeSeconds * 1000
      });
    },

    clear(response: Response): void {
      response.clearCookie(sessionCookieName, matchingOptions);
    }
  });
}
