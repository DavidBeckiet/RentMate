import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../../../../shared/src/runtime/shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { requiresCurrentModerationReason } from "../current-moderation-reason.js";
import type { OwnerListingReadRepository } from "../repositories/owner-listing-read-repository.js";
import type { OwnerListingCollectionQuery } from "../validations/owner-listing-read-validation.js";
import { createOwnerListingDetail, type OwnerListingDetail } from "../mappers/owner-listing-mapper.js";
import type { OwnerListingSummary } from "../mappers/owner-listing-summary-mapper.js";

const resourceNotFoundMessage = "The requested resource was not found.";

export interface PaginatedOwnerListingSummaries {
  readonly summaries: readonly OwnerListingSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
  readonly hasEverApprovedListing: boolean;
}

export interface OwnerListingReadService {
  readonly listOwned: (
    principal: AuthenticatedPrincipal,
    query: OwnerListingCollectionQuery
  ) => Promise<PaginatedOwnerListingSummaries>;
  readonly getOwnedDetail: (principal: AuthenticatedPrincipal, listingId: number) => Promise<OwnerListingDetail>;
}

function requireLandlord(principal: AuthenticatedPrincipal): void {
  if (principal.role !== "LANDLORD") {
    throw new ApplicationError("FORBIDDEN", forbiddenRoleMessage);
  }
}

export function createOwnerListingReadService(repository: OwnerListingReadRepository): OwnerListingReadService {
  return Object.freeze({
    async listOwned(
      principal: AuthenticatedPrincipal,
      query: OwnerListingCollectionQuery
    ): Promise<PaginatedOwnerListingSummaries> {
      requireLandlord(principal);
      const [rows, hasEverApprovedListing] = await Promise.all([
        repository.findOwnerListingPage({
          landlordId: principal.userId,
          status: query.status,
          businessStatus: query.businessStatus,
          limit: query.pageSize + 1,
          offset: query.offset
        }),
        repository.hasEverApprovedListing(principal.userId)
      ]);
      const hasNextPage = rows.length > query.pageSize;
      const summaries = Object.freeze(rows.slice(0, query.pageSize));
      return Object.freeze({
        summaries,
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage,
        hasEverApprovedListing
      });
    },

    async getOwnedDetail(principal: AuthenticatedPrincipal, listingId: number): Promise<OwnerListingDetail> {
      requireLandlord(principal);
      const listing = await repository.findOwnerListingDetailBase(listingId, principal.userId);
      if (listing === null) {
        throw new ApplicationError("RESOURCE_NOT_FOUND", resourceNotFoundMessage);
      }

      const amenities = await repository.findAmenitiesForListing(listingId);
      const images = await repository.findImagesForListing(listingId);
      const currentModerationReason = requiresCurrentModerationReason(listing.status)
        ? await repository.findCurrentModerationReason(listingId, listing.status)
        : null;

      return createOwnerListingDetail(listing, amenities, images, currentModerationReason);
    }
  });
}
