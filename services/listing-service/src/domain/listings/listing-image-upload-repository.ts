import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../shared/src/runtime/db/sql-executor.js";
import type { CloudinaryUploadedImage } from "../../../../shared/src/runtime/integrations/cloudinary.client.js";
import { mapOwnerImageRow, type OwnerImage, type OwnerImageRow } from "./owner-image-mapper.js";
import { isListingStatus, type ListingStatus } from "./owner-listing-mapper.js";

const maximumInteger = 2_147_483_647;

interface OwnedImageCountRow extends QueryResultRow {
  readonly id: unknown;
  readonly image_count: unknown;
}

interface LockedImageUploadListingRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
}

interface ImageSlotRow extends QueryResultRow {
  readonly id: unknown;
  readonly display_order: unknown;
}

export interface OwnedImageCount {
  readonly listingId: number;
  readonly imageCount: number;
}

export interface LockedImageUploadListing {
  readonly id: number;
  readonly status: ListingStatus;
}

export interface ListingImageSlot {
  readonly id: number;
  readonly displayOrder: number;
}

export interface InsertImageMetadataInput {
  readonly listingId: number;
  readonly uploaded: CloudinaryUploadedImage;
  readonly displayOrder: number;
  readonly altText: string | null;
}

export interface UpdateListingAfterImageAdditionInput {
  readonly listingId: number;
  readonly landlordId: number;
  readonly currentStatus: ListingStatus;
  readonly resultingStatus: ListingStatus;
}

export interface ListingImageUploadRepository {
  readonly findOwnedImageCount: (listingId: number, landlordId: number) => Promise<OwnedImageCount | null>;
  readonly lockOwnedListing: (listingId: number, landlordId: number) => Promise<LockedImageUploadListing | null>;
  readonly findCurrentImageSlots: (listingId: number) => Promise<readonly ListingImageSlot[]>;
  readonly insertImageMetadata: (input: InsertImageMetadataInput) => Promise<OwnerImage>;
  readonly updateListingAfterImageAddition: (input: UpdateListingAfterImageAdditionInput) => Promise<boolean>;
}

export type ListingImageUploadRepositoryFactory = (executor: SqlExecutor) => ListingImageUploadRepository;

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= maximumInteger;
}

function mapOwnedImageCount(row: Readonly<OwnedImageCountRow>): OwnedImageCount {
  if (!isPositiveInteger(row.id) || !Number.isInteger(row.image_count) || (row.image_count as number) < 0) {
    throw new RepositoryInvariantError("Owned listing image-count row is invalid.");
  }
  return Object.freeze({ listingId: row.id, imageCount: row.image_count as number });
}

function mapLockedListing(row: Readonly<LockedImageUploadListingRow>): LockedImageUploadListing {
  if (!isPositiveInteger(row.id) || !isListingStatus(row.status)) {
    throw new RepositoryInvariantError("Locked image-upload listing row is invalid.");
  }
  return Object.freeze({ id: row.id, status: row.status });
}

function mapImageSlot(row: Readonly<ImageSlotRow>): ListingImageSlot {
  if (
    !isPositiveInteger(row.id) ||
    !Number.isInteger(row.display_order) ||
    (row.display_order as number) < 1 ||
    (row.display_order as number) > 8
  ) {
    throw new RepositoryInvariantError("Listing image slot row is invalid.");
  }
  return Object.freeze({ id: row.id, displayOrder: row.display_order as number });
}

function validateSlots(slots: readonly ListingImageSlot[]): readonly ListingImageSlot[] {
  if (slots.length > 8 || new Set(slots.map((slot) => slot.displayOrder)).size !== slots.length) {
    throw new RepositoryInvariantError("Listing image slots are invalid.");
  }
  return Object.freeze([...slots]);
}

export function findSmallestUnusedDisplayOrder(slots: readonly Readonly<ListingImageSlot>[]): number | null {
  const used = new Set(slots.map((slot) => slot.displayOrder));
  for (let displayOrder = 1; displayOrder <= 8; displayOrder += 1) {
    if (!used.has(displayOrder)) return displayOrder;
  }
  return null;
}

export function createListingImageUploadRepository(executor: SqlExecutor): ListingImageUploadRepository {
  return Object.freeze({
    findOwnedImageCount(listingId: number, landlordId: number) {
      return queryOptional(
        executor,
        {
          text: `SELECT l.id, (SELECT COUNT(*)::integer FROM listing_images AS li WHERE li.listing_id = l.id) AS image_count FROM listings AS l WHERE l.id = $1 AND l.landlord_id = $2 LIMIT 1`,
          values: [listingId, landlordId]
        },
        mapOwnedImageCount
      );
    },
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
    async findCurrentImageSlots(listingId: number) {
      const slots = await queryMany(
        executor,
        {
          text: `SELECT id, display_order FROM listing_images WHERE listing_id = $1 ORDER BY display_order ASC, id ASC`,
          values: [listingId]
        },
        mapImageSlot
      );
      return validateSlots(slots);
    },
    insertImageMetadata(input: InsertImageMetadataInput) {
      return queryExactlyOne<OwnerImageRow, OwnerImage>(
        executor,
        {
          text: `INSERT INTO listing_images (listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order, alt_text) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, secure_url, format, width, height, byte_size, display_order, alt_text, created_at`,
          values: [
            input.listingId,
            input.uploaded.publicId,
            input.uploaded.secureUrl,
            input.uploaded.format,
            input.uploaded.width,
            input.uploaded.height,
            input.uploaded.byteSize,
            input.displayOrder,
            input.altText
          ]
        },
        mapOwnerImageRow
      );
    },
    async updateListingAfterImageAddition(input: UpdateListingAfterImageAdditionInput) {
      const affected = await executeCommand(executor, {
        text: `UPDATE listings SET status = $1::listing_status, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND landlord_id = $3 AND status = $4::listing_status`,
        values: [input.resultingStatus, input.listingId, input.landlordId, input.currentStatus]
      });
      if (affected !== 0 && affected !== 1) {
        throw new RepositoryInvariantError("Listing image addition affected an invalid number of rows.");
      }
      return affected === 1;
    }
  });
}
