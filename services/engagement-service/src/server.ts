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
import {
  createOptionalAuthenticationMiddleware,
  createProtectedAuthenticationMiddleware
} from "../../shared/src/runtime/shared/middleware/authentication.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { createShutdownHandler } from "../../shared/src/runtime/shutdown.js";
import { applyDatabaseOverrides } from "../../shared/database-overrides.js";
import { createIdentityAccountClient } from "../../shared/identity-account-client.js";
import { createListingCatalogClient } from "../../shared/listing-catalog-client.js";
import { createInternalServiceGuard } from "../../shared/internal-service-auth.js";
import { withTransaction } from "../../shared/src/runtime/db/transaction.js";
import { createContactRepository } from "./modules/contact/repositories/contact-repository.js";
import { createContactSafetyRepository } from "./modules/contact/repositories/contact-safety-repository.js";
import { createContactService } from "./modules/contact/services/contact-service.js";
import { registerContactRoutes } from "./modules/contact/routes.js";
import { createInquiryRealtimeHub } from "./modules/contact/realtime/inquiry-realtime-hub.js";
import { createSavedSearchRepository } from "./modules/saved-searches/repositories/saved-search-repository.js";
import { registerSavedSearchRoutes } from "./modules/saved-searches/routes.js";
import { createSavedSearchService } from "./modules/saved-searches/services/saved-search-service.js";
import { createSavedSearchNotificationRepository } from "./modules/saved-searches/repositories/saved-search-notification-repository.js";
import { createSavedSearchNotificationService } from "./modules/saved-searches/services/saved-search-notification-service.js";
import { createReviewRepository } from "./modules/reviews/repositories/review-repository.js";
import { createReviewReportRepository } from "./modules/reviews/repositories/review-report-repository.js";
import { createReviewService } from "./modules/reviews/services/review-service.js";
import { registerReviewRoutes } from "./modules/reviews/routes.js";
import { createLeadRepository } from "./modules/leads/repositories/lead-repository.js";
import { createLeadService } from "./modules/leads/services/lead-service.js";
import { registerLeadRoutes } from "./modules/leads/routes.js";
import { createLeadReminderNotificationRepository } from "./modules/leads/repositories/lead-reminder-notification-repository.js";
import { createLeadReminderScheduler } from "./modules/leads/services/lead-reminder-scheduler.js";
import { createAnalyticsRepository } from "./modules/analytics/repositories/analytics-repository.js";
import { createAnalyticsService } from "./modules/analytics/services/analytics-service.js";
import { registerAnalyticsRoutes } from "./modules/analytics/routes.js";
import { createListingNoteRepository } from "./modules/listing-notes/repositories/listing-note-repository.js";
import { createListingNoteService } from "./modules/listing-notes/services/listing-note-service.js";
import { registerListingNoteRoutes } from "./modules/listing-notes/routes.js";
import { createSupportRepository } from "./modules/support/repositories/support-repository.js";
import { createSupportService } from "./modules/support/services/support-service.js";
import { registerSupportRoutes } from "./modules/support/routes.js";
import { createRoommateRepository } from "./modules/roommate/repositories/roommate-repository.js";
import { createRoommateService } from "./modules/roommate/services/roommate-service.js";
import { createRoommateSafetyRepository } from "./modules/roommate/repositories/roommate-safety-repository.js";
import { createRoommateSafetyService } from "./modules/roommate/services/roommate-safety-service.js";
import { createRoommateExpirationScheduler } from "./modules/roommate/services/roommate-expiration-scheduler.js";
import { registerRoommateRoutes } from "./modules/roommate/routes.js";
import {
  parseRoommateAiConfiguration,
  RoommateAiConfigurationError
} from "./modules/roommate-ai/config/roommate-ai-config.js";
import { registerRoommateAiRoutes } from "./modules/roommate-ai/routes.js";
import { RoommateAiCapabilityService } from "./modules/roommate-ai/services/roommate-ai-capability-service.js";
import {
  validateListingModerationNotificationBody,
  validateListingPublishedNotificationBody,
  validateListingAvailabilityNotificationBody
} from "./modules/contact/validations/internal-notification-validation.js";

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
  let roommateAiConfig;
  try {
    config = loadEnvironment();
    roommateAiConfig = parseRoommateAiConfiguration(process.env);
  } catch (error) {
    const logger = createLogger("info");
    logger.error("Engagement service configuration validation failed", {
      reason:
        error instanceof EnvironmentConfigurationError || error instanceof RoommateAiConfigurationError
          ? error.message
          : "Unexpected configuration error"
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
  const contactSafetyRepository = createContactSafetyRepository();
  const inquiryRealtimeHub = createInquiryRealtimeHub();
  const contactService = createContactService({
    repository: contactRepository,
    safetyRepository: contactSafetyRepository,
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
  const optionalAuthentication = createOptionalAuthenticationMiddleware({
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
  const savedSearchNotificationService = createSavedSearchNotificationService({
    repository: createSavedSearchNotificationRepository(),
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const reviewService = createReviewService({
    repository: createReviewRepository(),
    reviewReportRepository: createReviewReportRepository(),
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
  const leadReminderScheduler = createLeadReminderScheduler({
    repository: createLeadReminderNotificationRepository(),
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    },
    logger
  });
  const analyticsService = createAnalyticsService({
    repository: createAnalyticsRepository(),
    listingCatalogClient,
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const listingNoteService = createListingNoteService({
    repository: createListingNoteRepository(),
    loadPublicSummariesByIds: listingCatalogClient.loadPublicSummariesByIds,
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const supportService = createSupportService({
    repository: createSupportRepository(),
    identityAccountClient,
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const roommateRepository = createRoommateRepository();
  const roommateSafetyRepository = createRoommateSafetyRepository();
  const roommateSafetyService = createRoommateSafetyService({
    roommateRepository,
    safetyRepository: roommateSafetyRepository,
    identityAccountClient,
    riskConfig: config.roommateRisk,
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const roommateService = createRoommateService({
    repository: roommateRepository,
    identityAccountClient,
    listingCatalogClient,
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    }
  });
  const roommateExpirationScheduler = createRoommateExpirationScheduler({
    repository: roommateRepository,
    transactionRunner: {
      run: (operation) => withTransaction(databasePool, logger, operation)
    },
    logger
  });
  const roommateAiCapabilityService = new RoommateAiCapabilityService(roommateAiConfig);
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
      registerRoommateRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        tenantRoleMiddleware: tenantRole,
        adminRoleMiddleware: adminRole,
        service: roommateService,
        safetyService: roommateSafetyService
      });
      registerRoommateAiRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        tenantRoleMiddleware: tenantRole,
        capabilityService: roommateAiCapabilityService
      });
      registerContactRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        tenantRoleMiddleware: tenantRole,
        landlordRoleMiddleware: landlordRole,
        adminRoleMiddleware: adminRole,
        contactService,
        realtimeHub: inquiryRealtimeHub
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
        optionalAuthenticationMiddleware: optionalAuthentication,
        landlordRoleMiddleware: landlordRole,
        service: analyticsService
      });
      registerListingNoteRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        tenantRoleMiddleware: tenantRole,
        service: listingNoteService
      });
      registerSupportRoutes(router, {
        authenticationMiddleware: requiredAuthentication,
        adminRoleMiddleware: adminRole,
        service: supportService
      });
    },
    registerInternalRoutes: (internalApp) => {
      const internalServiceGuard = createInternalServiceGuard(process.env.SERVICE_INTERNAL_TOKEN);
      internalApp.post(
        "/internal/v1/notifications/listing-moderation",
        internalServiceGuard,
        (request, response, next) => {
          void (async () => {
            const input = validateListingModerationNotificationBody(request.body);
            await withTransaction(databasePool, logger, (executor) =>
              contactRepository.createListingModerationNotification(executor, {
                recipientId: input.landlordId,
                listingId: input.listingId,
                moderationHistoryId: input.moderationHistoryId,
                eventType: input.eventType
              })
            );
            response.status(204).end();
          })().catch(next);
        }
      );
      internalApp.post(
        "/internal/v1/notifications/listing-published",
        internalServiceGuard,
        (request, response, next) => {
          void (async () => {
            const input = validateListingPublishedNotificationBody(request.body);
            const summaries = await listingCatalogClient.loadPublicSummariesByIds([input.listingId]);
            const listing = summaries[0];
            if (listing) await savedSearchNotificationService.notifyListingPublished(listing);
            response.status(204).end();
          })().catch(next);
        }
      );
      internalApp.post(
        "/internal/v1/notifications/listing-availability",
        internalServiceGuard,
        (request, response, next) => {
          void (async () => {
            const input = validateListingAvailabilityNotificationBody(request.body);
            await withTransaction(databasePool, logger, (executor) =>
              contactRepository.createListingAvailabilityNotification(executor, {
                recipientId: input.landlordId,
                listingId: input.listingId,
                dedupeKey: input.dedupeKey
              })
            );
            response.status(204).end();
          })().catch(next);
        }
      );
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

  leadReminderScheduler.start();
  roommateExpirationScheduler.start();
  logger.info("Engagement service started", { nodeEnvironment: config.nodeEnv, port: config.port });
  const shutdown = createShutdownHandler({
    server,
    closeDatabase: async () => {
      leadReminderScheduler.stop();
      roommateExpirationScheduler.stop();
      await closeRuntimePool();
    },
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

void startEngagementService();
