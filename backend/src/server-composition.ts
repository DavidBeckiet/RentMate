import { randomBytes } from "node:crypto";
import type { Express } from "express";
import { createApp } from "./app.js";
import type { SqlExecutor } from "./db/sql-executor.js";
import { unavailableCloudinaryClient, type CloudinaryClient } from "./integrations/cloudinary.client.js";
import { unavailableNominatimClient, type NominatimClient } from "./integrations/nominatim.client.js";
import { createAuthRepository } from "./modules/auth/auth-repository.js";
import { createLoginService } from "./modules/auth/login-service.js";
import { createPasswordService } from "./modules/auth/password.js";
import { createRegistrationService } from "./modules/auth/registration-service.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { createSessionCookieService, type SessionCookieService } from "./modules/auth/session-cookie.js";
import { createSessionTokenService, type SessionTokenService } from "./modules/auth/session-token.js";
import { createListingCreateService, type TransactionRunner } from "./modules/listings/listing-create-service.js";
import { createGeocodingService } from "./modules/listings/geocoding-service.js";
import {
  noOpListingDeleteCleanupHandoff,
  type ListingDeleteCleanupHandoff
} from "./modules/listings/listing-delete-cleanup.js";
import { createListingDeleteService } from "./modules/listings/listing-delete-service.js";
import { createListingDeleteCloudinaryCleanup } from "./modules/listings/listing-delete-cloudinary-cleanup.js";
import { createListingImageUploadRepository } from "./modules/listings/listing-image-upload-repository.js";
import { createListingImageUploadService } from "./modules/listings/listing-image-upload-service.js";
import { createListingImageDeleteService } from "./modules/listings/listing-image-delete-service.js";
import { createListingImageOrderService } from "./modules/listings/listing-image-order-service.js";
import { createListingLifecycleActionService } from "./modules/listings/listing-lifecycle-action-service.js";
import { createListingSubmitService } from "./modules/listings/listing-submit-service.js";
import { createListingUpdateService } from "./modules/listings/listing-update-service.js";
import { createLookupRepository } from "./modules/listings/lookup-repository.js";
import { createOwnerListingReadRepository } from "./modules/listings/owner-listing-read-repository.js";
import { createOwnerListingReadService } from "./modules/listings/owner-listing-read-service.js";
import { createPublicListingSearchRepository } from "./modules/listings/public-listing-search-repository.js";
import { createPublicListingSearchService } from "./modules/listings/public-listing-search-service.js";
import { registerListingsRoutes } from "./modules/listings/routes.js";
import { registerUsersRoutes } from "./modules/users/routes.js";
import { createUsersRepository } from "./modules/users/users-repository.js";
import { createUsersService } from "./modules/users/users-service.js";
import type { Logger } from "./shared/logging/logger.js";
import { createProtectedAuthenticationMiddleware } from "./shared/middleware/authentication.js";
import { InMemoryRateLimitStore, type Clock, type RateLimitStore } from "./shared/middleware/rate-limit.js";
import { createRoleMiddleware } from "./shared/middleware/role.js";

const unavailableTransactionRunner: TransactionRunner = async () => {
  throw new Error("Transactional listing writes are unavailable in this application composition.");
};

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
  readonly transactionRunner?: TransactionRunner;
  readonly listingDeleteCleanupHandoff?: ListingDeleteCleanupHandoff;
  readonly cloudinaryClient?: CloudinaryClient;
  readonly nominatimClient?: NominatimClient;
  readonly geocodingUserRateLimitStore?: RateLimitStore;
  readonly geocodingUserRateLimitClock?: Clock;
  readonly nominatimProviderRateLimitStore?: RateLimitStore;
  readonly nominatimProviderRateLimitClock?: Clock;
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
  const lookupRepository = createLookupRepository(options.sqlExecutor);
  const transactionRunner = options.transactionRunner ?? unavailableTransactionRunner;
  const listingCreateService = createListingCreateService({ transactionRunner });
  const ownerListingReadRepository = createOwnerListingReadRepository(options.sqlExecutor);
  const ownerListingReadService = createOwnerListingReadService(ownerListingReadRepository);
  const publicListingSearchService = createPublicListingSearchService(
    createPublicListingSearchRepository(options.sqlExecutor)
  );
  const listingUpdateService = createListingUpdateService({ transactionRunner });
  const listingSubmitService = createListingSubmitService({ transactionRunner });
  const listingLifecycleActionService = createListingLifecycleActionService({ transactionRunner });
  const cloudinaryClient = options.cloudinaryClient ?? unavailableCloudinaryClient;
  const listingImageUploadService = createListingImageUploadService({
    preflightRepository: createListingImageUploadRepository(options.sqlExecutor),
    transactionRunner,
    cloudinaryClient,
    logger: options.logger
  });
  const listingImageDeleteService = createListingImageDeleteService({
    transactionRunner,
    cloudinaryClient,
    logger: options.logger
  });
  const listingImageOrderService = createListingImageOrderService({ transactionRunner });
  const geocodingService = createGeocodingService(options.nominatimClient ?? unavailableNominatimClient);
  const listingDeleteService = createListingDeleteService({
    transactionRunner,
    cleanupHandoff:
      options.listingDeleteCleanupHandoff ??
      (options.cloudinaryClient
        ? createListingDeleteCloudinaryCleanup(options.cloudinaryClient)
        : noOpListingDeleteCleanupHandoff),
    logger: options.logger
  });
  const requiredAuthentication = createProtectedAuthenticationMiddleware({
    verifySessionToken: sessionTokenService.verify,
    loadAuthenticationAccount: usersRepository.findAuthenticationAccountById
  });
  const landlordRole = createRoleMiddleware(["LANDLORD"]);
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
      registerListingsRoutes(router, {
        lookupRepository,
        authenticationMiddleware: requiredAuthentication,
        landlordRoleMiddleware: landlordRole,
        listingCreateService,
        ownerListingReadService,
        publicListingSearchService,
        listingUpdateService,
        listingSubmitService,
        listingLifecycleActionService,
        listingDeleteService,
        listingImageUploadService,
        listingImageDeleteService,
        listingImageOrderService,
        geocodingService,
        geocodingUserRateLimitStore: options.geocodingUserRateLimitStore,
        geocodingUserRateLimitClock: options.geocodingUserRateLimitClock,
        nominatimProviderRateLimitStore: options.nominatimProviderRateLimitStore,
        nominatimProviderRateLimitClock: options.nominatimProviderRateLimitClock
      });
    }
  });
}
