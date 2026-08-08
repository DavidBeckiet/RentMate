import type { QueryResultRow } from "pg";
import { executeCommand, queryMany, queryOptional, RepositoryInvariantError } from "../../db/repository-primitives.js";
import type { SqlExecutor } from "../../db/sql-executor.js";
import { isListingStatus, type ListingStatus } from "./owner-listing-mapper.js";

const maximumInteger = 2_147_483_647;

interface LockedListingRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
}

interface ListingImageDeleteTargetRow extends QueryResultRow {
  readonly id: unknown;
  readonly cloudinary_public_id: unknown;
  readonly display_order: unknown;
}

export interface LockedListingImageDeleteTarget {
  readonly id: number;
  readonly status: ListingStatus;
}

export interface ListingImageDeleteTarget {
  readonly id: number;
  readonly cloudinaryPublicId: string;
  readonly displayOrder: number;
}

export interface ListingImageDeleteMutation {
  readonly listingId: number;
  readonly landlordId: number;
  readonly currentStatus: ListingStatus;
  readonly resultingStatus: ListingStatus;
}

export interface ListingImageDeleteRepository {
  readonly lockOwnedListing: (listingId: number, landlordId: number) => Promise<LockedListingImageDeleteTarget | null>;
  readonly findCurrentImages: (listingId: number) => Promise<readonly ListingImageDeleteTarget[]>;
  readonly deleteListingImage: (listingId: number, imageId: number) => Promise<boolean>;
  readonly updateListingAfterImageDeletion: (input: ListingImageDeleteMutation) => Promise<boolean>;
}

export type ListingImageDeleteRepositoryFactory = (executor: SqlExecutor) => ListingImageDeleteRepository;

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= maximumInteger;
}

function mapLockedListing(row: Readonly<LockedListingRow>): LockedListingImageDeleteTarget {
  if (!isPositiveInteger(row.id) || !isListingStatus(row.status)) {
    throw new RepositoryInvariantError("Locked image-delete listing row is invalid.");
  }
  return Object.freeze({ id: row.id, status: row.status });
}

function mapImageTarget(row: Readonly<ListingImageDeleteTargetRow>): ListingImageDeleteTarget {
  if (
    !isPositiveInteger(row.id) ||
    typeof row.cloudinary_public_id !== "string" ||
    !row.cloudinary_public_id.trim() ||
    row.cloudinary_public_id.trim() !== row.cloudinary_public_id ||
    row.cloudinary_public_id.length > 255 ||
    !Number.isInteger(row.display_order) ||
    (row.display_order as number) < 1 ||
    (row.display_order as number) > 8
  ) {
    throw new RepositoryInvariantError("Listing image-delete target row is invalid.");
  }
  return Object.freeze({
    id: row.id,
    cloudinaryPublicId: row.cloudinary_public_id,
    displayOrder: row.display_order as number
  });
}

function validateImages(images: readonly ListingImageDeleteTarget[]): readonly ListingImageDeleteTarget[] {
  if (
    images.length > 8 ||
    new Set(images.map((image) => image.id)).size !== images.length ||
    new Set(images.map((image) => image.displayOrder)).size !== images.length
  ) {
    throw new RepositoryInvariantError("Listing image-delete aggregate is invalid.");
  }
  return Object.freeze([...images]);
}

function validateAffectedRows(affected: number, operation: string): boolean {
  if (affected !== 0 && affected !== 1) {
    throw new RepositoryInvariantError(`${operation} affected an invalid number of rows.`);
  }
  return affected === 1;
}

export function createListingImageDeleteRepository(executor: SqlExecutor): ListingImageDeleteRepository {
  return Object.freeze({
    lockOwnedListing(listingId: number, landlordId: number) {
      return queryOptional(
        executor,
        {
          text: `SELECT l.id, l.status FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l`,
          values: [listingId, landlordId]
        },
        mapLockedListing
      );
    },
    async findCurrentImages(listingId: number) {
      const images = await queryMany(
        executor,
        {
          text: `SELECT id, cloudinary_public_id, display_order FROM listing_images WHERE listing_id = $1 ORDER BY display_order ASC, id ASC`,
          values: [listingId]
        },
        mapImageTarget
      );
      return validateImages(images);
    },
    async deleteListingImage(listingId: number, imageId: number) {
      const affected = await executeCommand(executor, {
        text: `DELETE FROM listing_images WHERE id = $1 AND listing_id = $2`,
        values: [imageId, listingId]
      });
      return validateAffectedRows(affected, "Listing image deletion");
    },
    async updateListingAfterImageDeletion(input: ListingImageDeleteMutation) {
      const affected = await executeCommand(executor, {
        text: `UPDATE listings SET status = $1::listing_status, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND landlord_id = $3 AND status = $4::listing_status`,
        values: [input.resultingStatus, input.listingId, input.landlordId, input.currentStatus]
      });
      return validateAffectedRows(affected, "Listing image-deletion update");
    }
  });
}
