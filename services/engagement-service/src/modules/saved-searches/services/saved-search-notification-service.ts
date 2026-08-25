import type { PublicListingSummary } from "../../../../../shared/public-listing-summary.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type {
  SavedSearchNotificationListing,
  SavedSearchNotificationRepository
} from "../repositories/saved-search-notification-repository.js";

export interface SavedSearchNotificationTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export interface SavedSearchNotificationService {
  readonly notifyListingPublished: (listing: PublicListingSummary) => Promise<number>;
}

function toNotificationListing(listing: PublicListingSummary): SavedSearchNotificationListing {
  return Object.freeze({
    id: listing.id,
    title: listing.title,
    monthlyRent: listing.monthlyRent,
    roomAreaSqm: listing.roomAreaSqm,
    areaName: listing.areaName,
    latitude: listing.latitude,
    longitude: listing.longitude,
    propertyTypeCode: listing.propertyType.code,
    amenityCodes: Object.freeze(listing.amenities.map((amenity) => amenity.code))
  });
}

export function createSavedSearchNotificationService(dependencies: {
  readonly repository: SavedSearchNotificationRepository;
  readonly transactionRunner: SavedSearchNotificationTransactionRunner;
}): SavedSearchNotificationService {
  const service: SavedSearchNotificationService = {
    notifyListingPublished(listing) {
      if (listing.businessStatus !== "AVAILABLE" && listing.businessStatus !== "UNKNOWN") return Promise.resolve(0);
      const input = toNotificationListing(listing);
      return dependencies.transactionRunner.run((executor) =>
        dependencies.repository.createMatchingNotifications(executor, input)
      );
    }
  };
  return Object.freeze(service);
}
