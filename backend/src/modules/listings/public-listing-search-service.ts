import { throwValidationIssue } from "../../shared/validation/issues.js";
import type { PublicListingSearch } from "./public-listing-search-validation.js";
import type { PublicListingSearchRepository } from "./public-listing-search-repository.js";
import type { PublicListingSummary } from "./public-listing-summary-mapper.js";

export interface PaginatedPublicListingSummaries {
  readonly summaries: readonly PublicListingSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface PublicListingSearchService {
  readonly search: (query: PublicListingSearch) => Promise<PaginatedPublicListingSummaries>;
}

export function createPublicListingSearchService(
  repository: PublicListingSearchRepository
): PublicListingSearchService {
  return Object.freeze({
    async search(query: PublicListingSearch): Promise<PaginatedPublicListingSummaries> {
      if (query.mode !== "ordinary") {
        throwValidationIssue("query", "INVALID_VALUE", "The requested geographic search mode is not available.");
      }

      if (query.propertyType !== null || query.amenities.length > 0) {
        const known = await repository.findKnownSearchCodes({
          propertyType: query.propertyType,
          amenities: query.amenities
        });
        if (query.propertyType !== null && !known.propertyTypes.includes(query.propertyType)) {
          throwValidationIssue("propertyType", "INVALID_VALUE", "propertyType must be a known code.");
        }
        const knownAmenities = new Set(known.amenities);
        if (query.amenities.some((code) => !knownAmenities.has(code))) {
          throwValidationIssue("amenities", "INVALID_VALUE", "amenities must contain only known codes.");
        }
      }

      const rows = await repository.findOrdinaryPage(query);
      return Object.freeze({
        summaries: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    }
  });
}
