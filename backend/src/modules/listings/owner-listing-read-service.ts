import { ApplicationError } from "../../shared/errors/application-error.js";
import { forbiddenRoleMessage } from "../../shared/middleware/role.js";
import type { AuthenticatedPrincipal } from "../../shared/types/authentication.js";
import type { OwnerListingReadRepository } from "./owner-listing-read-repository.js";
import type { OwnerListingCollectionQuery } from "./owner-listing-read-validation.js";
import { createOwnerListingDetail, type OwnerListingDetail } from "./owner-listing-mapper.js";
import type { OwnerListingSummary } from "./owner-listing-summary-mapper.js";

const resourceNotFoundMessage = "The requested resource was not found.";

export interface PaginatedOwnerListingSummaries {
  readonly summaries: readonly OwnerListingSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
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
      const rows = await repository.findOwnerListingPage({
        landlordId: principal.userId,
        status: query.status,
        limit: query.pageSize + 1,
        offset: query.offset
      });
      const hasNextPage = rows.length > query.pageSize;
      const summaries = Object.freeze(rows.slice(0, query.pageSize));
      return Object.freeze({
        summaries,
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage
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
      const currentModerationReason =
        listing.status === "REJECTED" || listing.status === "HIDDEN"
          ? await repository.findCurrentModerationReason(listingId, listing.status)
          : null;

      return createOwnerListingDetail(listing, amenities, images, currentModerationReason);
    }
  });
}
