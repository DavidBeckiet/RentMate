import type { RequestHandler, Router } from "express";
import { createGetIdentityOverviewHandler } from "./controllers/identity-overview-controller.js";
import type { IdentityOverviewService } from "./services/identity-overview-service.js";

export function registerIdentityOverviewRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly adminRoleMiddleware: RequestHandler;
    readonly service: IdentityOverviewService;
  }
): void {
  router.get(
    "/admin/overview/identity",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createGetIdentityOverviewHandler(dependencies.service)
  );
}
