import { createServer, type Server } from "node:http";
import { EnvironmentConfigurationError, loadEnvironment } from "../../shared/src/runtime/config/env.js";
import { checkDatabaseConnection, closeRuntimePool, getRuntimePool } from "../../shared/src/runtime/db/pool.js";
import { createSqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createApp } from "../../shared/src/runtime/app.js";
import { createSessionTokenService } from "../../shared/session-token.js";
import { createFavoriteRepository } from "./modules/favorites/repositories/favorite-repository.js";
import { createFavoriteService } from "./modules/favorites/services/favorite-service.js";
import { registerFavoriteRoutes } from "./modules/favorites/routes.js";
import { createLogger } from "../../shared/src/runtime/shared/logging/logger.js";
import { createProtectedAuthenticationMiddleware } from "../../shared/src/runtime/shared/middleware/authentication.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { createShutdownHandler } from "../../shared/src/runtime/shutdown.js";
import { applyDatabaseOverrides } from "../../shared/database-overrides.js";
import { createIdentityAccountClient } from "../../shared/identity-account-client.js";
import { createListingCatalogClient } from "../../shared/listing-catalog-client.js";
import { withTransaction } from "../../shared/src/runtime/db/transaction.js";
import { createContactRepository } from "./modules/contact/repositories/contact-repository.js";
import { createContactService } from "./modules/contact/services/contact-service.js";
import { registerContactRoutes } from "./modules/contact/routes.js";
import { createSavedSearchRepository } from "./modules/saved-searches/repositories/saved-search-repository.js";
import { registerSavedSearchRoutes } from "./modules/saved-searches/routes.js";
import { createSavedSearchService } from "./modules/saved-searches/services/saved-search-service.js";
import { createReviewRepository } from "./modules/reviews/repositories/review-repository.js";
import { createReviewService } from "./modules/reviews/services/review-service.js";
import { registerReviewRoutes } from "./modules/reviews/routes.js";
import { createLeadRepository } from "./modules/leads/repositories/lead-repository.js";
import { createLeadService } from "./modules/leads/services/lead-service.js";
import { registerLeadRoutes } from "./modules/leads/routes.js";
import { createAnalyticsRepository } from "./modules/analytics/repositories/analytics-repository.js";
import { createAnalyticsService } from "./modules/analytics/services/analytics-service.js";
import { registerAnalyticsRoutes } from "./modules/analytics/routes.js";

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

async function startEngagementService(): Promise<void> {
  applyDatabaseOverrides("ENGAGEMENT");
  process.env.PORT = process.env.ENGAGEMENT_SERVICE_PORT ?? "4300";

  let config;
  try {
    config = loadEnvironment();
  } catch (error) {
    const logger = createLogger("info");
    logger.error("Engagement service configuration validation failed", {
      reason: error instanceof EnvironmentConfigurationError ? error.message : "Unexpected configuration error"
    });
    process.exitCode = 1;
    return;
  }

  const logger = createLogger(config.logLevel);
  const databasePool = getRuntimePool(config.database, logger);
  const sqlExecutor = createSqlExecutor(databasePool);
  const sessionTokenService = createSessionTokenService({ secret: config.auth.jwtSecret });
  const identityServiceUrl = process.env.IDENTITY_SERVICE_URL;
  const listingServiceUrl = process.env.LISTING_SERVICE_URL;
  if (!identityServiceUrl || !listingServiceUrl) {
    logger.error("Engagement service requires IDENTITY_SERVICE_URL and LISTING_SERVICE_URL.");
    await closeRuntimePool();
    process.exitCode = 1;
    return;
  }
  const identityAccountClient = createIdentityAccountClient({
    baseUrl: identityServiceUrl,
    internalToken: process.env.SERVICE_INTERNAL_TOKEN ?? ""
  });
  const listingCatalogClient = createListingCatalogClient({
    baseUrl: listingServiceUrl,
    internalToken: process.env.SERVICE_INTERNAL_TOKEN ?? ""
  });
  const contactRepository = createContactRepository();
  const contactService = createContactService({
    repository: contactRepository,
    listingCatalogClient,
    identityAccountClient,
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const loadAuthenticationAccount = identityAccountClient.loadAuthenticationAccount;
  const requiredAuthentication = createProtectedAuthenticationMiddleware({
    verifySessionToken: sessionTokenService.verify,
    loadAuthenticationAccount
  });
  const tenantRole = createRoleMiddleware(["TENANT"]);
  const adminRole = createRoleMiddleware(["ADMIN"]);
  const landlordRole = createRoleMiddleware(["LANDLORD"]);
  const savedSearchService = createSavedSearchService({
    repository: createSavedSearchRepository(),
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const reviewService = createReviewService({
    repository: createReviewRepository(),
    listingCatalogClient,
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const leadService = createLeadService({
    repository: createLeadRepository(),
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const analyticsService = createAnalyticsService({
    repository: createAnalyticsRepository(),
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const app = createApp({
    frontendOrigin: config.frontendOrigin,
    logger,
    checkDatabaseConnection: () => checkDatabaseConnection(databasePool),
    registerApiRoutes: (router) => {
      registerFavoriteRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        tenantRoleMiddleware: tenantRole,
        favoriteService: createFavoriteService(
          createFavoriteRepository(sqlExecutor, {
            loadPublicSummariesByIds: listingCatalogClient.loadPublicSummariesByIds
          }),
          { loadActiveLandlordIds: identityAccountClient.loadActiveLandlordIds }
        )
      });
      registerContactRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        tenantRoleMiddleware: tenantRole,
        landlordRoleMiddleware: landlordRole,
        contactService
      });
      registerSavedSearchRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        tenantRoleMiddleware: tenantRole,
        service: savedSearchService
      });
      registerReviewRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        tenantRoleMiddleware: tenantRole,
        adminRoleMiddleware: adminRole,
        service: reviewService
      });
      registerLeadRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        landlordRoleMiddleware: landlordRole,
        service: leadService
      });
      registerAnalyticsRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        landlordRoleMiddleware: landlordRole,
        service: analyticsService
      });
    }
  });
  const server = createServer(app);

  try {
    await listen(server, config.port);
  } catch (error) {
    logger.error("Engagement service startup failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    await closeRuntimePool();
    process.exitCode = 1;
    return;
  }

  logger.info("Engagement service started", { nodeEnvironment: config.nodeEnv, port: config.port });
  const shutdown = createShutdownHandler({ server, closeDatabase: closeRuntimePool, logger });
  const handleSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal).catch(() => {
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
}

void startEngagementService();
