import type { Router } from "express";
import { createGetAmenitiesHandler, createGetPropertyTypesHandler } from "./lookup-controller.js";
import type { LookupRepository } from "./lookup-repository.js";

export interface ListingsRouteDependencies {
  readonly lookupRepository: LookupRepository;
}

export function registerListingsRoutes(router: Router, dependencies: ListingsRouteDependencies): void {
  router.get("/lookups/property-types", createGetPropertyTypesHandler(dependencies.lookupRepository));
  router.get("/lookups/amenities", createGetAmenitiesHandler(dependencies.lookupRepository));
}
