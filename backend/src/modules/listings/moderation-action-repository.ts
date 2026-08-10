import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryOptional,
  RepositoryInvariantError
} from "../../db/repository-primitives.js";
import type { SqlExecutor } from "../../db/sql-executor.js";
import {
  mapModerationHistoryItemRow,
  type ModerationHistoryItem,
  type ModerationHistoryItemRow
} from "./moderation-history-mapper.js";
import { isListingStatus, type ListingStatus } from "./owner-listing-mapper.js";

const maximumListingId = 2_147_483_647;

interface LockedModerationListingRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
}

export interface LockedModerationListing {
  readonly id: number;
  readonly status: ListingStatus;
}

export interface ModerationStatusTransition {
  readonly expectedStatus: ListingStatus;
  readonly nextStatus: ListingStatus;
}

export interface InsertModerationHistoryInput {
  readonly listingId: number;
  readonly adminId: number;
  readonly previousStatus: ListingStatus;
  readonly newStatus: ListingStatus;
  readonly reason: string | null;
}

export interface ModerationActionRepository {
  readonly lockListing: (listingId: number) => Promise<LockedModerationListing | null>;
  readonly transitionStatus: (listingId: number, transition: ModerationStatusTransition) => Promise<boolean>;
  readonly insertHistory: (input: InsertModerationHistoryInput) => Promise<ModerationHistoryItem>;
}

export type ModerationActionRepositoryFactory = (executor: SqlExecutor) => ModerationActionRepository;

function mapLockedModerationListing(row: Readonly<LockedModerationListingRow>): LockedModerationListing {
  if (
    !Number.isInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    !isListingStatus(row.status)
  ) {
    throw new RepositoryInvariantError("Locked moderation listing row is invalid.");
  }
  return Object.freeze({ id: row.id as number, status: row.status });
}

export function createModerationActionRepository(executor: SqlExecutor): ModerationActionRepository {
  return Object.freeze({
    lockListing(listingId: number) {
      return queryOptional(
        executor,
        {
          text: "SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 FOR UPDATE OF l",
          values: [listingId]
        },
        mapLockedModerationListing
      );
    },

    async transitionStatus(listingId: number, transition: ModerationStatusTransition) {
      const affected = await executeCommand(executor, {
        text: "UPDATE listings SET status = $2::listing_status, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = $3::listing_status",
        values: [listingId, transition.nextStatus, transition.expectedStatus]
      });
      if (affected !== 0 && affected !== 1) {
        throw new RepositoryInvariantError("Moderation action affected an invalid number of listing rows.");
      }
      return affected === 1;
    },

    insertHistory(input: InsertModerationHistoryInput) {
      return queryExactlyOne<ModerationHistoryItemRow, ModerationHistoryItem>(
        executor,
        {
          text: `INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status, reason) VALUES ($1, $2, $3::listing_status, $4::listing_status, $5) RETURNING id, listing_id, admin_id, previous_status, new_status, reason, created_at`,
          values: [input.listingId, input.adminId, input.previousStatus, input.newStatus, input.reason]
        },
        mapModerationHistoryItemRow
      );
    }
  });
}
