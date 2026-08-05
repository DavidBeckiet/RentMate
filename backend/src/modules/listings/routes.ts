import type { RequestHandler, Router } from "express";
import { createListingDraftHandler } from "./listing-create-controller.js";
import type { ListingCreateService } from "./listing-create-service.js";
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

export interface ListingsRouteDependencies {
  readonly lookupRepository: LookupRepository;
  readonly authenticationMiddleware: RequestHandler;
  readonly landlordRoleMiddleware: RequestHandler;
  readonly listingCreateService: ListingCreateService;
  readonly ownerListingReadService: OwnerListingReadService;
  readonly listingUpdateService: ListingUpdateService;
  readonly listingSubmitService: ListingSubmitService;
  readonly listingLifecycleActionService: ListingLifecycleActionService;
}

export function registerListingsRoutes(router: Router, dependencies: ListingsRouteDependencies): void {
  router.get("/lookups/property-types", createGetPropertyTypesHandler(dependencies.lookupRepository));
  router.get("/lookups/amenities", createGetAmenitiesHandler(dependencies.lookupRepository));
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
}
