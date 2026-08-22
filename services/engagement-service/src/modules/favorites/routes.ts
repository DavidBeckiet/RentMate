import type { RequestHandler, Router } from "express";
import {
  createEnsureFavoriteAbsentHandler,
  createEnsureFavoritePresentHandler,
  createListFavoritesHandler
} from "./controllers/favorite-controller.js";
import type { FavoriteService } from "./services/favorite-service.js";

export interface FavoriteRouteDependencies {
  readonly authenticationMiddleware: RequestHandler;
  readonly tenantRoleMiddleware: RequestHandler;
  readonly favoriteService: FavoriteService;
}

export function registerFavoriteRoutes(router: Router, dependencies: FavoriteRouteDependencies): void {
  router.get(
    "/favorites",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    createListFavoritesHandler(dependencies.favoriteService)
  );
  router.put(
    "/favorites/:listingId",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    createEnsureFavoritePresentHandler(dependencies.favoriteService)
  );
  router.delete(
    "/favorites/:listingId",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    createEnsureFavoriteAbsentHandler(dependencies.favoriteService)
  );
}
