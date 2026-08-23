import type { RequestHandler, Router } from "express";
import {
  deleteListingNoteHandler,
  listListingNotesHandler,
  saveListingNoteHandler
} from "./controllers/listing-note-controller.js";
import type { ListingNoteService } from "./services/listing-note-service.js";

export function registerListingNoteRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly tenantRoleMiddleware: RequestHandler;
    readonly service: ListingNoteService;
  }
): void {
  const guards = [dependencies.authenticationMiddleware, dependencies.tenantRoleMiddleware] as const;
  router.get("/tenant/listing-notes", ...guards, listListingNotesHandler(dependencies.service));
  router.put("/tenant/listing-notes/:listingId", ...guards, saveListingNoteHandler(dependencies.service));
  router.delete("/tenant/listing-notes/:listingId", ...guards, deleteListingNoteHandler(dependencies.service));
}
