import type { RequestHandler, Router } from "express";
import {
  createSavedSearchHandler,
  deleteSavedSearchHandler,
  listSavedSearchesHandler,
  updateSavedSearchHandler
} from "./controllers/saved-search-controller.js";
import type { SavedSearchService } from "./services/saved-search-service.js";

export function registerSavedSearchRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly tenantRoleMiddleware: RequestHandler;
    readonly service: SavedSearchService;
  }
): void {
  const guards = [dependencies.authenticationMiddleware, dependencies.tenantRoleMiddleware] as const;
  router.post("/saved-searches", ...guards, createSavedSearchHandler(dependencies.service));
  router.get("/saved-searches", ...guards, listSavedSearchesHandler(dependencies.service));
  router.patch("/saved-searches/:savedSearchId", ...guards, updateSavedSearchHandler(dependencies.service));
  router.delete("/saved-searches/:savedSearchId", ...guards, deleteSavedSearchHandler(dependencies.service));
}
