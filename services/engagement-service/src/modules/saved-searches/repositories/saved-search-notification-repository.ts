import {
  executeCommand,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { notificationRealtimeNotifyExpression } from "../../contact/realtime/notification-realtime-channel.js";

export interface SavedSearchNotificationListing {
  readonly id: number;
  readonly title: string;
  readonly monthlyRent: number;
  readonly roomAreaSqm: number;
  readonly maxOccupants: number | null;
  readonly areaName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly propertyTypeCode: string;
  readonly amenityCodes: readonly string[];
}

export interface SavedSearchNotificationRepository {
  readonly createMatchingNotifications: (
    executor: SqlExecutor,
    listing: SavedSearchNotificationListing
  ) => Promise<number>;
}

function positiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}

function finiteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new RepositoryInvariantError(`${field} is invalid.`);
}

function nullableOccupants(value: number | null, field: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 1 || value > 20)) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}

export function createSavedSearchNotificationRepository(): SavedSearchNotificationRepository {
  const repository: SavedSearchNotificationRepository = {
    createMatchingNotifications(executor, listing) {
      positiveInteger(listing.id, "listing.id");
      finiteNumber(listing.monthlyRent, "listing.monthlyRent");
      finiteNumber(listing.roomAreaSqm, "listing.roomAreaSqm");
      nullableOccupants(listing.maxOccupants, "listing.maxOccupants");
      finiteNumber(listing.latitude, "listing.latitude");
      finiteNumber(listing.longitude, "listing.longitude");

      return executeCommand(executor, {
        text: `
          INSERT INTO notifications (
            recipient_id, event_type, listing_id, resource_path, dedupe_key
          )
          SELECT
            searches.tenant_id,
            'SAVED_SEARCH_MATCHED',
            $1,
            '/listings/' || ($1::integer)::text,
            'saved-search:' || searches.id::text || ':listing:' || ($1::integer)::text
          FROM saved_searches AS searches
          WHERE searches.is_active = true
            AND (
              searches.q IS NULL
              OR strpos(lower($2::text), lower(searches.q)) > 0
              OR strpos(lower($6::text), lower(searches.q)) > 0
            )
            AND (searches.area_name IS NULL OR strpos(lower($6::text), lower(searches.area_name)) > 0)
            AND (searches.min_monthly_rent IS NULL OR searches.min_monthly_rent <= $3)
            AND (searches.max_monthly_rent IS NULL OR searches.max_monthly_rent >= $3)
            AND (searches.min_room_area_sqm IS NULL OR searches.min_room_area_sqm <= $4)
            AND (searches.max_room_area_sqm IS NULL OR searches.max_room_area_sqm >= $4)
            AND (searches.min_occupants IS NULL OR ($5::smallint IS NOT NULL AND searches.min_occupants <= $5))
            AND (searches.property_type_code IS NULL OR searches.property_type_code = $7)
            AND searches.amenity_codes <@ $8::text[]
            AND (
              searches.mode = 'ordinary'
              OR (
                searches.mode = 'bounds'
                AND $9::double precision BETWEEN searches.south AND searches.north
                AND $10::double precision BETWEEN searches.west AND searches.east
              )
              OR (
                searches.mode = 'radius'
                AND 2 * 6371.0088 * asin(
                  sqrt(
                    least(
                      1.0,
                      power(sin(radians($9::double precision - searches.center_lat) / 2), 2)
                      + cos(radians(searches.center_lat))
                      * cos(radians($9::double precision))
                      * power(sin(radians($10::double precision - searches.center_lng) / 2), 2)
                    )
                  )
                ) <= searches.radius_km
              )
            )
          ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
          RETURNING ${notificationRealtimeNotifyExpression}
        `,
        values: [
          listing.id,
          listing.title,
          listing.monthlyRent,
          listing.roomAreaSqm,
          listing.maxOccupants,
          listing.areaName,
          listing.propertyTypeCode,
          [...listing.amenityCodes],
          listing.latitude,
          listing.longitude
        ]
      });
    }
  };
  return Object.freeze(repository);
}
