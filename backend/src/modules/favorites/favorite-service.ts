import { ApplicationError } from "../../shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../shared/types/authentication.js";
import type { PublicListingSummary } from "../listings/public-listing-summary-mapper.js";
import type { FavoriteRepository } from "./favorite-repository.js";
import type { FavoriteCollectionQuery } from "./favorite-validation.js";

const resourceNotFoundMessage = "The requested resource was not found.";

export interface FavoritePage {
  readonly summaries: readonly PublicListingSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface FavoriteService {
  readonly listFavorites: (principal: AuthenticatedPrincipal, query: FavoriteCollectionQuery) => Promise<FavoritePage>;
  readonly ensureFavoritePresent: (principal: AuthenticatedPrincipal, listingId: number) => Promise<void>;
  readonly ensureFavoriteAbsent: (principal: AuthenticatedPrincipal, listingId: number) => Promise<void>;
}

export interface FavoriteServiceDependencies {
  readonly loadActiveLandlordIds?: () => Promise<readonly number[]>;
}

function requireTenant(principal: AuthenticatedPrincipal): number {
  if (principal.role !== "TENANT") {
    throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  }
  return principal.userId;
}

export function createFavoriteService(
  repository: FavoriteRepository,
  dependencies: FavoriteServiceDependencies = {}
): FavoriteService {
  return Object.freeze({
    async listFavorites(principal: AuthenticatedPrincipal, query: FavoriteCollectionQuery): Promise<FavoritePage> {
      const tenantId = requireTenant(principal);
      const activeLandlordIds = dependencies.loadActiveLandlordIds
        ? await dependencies.loadActiveLandlordIds()
        : undefined;
      const pageInput = { tenantId, pageSize: query.pageSize, offset: query.offset };
      const rows = dependencies.loadActiveLandlordIds
        ? await repository.findPage(pageInput, activeLandlordIds)
        : await repository.findPage(pageInput);
      return Object.freeze({
        summaries: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },

    async ensureFavoritePresent(principal: AuthenticatedPrincipal, listingId: number): Promise<void> {
      const tenantId = requireTenant(principal);
      const activeLandlordIds = dependencies.loadActiveLandlordIds
        ? await dependencies.loadActiveLandlordIds()
        : undefined;
      const result = dependencies.loadActiveLandlordIds
        ? await repository.ensurePresent(tenantId, listingId, activeLandlordIds)
        : await repository.ensurePresent(tenantId, listingId);
      if (!result.isVisible) {
        throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
      }
    },

    async ensureFavoriteAbsent(principal: AuthenticatedPrincipal, listingId: number): Promise<void> {
      const tenantId = requireTenant(principal);
      await repository.ensureAbsent(tenantId, listingId);
    }
  });
}
