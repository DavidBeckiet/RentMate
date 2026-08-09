import type { RequestHandler, Router } from "express";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type Clock,
  type RateLimitPolicy,
  type RateLimitStore
} from "../../shared/middleware/rate-limit.js";
import {
  createForwardGeocodingHandler,
  createForwardGeocodingValidationPreflightHandler
} from "./geocoding-controller.js";
import type { GeocodingService } from "./geocoding-service.js";
import { createListingDraftHandler } from "./listing-create-controller.js";
import type { ListingCreateService } from "./listing-create-service.js";
import { createDeleteOwnerListingHandler } from "./listing-delete-controller.js";
import type { ListingDeleteService } from "./listing-delete-service.js";
import { createDeleteListingImageHandler } from "./listing-image-delete-controller.js";
import type { ListingImageDeleteService } from "./listing-image-delete-service.js";
import { createReorderListingImagesHandler } from "./listing-image-order-controller.js";
import type { ListingImageOrderService } from "./listing-image-order-service.js";
import {
  createListingImageUploadHandler,
  createListingImageUploadPreflightHandler
} from "./listing-image-upload-controller.js";
import { listingImageUploadMultipartMiddleware } from "./listing-image-upload-multipart.js";
import type { ListingImageUploadService } from "./listing-image-upload-service.js";
import {
  createDeactivateOwnerListingHandler,
  createReactivateOwnerListingHandler
} from "./listing-lifecycle-action-controller.js";
import type { ListingLifecycleActionService } from "./listing-lifecycle-action-service.js";
import { createSubmitOwnerListingHandler } from "./listing-submit-controller.js";
import type { ListingSubmitService } from "./listing-submit-service.js";
import { createUpdateOwnerListingHandler } from "./listing-update-controller.js";
import type { ListingUpdateService } from "./listing-update-service.js";
import { createGetAmenitiesHandler, createGetPropertyTypesHandler } from "./lookup-controller.js";
import type { LookupRepository } from "./lookup-repository.js";
import { createGetOwnerListingDetailHandler, createListOwnerListingsHandler } from "./owner-listing-read-controller.js";
import type { OwnerListingReadService } from "./owner-listing-read-service.js";
import { createPublicListingSearchHandler } from "./public-listing-search-controller.js";
import type { PublicListingSearchService } from "./public-listing-search-service.js";

export interface ListingsRouteDependencies {
  readonly lookupRepository: LookupRepository;
  readonly authenticationMiddleware: RequestHandler;
  readonly landlordRoleMiddleware: RequestHandler;
  readonly listingCreateService: ListingCreateService;
  readonly ownerListingReadService: OwnerListingReadService;
  readonly publicListingSearchService: PublicListingSearchService;
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
