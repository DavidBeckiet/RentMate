import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { isListingBusinessStatus, type ListingBusinessStatus } from "../../../../../shared/listing-business-status.js";

const maximumListingId = 2_147_483_647;

interface LockedBusinessStatusRow extends QueryResultRow {
  readonly id: unknown;
  readonly business_status: unknown;
}

export interface LockedBusinessStatusListing {
  readonly id: number;
  readonly businessStatus: ListingBusinessStatus;
}

export interface BusinessStatusUpdateRecord {
  readonly listingId: number;
  readonly landlordId: number;
  readonly expectedStatus: ListingBusinessStatus;
  readonly nextStatus: ListingBusinessStatus;
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
    !isListingBusinessStatus(row.business_status)
  ) {
    throw new RepositoryInvariantError("Locked listing business status row is invalid.");
  }

  return Object.freeze({ id: row.id as number, businessStatus: row.business_status });
}

export function createListingBusinessStatusRepository(executor: SqlExecutor): ListingBusinessStatusRepository {
  return Object.freeze({
    lockOwnedListing(listingId: number, landlordId: number) {
      return queryOptional<LockedBusinessStatusRow, LockedBusinessStatusListing>(
        executor,
        {
          text: "SELECT id, business_status FROM listings WHERE id = $1 AND landlord_id = $2 FOR UPDATE",
          values: [listingId, landlordId]
        },
        mapLockedBusinessStatusRow
      );
    },
    async updateBusinessStatus(record: BusinessStatusUpdateRecord): Promise<boolean> {
      const affected = await executeCommand(executor, {
        text: "UPDATE listings SET business_status = $4::listing_business_status, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND landlord_id = $2 AND business_status = $3::listing_business_status",
        values: [record.listingId, record.landlordId, record.expectedStatus, record.nextStatus]
      });
      if (affected !== 0 && affected !== 1) {
        throw new RepositoryInvariantError("Listing business status update affected an invalid number of rows.");
      }
      return affected === 1;
    }
  });
}
