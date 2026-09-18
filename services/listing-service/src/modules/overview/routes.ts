import type { RequestHandler, Router } from "express";
import { createGetListingOverviewHandler } from "./controllers/listing-overview-controller.js";
import type { ListingOverviewService } from "./services/listing-overview-service.js";

export function registerListingOverviewRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly adminRoleMiddleware: RequestHandler;
    readonly service: ListingOverviewService;
  }
): void {
  router.get(
    "/admin/overview/listings",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createGetListingOverviewHandler(dependencies.service)
  );
}
