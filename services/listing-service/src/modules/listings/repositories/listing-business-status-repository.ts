import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { mapNullablePgTimestamptz } from "../../../../../shared/src/runtime/db/value-mappers.js";
import { isListingBusinessStatus, type ListingBusinessStatus } from "../../../../../shared/listing-business-status.js";
import { isListingStatus, type ListingStatus } from "../mappers/owner-listing-mapper.js";

const maximumListingId = 2_147_483_647;

interface LockedBusinessStatusRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
  readonly business_status: unknown;
  readonly availability_auto_paused_at: unknown;
}

export interface LockedBusinessStatusListing {
  readonly id: number;
  readonly status: ListingStatus;
  readonly businessStatus: ListingBusinessStatus;
  readonly availabilityAutoPausedAt: Date | null;
}

export interface BusinessStatusUpdateRecord {
  readonly listingId: number;
  readonly landlordId: number;
  readonly expectedStatus: ListingBusinessStatus;
  readonly nextStatus: ListingBusinessStatus;
  readonly resetAvailability: boolean;
  readonly clearAutoPause: boolean;
}

export interface ListingBusinessStatusRepository {
  readonly lockOwnedListing: (listingId: number, landlordId: number) => Promise<LockedBusinessStatusListing | null>;
  readonly updateBusinessStatus: (record: BusinessStatusUpdateRecord) => Promise<boolean>;
}

export type ListingBusinessStatusRepositoryFactory = (executor: SqlExecutor) => ListingBusinessStatusRepository;

function mapLockedBusinessStatusRow(row: Readonly<LockedBusinessStatusRow>): LockedBusinessStatusListing {
  if (
    !Number.isSafeInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    !isListingStatus(row.status) ||
    !isListingBusinessStatus(row.business_status)
  ) {
    throw new RepositoryInvariantError("Locked listing business status row is invalid.");
  }

  return Object.freeze({
    id: row.id as number,
    status: row.status,
    businessStatus: row.business_status,
    availabilityAutoPausedAt: mapNullablePgTimestamptz(
      row.availability_auto_paused_at ?? null,
      "availability_auto_paused_at"
    )
  });
}

export function createListingBusinessStatusRepository(executor: SqlExecutor): ListingBusinessStatusRepository {
  return Object.freeze({
    lockOwnedListing(listingId: number, landlordId: number) {
      return queryOptional<LockedBusinessStatusRow, LockedBusinessStatusListing>(
        executor,
        {
          text: "SELECT id, status, business_status, availability_auto_paused_at FROM listings WHERE id = $1 AND landlord_id = $2 FOR UPDATE",
          values: [listingId, landlordId]
        },
        mapLockedBusinessStatusRow
      );
    },
    async updateBusinessStatus(record: BusinessStatusUpdateRecord): Promise<boolean> {
      const affected = await executeCommand(executor, {
        text: `
          UPDATE listings
          SET
            business_status = $4::listing_business_status,
            availability_confirmed_at = CASE WHEN $5::boolean THEN CURRENT_TIMESTAMP ELSE availability_confirmed_at END,
            availability_reminder_sent_at = CASE WHEN $5::boolean THEN NULL ELSE availability_reminder_sent_at END,
            availability_reminder_notified_at = CASE WHEN $5::boolean THEN NULL ELSE availability_reminder_notified_at END,
            availability_auto_paused_at = CASE WHEN $5::boolean OR $6::boolean THEN NULL ELSE availability_auto_paused_at END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
            AND landlord_id = $2
            AND business_status = $3::listing_business_status
        `,
        values: [
          record.listingId,
          record.landlordId,
          record.expectedStatus,
          record.nextStatus,
          record.resetAvailability,
          record.clearAutoPause
        ]
      });
      if (affected !== 0 && affected !== 1) {
        throw new RepositoryInvariantError("Listing business status update affected an invalid number of rows.");
      }
      return affected === 1;
    }
  });
}
