import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { isListingStatus, type ListingStatus } from "../mappers/owner-listing-mapper.js";

const maximumListingId = 2_147_483_647;

interface LockedListingLifecycleActionRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
}

export interface LockedListingLifecycleAction {
  readonly id: number;
  readonly status: ListingStatus;
}

export type ListingAvailabilityTransition =
  | Readonly<{
      readonly expectedStatus: "APPROVED";
      readonly nextStatus: "INACTIVE";
    }>
  | Readonly<{
      readonly expectedStatus: "INACTIVE";
      readonly nextStatus: "APPROVED";
    }>;

export interface ListingLifecycleActionRepository {
  readonly lockOwnedListing: (listingId: number, landlordId: number) => Promise<LockedListingLifecycleAction | null>;
  readonly transitionStatus: (
    listingId: number,
    landlordId: number,
    transition: ListingAvailabilityTransition
  ) => Promise<boolean>;
}

export type ListingLifecycleActionRepositoryFactory = (executor: SqlExecutor) => ListingLifecycleActionRepository;

function mapLockedListingLifecycleAction(row: Readonly<LockedListingLifecycleActionRow>): LockedListingLifecycleAction {
  if (
    !Number.isInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    !isListingStatus(row.status)
  ) {
    throw new RepositoryInvariantError("Locked listing lifecycle action row is invalid.");
  }
  return Object.freeze({ id: row.id as number, status: row.status });
}

export function createListingLifecycleActionRepository(executor: SqlExecutor): ListingLifecycleActionRepository {
  return Object.freeze({
    lockOwnedListing(listingId: number, landlordId: number) {
      return queryOptional(
        executor,
        {
          text: `SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l`,
          values: [listingId, landlordId]
        },
        mapLockedListingLifecycleAction
      );
    },
    async transitionStatus(listingId: number, landlordId: number, transition: ListingAvailabilityTransition) {
      const affected = await executeCommand(executor, {
        text: `UPDATE listings SET status = $1::listing_status, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND landlord_id = $3 AND status = $4::listing_status`,
        values: [transition.nextStatus, listingId, landlordId, transition.expectedStatus]
      });
      if (affected !== 0 && affected !== 1) {
        throw new RepositoryInvariantError("Listing lifecycle action affected an invalid number of rows.");
      }
      return affected === 1;
    }
  });
}
