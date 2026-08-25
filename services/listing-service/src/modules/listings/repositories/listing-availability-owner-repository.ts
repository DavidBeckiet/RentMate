import type { QueryResultRow } from "pg";
import { executeCommand, queryOptional, RepositoryInvariantError } from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { mapNullablePgTimestamptz } from "../../../../../shared/src/runtime/db/value-mappers.js";
import { isListingBusinessStatus, type ListingBusinessStatus } from "../../../../../shared/listing-business-status.js";
import { isListingStatus, type ListingStatus } from "../mappers/owner-listing-mapper.js";

const maximumListingId = 2_147_483_647;

interface LockedListingAvailabilityRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
  readonly business_status: unknown;
  readonly availability_confirmed_at: unknown;
  readonly availability_reminder_sent_at: unknown;
  readonly availability_reminder_notified_at: unknown;
  readonly availability_auto_paused_at: unknown;
}

export interface LockedListingAvailability {
  readonly id: number;
  readonly status: ListingStatus;
  readonly businessStatus: ListingBusinessStatus;
  readonly availabilityConfirmedAt: Date | null;
  readonly availabilityReminderSentAt: Date | null;
  readonly availabilityReminderNotifiedAt: Date | null;
  readonly availabilityAutoPausedAt: Date | null;
}

export interface ListingAvailabilityOwnerRepository {
  readonly lockOwnedListing: (listingId: number, landlordId: number) => Promise<LockedListingAvailability | null>;
  readonly confirmAvailability: (listingId: number, landlordId: number) => Promise<void>;
}

export type ListingAvailabilityOwnerRepositoryFactory = (
  executor: SqlExecutor
) => ListingAvailabilityOwnerRepository;

function mapLockedListing(row: Readonly<LockedListingAvailabilityRow>): LockedListingAvailability {
  if (
    !Number.isSafeInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    !isListingStatus(row.status) ||
    !isListingBusinessStatus(row.business_status)
  ) {
    throw new RepositoryInvariantError("Locked listing availability row is invalid.");
  }

  return Object.freeze({
    id: row.id as number,
    status: row.status,
    businessStatus: row.business_status,
    availabilityConfirmedAt: mapNullablePgTimestamptz(
      row.availability_confirmed_at ?? null,
      "availability_confirmed_at"
    ),
    availabilityReminderSentAt: mapNullablePgTimestamptz(
      row.availability_reminder_sent_at ?? null,
      "availability_reminder_sent_at"
    ),
    availabilityReminderNotifiedAt: mapNullablePgTimestamptz(
      row.availability_reminder_notified_at ?? null,
      "availability_reminder_notified_at"
    ),
    availabilityAutoPausedAt: mapNullablePgTimestamptz(
      row.availability_auto_paused_at ?? null,
      "availability_auto_paused_at"
    )
  });
}

export function createListingAvailabilityOwnerRepository(executor: SqlExecutor): ListingAvailabilityOwnerRepository {
  return Object.freeze({
    lockOwnedListing(listingId: number, landlordId: number) {
      return queryOptional<LockedListingAvailabilityRow, LockedListingAvailability>(
        executor,
        {
          text: `
            SELECT
              id,
              status,
              business_status,
              availability_confirmed_at,
              availability_reminder_sent_at,
              availability_reminder_notified_at,
              availability_auto_paused_at
            FROM listings
            WHERE id = $1
              AND landlord_id = $2
            FOR UPDATE
          `,
          values: [listingId, landlordId]
        },
        mapLockedListing
      );
    },

    async confirmAvailability(listingId: number, landlordId: number) {
      const affected = await executeCommand(executor, {
        text: `
          UPDATE listings
          SET
            business_status = 'AVAILABLE',
            availability_confirmed_at = CURRENT_TIMESTAMP,
            availability_reminder_sent_at = NULL,
            availability_reminder_notified_at = NULL,
            availability_auto_paused_at = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
            AND landlord_id = $2
            AND status = 'APPROVED'
        `,
        values: [listingId, landlordId]
      });
      if (affected !== 1) {
        throw new RepositoryInvariantError("Listing availability confirmation affected an invalid number of rows.");
      }
    }
  });
}
