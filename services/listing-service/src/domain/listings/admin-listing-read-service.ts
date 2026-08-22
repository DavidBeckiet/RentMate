import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../shared/src/runtime/shared/types/authentication.js";
import { createAdminListingDetail, type AdminListingDetail } from "./admin-listing-detail-mapper.js";
import type { AdminListingReadRepository } from "./admin-listing-read-repository.js";
import type { AdminListingCollectionQuery, AdminModerationHistoryQuery } from "./admin-listing-read-validation.js";
import type { AdminListingSummary } from "./admin-listing-summary-mapper.js";
import { requiresCurrentModerationReason } from "./current-moderation-reason.js";
import type { ModerationHistoryItem } from "./moderation-history-mapper.js";

const resourceNotFoundMessage = "The requested resource was not found.";

export interface PaginatedAdminListingSummaries {
  readonly summaries: readonly AdminListingSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface PaginatedModerationHistory {
  readonly items: readonly ModerationHistoryItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface AdminListingReadService {
  readonly listAdminListings: (
    principal: AuthenticatedPrincipal,
    query: AdminListingCollectionQuery
  ) => Promise<PaginatedAdminListingSummaries>;
  readonly getAdminListingDetail: (principal: AuthenticatedPrincipal, listingId: number) => Promise<AdminListingDetail>;
  readonly listModerationHistory: (
    principal: AuthenticatedPrincipal,
    listingId: number,
    query: AdminModerationHistoryQuery
  ) => Promise<PaginatedModerationHistory>;
}

function requireAdmin(principal: AuthenticatedPrincipal): void {
  if (principal.role !== "ADMIN") {
    throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  }
}

export function createAdminListingReadService(repository: AdminListingReadRepository): AdminListingReadService {
  return Object.freeze({
    async listAdminListings(
      principal: AuthenticatedPrincipal,
      query: AdminListingCollectionQuery
    ): Promise<PaginatedAdminListingSummaries> {
      requireAdmin(principal);
      const rows = await repository.findListingPage({
        status: query.status,
        limit: query.pageSize + 1,
        offset: query.offset
      });
      return Object.freeze({
        summaries: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    },

    async getAdminListingDetail(principal: AuthenticatedPrincipal, listingId: number): Promise<AdminListingDetail> {
      requireAdmin(principal);
      const base = await repository.findListingDetailBase(listingId);
      if (base === null) throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);

      const amenities = await repository.findAmenitiesForListing(listingId);
      const images = await repository.findImagesForListing(listingId);
      const currentModerationReason = requiresCurrentModerationReason(base.listing.status)
        ? await repository.findCurrentModerationReason(listingId, base.listing.status)
        : null;
      return createAdminListingDetail(base, amenities, images, currentModerationReason);
    },

    async listModerationHistory(
      principal: AuthenticatedPrincipal,
      listingId: number,
      query: AdminModerationHistoryQuery
    ): Promise<PaginatedModerationHistory> {
      requireAdmin(principal);
      if (!(await repository.listingExists(listingId))) {
        throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
      }
      const rows = await repository.findModerationHistoryPage({
        listingId,
        limit: query.pageSize + 1,
        offset: query.offset
      });
      return Object.freeze({
        items: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    }
  });
}
