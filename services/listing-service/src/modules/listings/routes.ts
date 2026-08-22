import type { RequestHandler, Router } from "express";
import {
  createGetAdminListingDetailHandler,
  createListAdminListingsHandler,
  createListModerationHistoryHandler
} from "./controllers/admin-listing-read-controller.js";
import type { AdminListingReadService } from "./services/admin-listing-read-service.js";
import { createModerateListingHandler } from "./controllers/moderation-action-controller.js";
import type { ModerationActionService } from "./services/moderation-action-service.js";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type Clock,
  type RateLimitPolicy,
  type RateLimitStore
} from "../../../../shared/src/runtime/shared/middleware/rate-limit.js";
import {
  createForwardGeocodingHandler,
  createForwardGeocodingValidationPreflightHandler
} from "./controllers/geocoding-controller.js";
import type { GeocodingService } from "./services/geocoding-service.js";
import { createListingDraftHandler } from "./controllers/listing-create-controller.js";
import type { ListingCreateService } from "./services/listing-create-service.js";
import { createDeleteOwnerListingHandler } from "./controllers/listing-delete-controller.js";
import type { ListingDeleteService } from "./services/listing-delete-service.js";
import { createDeleteListingImageHandler } from "./controllers/listing-image-delete-controller.js";
import type { ListingImageDeleteService } from "./services/listing-image-delete-service.js";
import { createReorderListingImagesHandler } from "./controllers/listing-image-order-controller.js";
import type { ListingImageOrderService } from "./services/listing-image-order-service.js";
import {
  createListingImageUploadHandler,
  createListingImageUploadPreflightHandler
} from "./controllers/listing-image-upload-controller.js";
import { listingImageUploadMultipartMiddleware } from "./listing-image-upload-multipart.js";
import type { ListingImageUploadService } from "./services/listing-image-upload-service.js";
import {
  createDeactivateOwnerListingHandler,
  createReactivateOwnerListingHandler
} from "./controllers/listing-lifecycle-action-controller.js";
import type { ListingLifecycleActionService } from "./services/listing-lifecycle-action-service.js";
import { createSubmitOwnerListingHandler } from "./controllers/listing-submit-controller.js";
import type { ListingSubmitService } from "./services/listing-submit-service.js";
import { createUpdateOwnerListingHandler } from "./controllers/listing-update-controller.js";
import type { ListingUpdateService } from "./services/listing-update-service.js";
import { createGetAmenitiesHandler, createGetPropertyTypesHandler } from "./controllers/lookup-controller.js";
import type { LookupRepository } from "./repositories/lookup-repository.js";
import { createGetOwnerListingDetailHandler, createListOwnerListingsHandler } from "./controllers/owner-listing-read-controller.js";
import type { OwnerListingReadService } from "./services/owner-listing-read-service.js";
import { createPublicListingSearchHandler } from "./controllers/public-listing-search-controller.js";
import type { PublicListingSearchService } from "./services/public-listing-search-service.js";
import { createPublicListingDetailHandler } from "./controllers/public-listing-detail-controller.js";
import type { PublicListingDetailService } from "./services/public-listing-detail-service.js";

export interface ListingsRouteDependencies {
  readonly lookupRepository: LookupRepository;
  readonly authenticationMiddleware: RequestHandler;
  readonly optionalAuthenticationMiddleware: RequestHandler;
  readonly landlordRoleMiddleware: RequestHandler;
  readonly adminRoleMiddleware: RequestHandler;
  readonly adminListingReadService: AdminListingReadService;
  readonly moderationActionService: ModerationActionService;
  readonly listingCreateService: ListingCreateService;
  readonly ownerListingReadService: OwnerListingReadService;
  readonly publicListingSearchService: PublicListingSearchService;
  readonly publicListingDetailService: PublicListingDetailService;
  readonly listingUpdateService: ListingUpdateService;
  readonly listingSubmitService: ListingSubmitService;
  readonly listingLifecycleActionService: ListingLifecycleActionService;
  readonly listingDeleteService: ListingDeleteService;
  readonly listingImageUploadService: ListingImageUploadService;
  readonly listingImageDeleteService: ListingImageDeleteService;
  readonly listingImageOrderService: ListingImageOrderService;
  readonly geocodingService: GeocodingService;
  readonly geocodingUserRateLimitStore?: RateLimitStore;
  readonly geocodingUserRateLimitClock?: Clock;
  readonly nominatimProviderRateLimitStore?: RateLimitStore;
  readonly nominatimProviderRateLimitClock?: Clock;
}

export const geocodingUserRateLimitPolicy: RateLimitPolicy = Object.freeze({
  scope: "geocoding-user",
  limit: 1,
  windowMs: 1_000
});

export const nominatimProviderRateLimitPolicy: RateLimitPolicy = Object.freeze({
  scope: "nominatim-provider",
  limit: 1,
  windowMs: 1_000
});

export function registerListingsRoutes(router: Router, dependencies: ListingsRouteDependencies): void {
  const geocodingUserRateLimiter = createRateLimitMiddleware({
    policy: geocodingUserRateLimitPolicy,
    resolveKey: (request) => request.auth?.userId.toString() ?? "",
    store: dependencies.geocodingUserRateLimitStore ?? new InMemoryRateLimitStore(),
    clock: dependencies.geocodingUserRateLimitClock
  });
  const nominatimProviderRateLimiter = createRateLimitMiddleware({
    policy: nominatimProviderRateLimitPolicy,
    resolveKey: () => "nominatim",
    store: dependencies.nominatimProviderRateLimitStore ?? new InMemoryRateLimitStore(),
    clock: dependencies.nominatimProviderRateLimitClock
  });

  router.get("/lookups/property-types", createGetPropertyTypesHandler(dependencies.lookupRepository));
  router.get("/lookups/amenities", createGetAmenitiesHandler(dependencies.lookupRepository));
  router.get("/listings", createPublicListingSearchHandler(dependencies.publicListingSearchService));
  router.get(
    "/listings/:listingId",
    dependencies.optionalAuthenticationMiddleware,
    createPublicListingDetailHandler(dependencies.publicListingDetailService)
  );
  router.post(
    "/admin/listings/:listingId/moderation-actions",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createModerateListingHandler(dependencies.moderationActionService)
  );
  router.get(
    "/admin/listings",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createListAdminListingsHandler(dependencies.adminListingReadService)
  );
  router.get(
    "/admin/listings/:listingId/moderation-actions",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createListModerationHistoryHandler(dependencies.adminListingReadService)
  );
  router.get(
    "/admin/listings/:listingId",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createGetAdminListingDetailHandler(dependencies.adminListingReadService)
  );
  router.post(
    "/landlord/listings",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createListingDraftHandler(dependencies.listingCreateService)
  );
  router.get(
    "/landlord/listings",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createListOwnerListingsHandler(dependencies.ownerListingReadService)
  );
  router.get(
    "/landlord/listings/:listingId",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createGetOwnerListingDetailHandler(dependencies.ownerListingReadService)
  );
  router.patch(
    "/landlord/listings/:listingId",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createUpdateOwnerListingHandler(dependencies.listingUpdateService)
  );
  router.post(
    "/landlord/listings/:listingId/submit",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createSubmitOwnerListingHandler(dependencies.listingSubmitService)
  );
  router.post(
    "/landlord/listings/:listingId/deactivate",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createDeactivateOwnerListingHandler(dependencies.listingLifecycleActionService)
  );
  router.post(
    "/landlord/listings/:listingId/reactivate",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createReactivateOwnerListingHandler(dependencies.listingLifecycleActionService)
  );
  router.delete(
    "/landlord/listings/:listingId",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createDeleteOwnerListingHandler(dependencies.listingDeleteService)
  );
  router.post(
    "/landlord/listings/:listingId/images",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createListingImageUploadPreflightHandler(dependencies.listingImageUploadService),
    listingImageUploadMultipartMiddleware,
    createListingImageUploadHandler(dependencies.listingImageUploadService)
  );
  router.delete(
    "/landlord/listings/:listingId/images/:imageId",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createDeleteListingImageHandler(dependencies.listingImageDeleteService)
  );
  router.put(
    "/landlord/listings/:listingId/images/order",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createReorderListingImagesHandler(dependencies.listingImageOrderService)
  );
  router.post(
    "/geocoding/forward",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createForwardGeocodingValidationPreflightHandler(),
    geocodingUserRateLimiter,
    nominatimProviderRateLimiter,
    createForwardGeocodingHandler(dependencies.geocodingService)
  );
}
