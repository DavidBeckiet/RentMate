import type { RequestHandler, Router } from "express";
import { createListingDraftHandler } from "./listing-create-controller.js";
import type { ListingCreateService } from "./listing-create-service.js";
import { createGetAmenitiesHandler, createGetPropertyTypesHandler } from "./lookup-controller.js";
import type { LookupRepository } from "./lookup-repository.js";

export interface ListingsRouteDependencies {
  readonly lookupRepository: LookupRepository;
  readonly authenticationMiddleware: RequestHandler;
  readonly landlordRoleMiddleware: RequestHandler;
  readonly listingCreateService: ListingCreateService;
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
}
