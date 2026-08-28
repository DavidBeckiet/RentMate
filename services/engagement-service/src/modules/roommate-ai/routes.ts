import type { RequestHandler, Router } from "express";
import { getRoommateAiCapabilitiesHandler } from "./controllers/roommate-ai-controller.js";
import type { RoommateAiCapabilityService } from "./services/roommate-ai-capability-service.js";

export function registerRoommateAiRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly tenantRoleMiddleware: RequestHandler;
    readonly capabilityService: RoommateAiCapabilityService;
  }
): void {
  router.get(
    "/roommate-ai/capabilities",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    getRoommateAiCapabilitiesHandler(dependencies.capabilityService)
  );
}
