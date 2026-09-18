import type { RequestHandler, Router } from "express";
import { createGetEngagementOverviewHandler } from "./controllers/engagement-overview-controller.js";
import type { EngagementOverviewService } from "./services/engagement-overview-service.js";

export function registerEngagementOverviewRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly adminRoleMiddleware: RequestHandler;
    readonly service: EngagementOverviewService;
  }
): void {
  router.get(
    "/admin/overview/engagement",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createGetEngagementOverviewHandler(dependencies.service)
  );
}
