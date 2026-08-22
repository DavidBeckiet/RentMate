import {
  deploymentRegions,
  maximumSearchRadiusKm,
  type DeploymentRegion
} from "../../../../../shared/src/runtime/config/env.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import {
  calculateRadiusBoundingBox,
  isWithinDeploymentRegionScope,
  type RadiusBoundingBox
} from "../public-listing-search-bounding-box.js";
import type { PublicListingSearch } from "../validations/public-listing-search-validation.js";
import type { PublicListingSearchRepository } from "../repositories/public-listing-search-repository.js";
import type { PublicListingSummary, PublicRadiusListingSummary } from "../../../../../shared/public-listing-summary.js";

export interface PublicListingSearchConfig {
  readonly deploymentRegion: DeploymentRegion;
  readonly maximumSearchRadiusKm: number;
}

export interface PaginatedPublicListingSummaries {
  readonly summaries: readonly (PublicListingSummary | PublicRadiusListingSummary)[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasNextPage: boolean;
}

export interface PublicListingSearchService {
  readonly search: (query: PublicListingSearch) => Promise<PaginatedPublicListingSummaries>;
}

export interface PublicListingSearchDependencies {
  readonly loadActiveLandlordIds?: () => Promise<readonly number[]>;
}

export function createPublicListingSearchService(
  repository: PublicListingSearchRepository,
  config: PublicListingSearchConfig = {
    deploymentRegion: deploymentRegions[0],
    maximumSearchRadiusKm
  },
  dependencies: PublicListingSearchDependencies = {}
): PublicListingSearchService {
  return Object.freeze({
    async search(query: PublicListingSearch): Promise<PaginatedPublicListingSummaries> {
      if (query.mode === "radius") {
        if (query.radiusKm > config.maximumSearchRadiusKm) {
          throwValidationIssue("radiusKm", "OUT_OF_RANGE", "radiusKm exceeds the configured maximum.");
        }
        if (!isWithinDeploymentRegionScope(config.deploymentRegion, query.centerLat, query.centerLng)) {
          throwValidationIssue("query", "INVALID_VALUE", "Radius center is outside the supported deployment area.");
        }
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

      let rows: readonly (PublicListingSummary | PublicRadiusListingSummary)[];
      const activeLandlordIds = dependencies.loadActiveLandlordIds
        ? await dependencies.loadActiveLandlordIds()
        : undefined;
      if (query.mode === "ordinary") {
        rows =
          activeLandlordIds === undefined
            ? await repository.findOrdinaryPage(query)
            : await repository.findOrdinaryPage(query, activeLandlordIds);
      } else if (query.mode === "bounds") {
        rows =
          activeLandlordIds === undefined
            ? await repository.findBoundsPage(query)
            : await repository.findBoundsPage(query, activeLandlordIds);
      } else {
        const boundingBox: RadiusBoundingBox = calculateRadiusBoundingBox(
          query.centerLat,
          query.centerLng,
          query.radiusKm
        );
        rows =
          activeLandlordIds === undefined
            ? await repository.findRadiusPage(query, boundingBox)
            : await repository.findRadiusPage(query, boundingBox, activeLandlordIds);
      }

      return Object.freeze({
        summaries: Object.freeze(rows.slice(0, query.pageSize)),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize
      });
    }
  });
}
