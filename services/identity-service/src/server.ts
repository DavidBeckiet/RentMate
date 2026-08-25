import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { EnvironmentConfigurationError, loadEnvironment } from "../../shared/src/runtime/config/env.js";
import { checkDatabaseConnection, closeRuntimePool, getRuntimePool } from "../../shared/src/runtime/db/pool.js";
import { createSqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { withTransaction } from "../../shared/src/runtime/db/transaction.js";
import { createApp } from "../../shared/src/runtime/app.js";
import { createAuthRepository } from "./modules/auth/repositories/auth-repository.js";
import { createLoginService } from "./modules/auth/services/login-service.js";
import { createPasswordService } from "./modules/auth/password.js";
import { createRegistrationService } from "./modules/auth/services/registration-service.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { createSessionCookieService } from "./modules/auth/session-cookie.js";
import { createSessionTokenService } from "./modules/auth/session-token.js";
import { createAdminUserRepository } from "./modules/users/repositories/admin-user-repository.js";
import { createAdminUserService } from "./modules/users/services/admin-user-service.js";
import { registerUsersRoutes } from "./modules/users/routes.js";
import { createUsersRepository } from "./modules/users/repositories/users-repository.js";
import { createUsersService } from "./modules/users/services/users-service.js";
import { createLogger } from "../../shared/src/runtime/shared/logging/logger.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { InMemoryRateLimitStore } from "../../shared/src/runtime/shared/middleware/rate-limit.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { createShutdownHandler } from "../../shared/src/runtime/shutdown.js";
import { applyDatabaseOverrides } from "../../shared/database-overrides.js";
import { createInternalServiceGuard } from "../../shared/internal-service-auth.js";
import { createVerificationRepository } from "./modules/verifications/repositories/verification-repository.js";
import { createVerificationService } from "./modules/verifications/services/verification-service.js";
import { registerVerificationRoutes } from "./modules/verifications/routes.js";
import { createContactVerificationRepository } from "./modules/verifications/repositories/contact-verification-repository.js";
import { createContactVerificationService } from "./modules/verifications/services/contact-verification-service.js";
import { createContactVerificationDelivery } from "./modules/verifications/contact-verification-delivery.js";
import type { TransactionRunner } from "./shared/transaction.js";

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port);
  });
}

async function startIdentityService(): Promise<void> {
  applyDatabaseOverrides("IDENTITY");
  process.env.PORT = process.env.IDENTITY_SERVICE_PORT ?? "4100";

  let config;
  try {
    config = loadEnvironment();
  } catch (error) {
    const logger = createLogger("info");
    logger.error("Identity service configuration validation failed", {
      reason: error instanceof EnvironmentConfigurationError ? error.message : "Unexpected configuration error"
    });
    process.exitCode = 1;
    return;
  }

  const logger = createLogger(config.logLevel);
  const databasePool = getRuntimePool(config.database, logger);
  const sqlExecutor = createSqlExecutor(databasePool);
  const passwordService = createPasswordService({ bcryptCost: config.auth.bcryptCost });
  const sessionTokenService = createSessionTokenService({ secret: config.auth.jwtSecret });
  const sessionCookieService = createSessionCookieService({ secure: config.auth.cookieSecure });
  const authRepository = createAuthRepository(sqlExecutor);
  const usersRepository = createUsersRepository(sqlExecutor);
  const registrationService = createRegistrationService({ passwordService, authRepository });
  const missingAccountPasswordHash = await passwordService.hashPassword(randomBytes(32).toString("base64url"));
  const loginService = createLoginService({
    findLoginAccount: authRepository.findLoginAccount,
    verifyPassword: passwordService.verifyPassword,
    missingAccountPasswordHash
  });
  const usersService = createUsersService(usersRepository);
  const verificationRepository = createVerificationRepository();
  const contactVerificationRepository = createContactVerificationRepository();
  const transactionRunner: TransactionRunner = (operation) => withTransaction(databasePool, logger, operation);
  const adminUserService = createAdminUserService({
    repository: createAdminUserRepository(sqlExecutor),
    transactionRunner
  });
  const verificationService = createVerificationService({ repository: verificationRepository, transactionRunner });
  const contactVerificationDelivery = createContactVerificationDelivery({
    nodeEnvironment: config.nodeEnv,
    deliveryUrl: config.verification.deliveryUrl,
    deliveryToken: config.verification.deliveryToken
  });
  const contactVerificationService = createContactVerificationService({
    contactRepository: contactVerificationRepository,
    verificationRepository,
    transactionRunner,
    delivery: contactVerificationDelivery,
    secretPepper: config.auth.jwtSecret
  });
  const requiredAuthentication = createProtectedAuthenticationMiddleware({
    verifySessionToken: sessionTokenService.verify,
    loadAuthenticationAccount: usersRepository.findAuthenticationAccountById
  });
  const adminRole = createRoleMiddleware(["ADMIN"]);
  const landlordRole = createRoleMiddleware(["LANDLORD"]);
  const authRateLimitStore = new InMemoryRateLimitStore();
  const contactVerificationRateLimitStore = new InMemoryRateLimitStore();
  const internalServiceGuard = createInternalServiceGuard(process.env.SERVICE_INTERNAL_TOKEN);
  const app = createApp({
    frontendOrigin: config.frontendOrigin,
    logger,
    checkDatabaseConnection: () => checkDatabaseConnection(databasePool),
    registerApiRoutes: (router) => {
      registerAuthRoutes(router, {
        registrationService,
        loginService,
        sessionTokenService,
        sessionCookieService,
        registrationRateLimitStore: authRateLimitStore,
        loginRateLimitStore: authRateLimitStore
      });
      registerUsersRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        adminRoleMiddleware: adminRole,
        adminUserService,
        usersService
      });
      registerVerificationRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        landlordRoleMiddleware: landlordRole,
        adminRoleMiddleware: adminRole,
        service: verificationService,
        contactVerificationService,
        contactVerificationRateLimitStore
      });
    },
    registerInternalRoutes: (internalApp) => {
      internalApp.get("/internal/v1/accounts/:userId", internalServiceGuard, (request, response, next) => {
        const userId = Number(request.params.userId);
        if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2_147_483_647) {
          response.status(400).end();
          return;
        }

        void usersRepository
          .findAuthenticationAccountById(userId)
          .then((account) => {
            if (account === null) {
              response.status(404).end();
              return;
            }
            response.status(200).json({ data: account });
          })
          .catch(next);
      });
      internalApp.get("/internal/v1/profiles", internalServiceGuard, (request, response, next) => {
        const rawIds = request.query.ids;
        if (typeof rawIds !== "string" || rawIds.length === 0) {
          response.status(400).end();
          return;
        }
        const ids = rawIds.split(",").map((value) => Number(value));
        if (
          ids.length === 0 ||
          ids.length > 100 ||
          ids.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647)
        ) {
          response.status(400).end();
          return;
        }

        const findProfilesByIds = usersRepository.findProfilesByIds;
        if (!findProfilesByIds) {
          next(new Error("Identity users repository does not support profile lookup."));
          return;
        }
        void findProfilesByIds([...new Set(ids)])
          .then((profiles) =>
            response.status(200).json({
              data: profiles.map(({ id, role, email, phone, isActive }) => ({ id, role, email, phone, isActive }))
            })
          )
          .catch(next);
      });
      internalApp.get("/internal/v1/landlords/active-ids", internalServiceGuard, (_request, response, next) => {
        const findActiveLandlordIds = usersRepository.findActiveLandlordIds;
        if (!findActiveLandlordIds) {
          next(new Error("Identity users repository does not support active landlord lookup."));
          return;
        }
        void findActiveLandlordIds()
          .then((ids) => response.status(200).json({ data: ids }))
          .catch(next);
      });
      internalApp.get("/internal/v1/landlords/verified-ids", internalServiceGuard, (request, response, next) => {
        const rawIds = request.query.ids;
        if (typeof rawIds !== "string" || rawIds.length === 0) {
          response.status(400).end();
          return;
        }
        const ids = [...new Set(rawIds.split(",").map((value) => Number(value)))];
        if (
          ids.length === 0 ||
          ids.length > 100 ||
          ids.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647)
        ) {
          response.status(400).end();
          return;
        }
        void verificationRepository
          .findVerifiedLandlordIds(sqlExecutor, ids)
          .then((verifiedIds) => response.status(200).json({ data: verifiedIds }))
          .catch(next);
      });
      const latestVerificationPreview = contactVerificationDelivery.latestPreview;
      if (config.nodeEnv !== "production" && latestVerificationPreview) {
        internalApp.get("/internal/v1/verification-delivery/preview", internalServiceGuard, (request, response) => {
          const channel = request.query.channel;
          if (channel !== undefined && channel !== "EMAIL" && channel !== "PHONE") {
            response.status(400).end();
            return;
          }
          response.status(200).json({ data: latestVerificationPreview(channel as "EMAIL" | "PHONE" | undefined) });
        });
      }
    }
  });
  const server = createServer(app);

  try {
    await listen(server, config.port);
  } catch (error) {
    logger.error("Identity service startup failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    await closeRuntimePool();
    process.exitCode = 1;
    return;
  }

  logger.info("Identity service started", {
    nodeEnvironment: config.nodeEnv,
    port: config.port
  });
  const shutdown = createShutdownHandler({
    server,
    closeDatabase: closeRuntimePool,
    logger
  });
  const handleSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal).catch(() => {
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
}

void startIdentityService();
