import type { RequestHandler, Router } from "express";
import { createListLeadsHandler, createSaveLeadNoteHandler } from "./controllers/lead-controller.js";
import type { LeadService } from "./services/lead-service.js";

export function registerLeadRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly landlordRoleMiddleware: RequestHandler;
    readonly service: LeadService;
  }
): void {
  router.get(
    "/landlord/leads",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createListLeadsHandler(dependencies.service)
  );
  router.patch(
    "/landlord/leads/:inquiryId/note",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createSaveLeadNoteHandler(dependencies.service)
  );
}
