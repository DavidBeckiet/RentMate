import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { isListingStatus, type ListingStatus } from "../mappers/owner-listing-mapper.js";

const maximumListingId = 2_147_483_647;

interface LockedListingDeleteTargetRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
}

interface ModerationHistoryExistsRow extends QueryResultRow {
  readonly has_moderation_history: unknown;
}

interface CloudinaryPublicIdRow extends QueryResultRow {
  readonly cloudinary_public_id: unknown;
}

export interface LockedListingDeleteTarget {
  readonly id: number;
  readonly status: ListingStatus;
}

export interface ListingDeleteRepository {
  readonly lockOwnedListing: (listingId: number, landlordId: number) => Promise<LockedListingDeleteTarget | null>;
  readonly hasModerationHistory: (listingId: number) => Promise<boolean>;
  readonly findCloudinaryPublicIds: (listingId: number) => Promise<readonly string[]>;
  readonly deleteOwnedDraft: (listingId: number, landlordId: number) => Promise<boolean>;
}

export type ListingDeleteRepositoryFactory = (executor: SqlExecutor) => ListingDeleteRepository;

function mapLockedListingDeleteTarget(row: Readonly<LockedListingDeleteTargetRow>): LockedListingDeleteTarget {
  if (
    !Number.isInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    !isListingStatus(row.status)
  ) {
    throw new RepositoryInvariantError("Locked listing delete target row is invalid.");
  }
  return Object.freeze({ id: row.id as number, status: row.status });
}

function mapModerationHistoryExists(row: Readonly<ModerationHistoryExistsRow>): boolean {
  if (typeof row.has_moderation_history !== "boolean") {
    throw new RepositoryInvariantError("Listing moderation-history existence row is invalid.");
  }
  return row.has_moderation_history;
}

function mapCloudinaryPublicId(row: Readonly<CloudinaryPublicIdRow>): string {
  if (
    typeof row.cloudinary_public_id !== "string" ||
    row.cloudinary_public_id.length === 0 ||
    row.cloudinary_public_id.trim() !== row.cloudinary_public_id
  ) {
    throw new RepositoryInvariantError("Listing image public-ID row is invalid.");
  }
  return row.cloudinary_public_id;
}

export function createListingDeleteRepository(executor: SqlExecutor): ListingDeleteRepository {
  return Object.freeze({
    lockOwnedListing(listingId: number, landlordId: number) {
      return queryOptional(
        executor,
        {
          text: `SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l`,
          values: [listingId, landlordId]
        },
        mapLockedListingDeleteTarget
      );
    },
    hasModerationHistory(listingId: number) {
      return queryExactlyOne(
        executor,
        {
          text: `SELECT EXISTS (SELECT 1 FROM moderation_history WHERE listing_id = $1) AS has_moderation_history`,
          values: [listingId]
        },
        mapModerationHistoryExists
      );
    },
    async findCloudinaryPublicIds(listingId: number) {
      return Object.freeze(
        await queryMany(
          executor,
          {
            text: `SELECT cloudinary_public_id FROM listing_images WHERE listing_id = $1 ORDER BY id ASC`,
            values: [listingId]
          },
          mapCloudinaryPublicId
        )
      );
    },
    async deleteOwnedDraft(listingId: number, landlordId: number) {
      const affected = await executeCommand(executor, {
        text: `DELETE FROM listings WHERE id = $1 AND landlord_id = $2 AND status = 'DRAFT'`,
        values: [listingId, landlordId]
      });
      if (affected !== 0 && affected !== 1) {
        throw new RepositoryInvariantError("Listing delete affected an invalid number of rows.");
      }
      return affected === 1;
    }
  });
}
