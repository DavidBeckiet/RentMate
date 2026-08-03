import { randomBytes } from "node:crypto";
import type { Express } from "express";
import { createApp } from "./app.js";
import type { SqlExecutor } from "./db/sql-executor.js";
import { createAuthRepository } from "./modules/auth/auth-repository.js";
import { createLoginService } from "./modules/auth/login-service.js";
import { createPasswordService } from "./modules/auth/password.js";
import { createRegistrationService } from "./modules/auth/registration-service.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { createSessionCookieService, type SessionCookieService } from "./modules/auth/session-cookie.js";
import { createSessionTokenService, type SessionTokenService } from "./modules/auth/session-token.js";
import { registerUsersRoutes } from "./modules/users/routes.js";
import { createUsersRepository } from "./modules/users/users-repository.js";
import { createUsersService } from "./modules/users/users-service.js";
import type { Logger } from "./shared/logging/logger.js";
import { createProtectedAuthenticationMiddleware } from "./shared/middleware/authentication.js";
import { InMemoryRateLimitStore, type Clock, type RateLimitStore } from "./shared/middleware/rate-limit.js";

export interface BackendAppCompositionOptions {
  readonly frontendOrigin: string;
  readonly logger: Logger;
  readonly checkDatabaseConnection: () => Promise<void>;
  readonly sqlExecutor: SqlExecutor;
  readonly jwtSecret: string;
  readonly bcryptCost: number;
  readonly cookieSecure: boolean;
  readonly sessionTokenClock?: () => number;
  readonly authRateLimitClock?: Clock;
  readonly authRateLimitStore?: RateLimitStore;
  readonly sessionTokenService?: SessionTokenService;
  readonly sessionCookieService?: SessionCookieService;
}

export async function createBackendApp(options: BackendAppCompositionOptions): Promise<Express> {
  const passwordService = createPasswordService({ bcryptCost: options.bcryptCost });
  const sessionTokenService =
    options.sessionTokenService ??
    createSessionTokenService({ secret: options.jwtSecret, nowSeconds: options.sessionTokenClock });
  const sessionCookieService =
    options.sessionCookieService ?? createSessionCookieService({ secure: options.cookieSecure });
  const authRepository = createAuthRepository(options.sqlExecutor);
  const usersRepository = createUsersRepository(options.sqlExecutor);
  const registrationService = createRegistrationService({ passwordService, authRepository });
  const missingAccountPasswordHash = await passwordService.hashPassword(randomBytes(32).toString("base64url"));
  const loginService = createLoginService({
    findLoginAccount: authRepository.findLoginAccount,
    verifyPassword: passwordService.verifyPassword,
    missingAccountPasswordHash
  });
  const usersService = createUsersService(usersRepository);
  const requiredAuthentication = createProtectedAuthenticationMiddleware({
    verifySessionToken: sessionTokenService.verify,
    loadAuthenticationAccount: usersRepository.findAuthenticationAccountById
  });
  const authRateLimitStore = options.authRateLimitStore ?? new InMemoryRateLimitStore();

  return createApp({
    frontendOrigin: options.frontendOrigin,
    logger: options.logger,
    checkDatabaseConnection: options.checkDatabaseConnection,
    registerApiRoutes: (router) => {
      registerAuthRoutes(router, {
        registrationService,
        loginService,
        sessionTokenService,
        sessionCookieService,
        registrationRateLimitStore: authRateLimitStore,
        registrationRateLimitClock: options.authRateLimitClock,
        loginRateLimitStore: authRateLimitStore,
        loginRateLimitClock: options.authRateLimitClock
      });
      registerUsersRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        usersService
      });
    }
  });
}
