import type { RequestHandler, Router } from "express";
import {
  createGetLandlordAnalyticsHandler,
  createTrackAnalyticsEventHandler
} from "./controllers/analytics-controller.js";
import type { AnalyticsService } from "./services/analytics-service.js";

export function registerAnalyticsRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly optionalAuthenticationMiddleware: RequestHandler;
    readonly landlordRoleMiddleware: RequestHandler;
    readonly service: AnalyticsService;
  }
): void {
  router.get(
    "/landlord/analytics",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createGetLandlordAnalyticsHandler(dependencies.service)
  );
  router.post(
    "/analytics/listings/:listingId/events",
    dependencies.optionalAuthenticationMiddleware,
    createTrackAnalyticsEventHandler(dependencies.service)
  );
}
