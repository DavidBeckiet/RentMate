import { createServer, type Server } from "node:http";
import { EnvironmentConfigurationError, loadEnvironment } from "../../shared/src/runtime/config/env.js";
import { checkDatabaseConnection, closeRuntimePool, getRuntimePool } from "../../shared/src/runtime/db/pool.js";
import { createSqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { withTransaction } from "../../shared/src/runtime/db/transaction.js";
import { createApp } from "../../shared/src/runtime/app.js";
import { createCloudinaryClient } from "../../shared/src/runtime/integrations/cloudinary.client.js";
import { createNominatimClient, NOMINATIM_TIMEOUT_MS } from "../../shared/src/runtime/integrations/nominatim.client.js";
import { createSessionTokenService } from "../../shared/session-token.js";
import { createAdminListingReadRepository } from "./domain/listings/admin-listing-read-repository.js";
import { createAdminListingReadService } from "./domain/listings/admin-listing-read-service.js";
import { createGeocodingService } from "./domain/listings/geocoding-service.js";
import { type ListingDeleteCleanupHandoff } from "./domain/listings/listing-delete-cleanup.js";
import { createListingDeleteCloudinaryCleanup } from "./domain/listings/listing-delete-cloudinary-cleanup.js";
import { createListingDeleteService } from "./domain/listings/listing-delete-service.js";
import { createListingImageDeleteService } from "./domain/listings/listing-image-delete-service.js";
import { createListingImageOrderService } from "./domain/listings/listing-image-order-service.js";
import { createListingImageUploadRepository } from "./domain/listings/listing-image-upload-repository.js";
import { createListingImageUploadService } from "./domain/listings/listing-image-upload-service.js";
import { createListingLifecycleActionService } from "./domain/listings/listing-lifecycle-action-service.js";
import { createListingCreateService, type TransactionRunner } from "./domain/listings/listing-create-service.js";
import { createListingSubmitService } from "./domain/listings/listing-submit-service.js";
import { createListingUpdateService } from "./domain/listings/listing-update-service.js";
import { createLookupRepository } from "./domain/listings/lookup-repository.js";
import { createModerationActionService } from "./domain/listings/moderation-action-service.js";
import { createOwnerListingReadRepository } from "./domain/listings/owner-listing-read-repository.js";
import { createOwnerListingReadService } from "./domain/listings/owner-listing-read-service.js";
import { createPublicListingDetailRepository } from "./domain/listings/public-listing-detail-repository.js";
import { createPublicListingCatalogRepository } from "./public-listing-catalog-repository.js";
import { createPublicListingDetailService } from "./domain/listings/public-listing-detail-service.js";
import { createPublicListingSearchRepository } from "./domain/listings/public-listing-search-repository.js";
import { createPublicListingSearchService } from "./domain/listings/public-listing-search-service.js";
import { registerListingsRoutes } from "./domain/listings/routes.js";
import { createLogger } from "../../shared/src/runtime/shared/logging/logger.js";
import {
  createOptionalAuthenticationMiddleware,
  createProtectedAuthenticationMiddleware
} from "../../shared/src/runtime/shared/middleware/authentication.js";
import { InMemoryRateLimitStore } from "../../shared/src/runtime/shared/middleware/rate-limit.js";
import { createRoleMiddleware } from "../../shared/src/runtime/shared/middleware/role.js";
import { createShutdownHandler } from "../../shared/src/runtime/shutdown.js";
import { applyDatabaseOverrides } from "../../shared/database-overrides.js";
import { createIdentityAccountClient } from "../../shared/identity-account-client.js";
import { createInternalServiceGuard } from "../../shared/internal-service-auth.js";

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

async function startListingService(): Promise<void> {
  applyDatabaseOverrides("LISTING");
  process.env.PORT = process.env.LISTING_SERVICE_PORT ?? "4200";

  let config;
  try {
    config = loadEnvironment();
  } catch (error) {
    const logger = createLogger("info");
    logger.error("Listing service configuration validation failed", {
      reason: error instanceof EnvironmentConfigurationError ? error.message : "Unexpected configuration error"
    });
    process.exitCode = 1;
    return;
  }

  const logger = createLogger(config.logLevel);
  const databasePool = getRuntimePool(config.database, logger);
  const sqlExecutor = createSqlExecutor(databasePool);
  const publicListingCatalogRepository = createPublicListingCatalogRepository(sqlExecutor);
  const transactionRunner: TransactionRunner = (operation) => withTransaction(databasePool, logger, operation);
  const sessionTokenService = createSessionTokenService({ secret: config.auth.jwtSecret });
  const identityServiceUrl = process.env.IDENTITY_SERVICE_URL;
  if (!identityServiceUrl) {
    logger.error("Listing service requires IDENTITY_SERVICE_URL for cross-service account lookups.");
    await closeRuntimePool();
    process.exitCode = 1;
    return;
  }
  const identityAccountClient = createIdentityAccountClient({
    baseUrl: identityServiceUrl,
    internalToken: process.env.SERVICE_INTERNAL_TOKEN ?? ""
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
  const landlordRole = createRoleMiddleware(["LANDLORD"]);
  const adminRole = createRoleMiddleware(["ADMIN"]);
  const cloudinaryClient = createCloudinaryClient(config.cloudinary);
  const listingDeleteCleanupHandoff: ListingDeleteCleanupHandoff =
    createListingDeleteCloudinaryCleanup(cloudinaryClient);
  const app = createApp({
    frontendOrigin: config.frontendOrigin,
    logger,
    checkDatabaseConnection: () => checkDatabaseConnection(databasePool),
    registerApiRoutes: (router) => {
      registerListingsRoutes(router, {
        lookupRepository: createLookupRepository(sqlExecutor),
        authenticationMiddleware: requiredAuthentication,
        optionalAuthenticationMiddleware: optionalAuthentication,
        landlordRoleMiddleware: landlordRole,
        adminRoleMiddleware: adminRole,
        adminListingReadService: createAdminListingReadService(
          createAdminListingReadRepository(sqlExecutor, {
            loadLandlordProfiles: identityAccountClient.loadProfilesByIds
          })
        ),
        moderationActionService: createModerationActionService({ transactionRunner }),
        listingCreateService: createListingCreateService({ transactionRunner }),
        ownerListingReadService: createOwnerListingReadService(createOwnerListingReadRepository(sqlExecutor)),
        publicListingSearchService: createPublicListingSearchService(
          createPublicListingSearchRepository(sqlExecutor),
          {
            deploymentRegion: config.deployment.region,
            maximumSearchRadiusKm: config.deployment.maximumSearchRadiusKm
          },
          { loadActiveLandlordIds: identityAccountClient.loadActiveLandlordIds }
        ),
        publicListingDetailService: createPublicListingDetailService(
          createPublicListingDetailRepository(sqlExecutor, {
            loadLandlordProfiles: identityAccountClient.loadProfilesByIds
          })
        ),
        listingUpdateService: createListingUpdateService({ transactionRunner }),
        listingSubmitService: createListingSubmitService({ transactionRunner }),
        listingLifecycleActionService: createListingLifecycleActionService({ transactionRunner }),
        listingDeleteService: createListingDeleteService({
          transactionRunner,
          cleanupHandoff: listingDeleteCleanupHandoff,
          logger
        }),
        listingImageUploadService: createListingImageUploadService({
          preflightRepository: createListingImageUploadRepository(sqlExecutor),
          transactionRunner,
          cloudinaryClient,
          logger
        }),
        listingImageDeleteService: createListingImageDeleteService({
          transactionRunner,
          cloudinaryClient,
          logger
        }),
        listingImageOrderService: createListingImageOrderService({ transactionRunner }),
        geocodingService: createGeocodingService(
          createNominatimClient({
            baseUrl: config.nominatim.baseUrl,
            userAgent: config.nominatim.userAgent,
            timeoutMs: NOMINATIM_TIMEOUT_MS
          })
        ),
        geocodingUserRateLimitStore: new InMemoryRateLimitStore(),
        nominatimProviderRateLimitStore: new InMemoryRateLimitStore()
      });
    },
    registerInternalRoutes: (internalApp) => {
      const internalServiceGuard = createInternalServiceGuard(process.env.SERVICE_INTERNAL_TOKEN);
      internalApp.get("/internal/v1/listings/public-summaries", internalServiceGuard, (request, response, next) => {
        const rawIds = request.query.ids;
        if (typeof rawIds !== "string" || rawIds.length === 0) {
          response.status(400).end();
          return;
        }
        const listingIds = rawIds.split(",").map((value) => Number(value));
        if (
          listingIds.length === 0 ||
          listingIds.length > 100 ||
          listingIds.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647)
        ) {
          response.status(400).end();
          return;
        }

        void identityAccountClient
          .loadActiveLandlordIds()
          .then((activeLandlordIds) =>
            publicListingCatalogRepository.findPublicSummariesByIds([...new Set(listingIds)], activeLandlordIds)
          )
          .then((summaries) => response.status(200).json({ data: summaries }))
          .catch(next);
      });
    }
  });
  const server = createServer(app);

  try {
    await listen(server, config.port);
  } catch (error) {
    logger.error("Listing service startup failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    await closeRuntimePool();
    process.exitCode = 1;
    return;
  }

  logger.info("Listing service started", { nodeEnvironment: config.nodeEnv, port: config.port });
  const shutdown = createShutdownHandler({ server, closeDatabase: closeRuntimePool, logger });
  const handleSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal).catch(() => {
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
}

void startListingService();
