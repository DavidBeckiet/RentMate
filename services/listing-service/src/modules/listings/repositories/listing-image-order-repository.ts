import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { mapOwnerImageRow, type OwnerImage, type OwnerImageRow } from "../mappers/owner-image-mapper.js";
import { isListingStatus, type ListingStatus } from "../mappers/owner-listing-mapper.js";

const maximumInteger = 2_147_483_647;

interface LockedListingRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
}

export interface LockedListingImageOrderTarget {
  readonly id: number;
  readonly status: ListingStatus;
}

export interface ListingImageOrderTouch {
  readonly listingId: number;
  readonly landlordId: number;
  readonly currentStatus: ListingStatus;
}

export interface ListingImageOrderRepository {
  readonly lockOwnedListing: (listingId: number, landlordId: number) => Promise<LockedListingImageOrderTarget | null>;
  readonly findCurrentImages: (listingId: number) => Promise<readonly OwnerImage[]>;
  readonly deferImageOrderUniqueness: () => Promise<void>;
  readonly reorderImages: (
    listingId: number,
    orderedImageIds: readonly number[]
  ) => Promise<readonly OwnerImage[] | null>;
  readonly touchListingAfterImageReorder: (input: ListingImageOrderTouch) => Promise<boolean>;
}

export type ListingImageOrderRepositoryFactory = (executor: SqlExecutor) => ListingImageOrderRepository;

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= maximumInteger;
}

function mapLockedListing(row: Readonly<LockedListingRow>): LockedListingImageOrderTarget {
  if (!isPositiveInteger(row.id) || !isListingStatus(row.status)) {
    throw new RepositoryInvariantError("Locked image-order listing row is invalid.");
  }
  return Object.freeze({ id: row.id, status: row.status });
}

function mapImage(row: Readonly<OwnerImageRow>): OwnerImage {
  try {
    return mapOwnerImageRow(row);
  } catch {
    throw new RepositoryInvariantError("Listing image-order row is invalid.");
  }
}

function validateCurrentImages(images: readonly OwnerImage[]): readonly OwnerImage[] {
  if (
    images.length > 8 ||
    new Set(images.map((image) => image.id)).size !== images.length ||
    new Set(images.map((image) => image.displayOrder)).size !== images.length
  ) {
    throw new RepositoryInvariantError("Listing image-order aggregate is invalid.");
  }
  return Object.freeze([...images]);
}

function validateReorderedImages(
  images: readonly OwnerImage[],
  orderedImageIds: readonly number[]
): readonly OwnerImage[] {
  const expectedCount = orderedImageIds.length;
  const expectedIds = new Set(orderedImageIds);
  const returnedIds = new Set(images.map((image) => image.id));
  const returnedOrders = new Set(images.map((image) => image.displayOrder));
  if (
    images.length !== expectedCount ||
    expectedIds.size !== expectedCount ||
    returnedIds.size !== expectedCount ||
    orderedImageIds.some((id) => !returnedIds.has(id)) ||
    returnedOrders.size !== expectedCount ||
    Array.from({ length: expectedCount }, (_, index) => index + 1).some((order) => !returnedOrders.has(order))
  ) {
    throw new RepositoryInvariantError("Listing image reorder returned an invalid aggregate.");
  }

  const sorted = [...images].sort((left, right) => left.displayOrder - right.displayOrder);
  if (sorted.some((image, index) => image.id !== orderedImageIds[index])) {
    throw new RepositoryInvariantError("Listing image reorder returned an unexpected order.");
  }
  return Object.freeze(sorted);
}

function validateShortReorderResult(rows: readonly OwnerImageRow[], orderedImageIds: readonly number[]): void {
  const images = rows.map(mapImage);
  const returnedIds = new Set(images.map((image) => image.id));
  const returnedOrders = new Set(images.map((image) => image.displayOrder));
  if (
    returnedIds.size !== images.length ||
    returnedOrders.size !== images.length ||
    images.some((image) => {
      const requestedIndex = orderedImageIds.indexOf(image.id);
      return requestedIndex < 0 || image.displayOrder !== requestedIndex + 1;
    })
  ) {
    throw new RepositoryInvariantError("Listing image reorder returned an invalid partial aggregate.");
  }
}

function validateAffectedRows(affected: number, operation: string): boolean {
  if (affected !== 0 && affected !== 1) {
    throw new RepositoryInvariantError(`${operation} affected an invalid number of rows.`);
  }
  return affected === 1;
}

export function createListingImageOrderRepository(executor: SqlExecutor): ListingImageOrderRepository {
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
      const images = await queryMany<OwnerImageRow, OwnerImage>(
        executor,
        {
          text: `SELECT id, secure_url, format, width, height, byte_size, display_order, alt_text, created_at FROM listing_images WHERE listing_id = $1 ORDER BY display_order ASC, id ASC`,
          values: [listingId]
        },
        mapImage
      );
      return validateCurrentImages(images);
    },
    async deferImageOrderUniqueness() {
      const result = await executor.query({
        text: `SET CONSTRAINTS uq_listing_images_listing_display_order DEFERRED`,
        values: []
      });
      if (result.rowCount !== null || result.rows.length !== 0) {
        throw new RepositoryInvariantError("Image-order constraint deferral returned an invalid result.");
      }
    },
    async reorderImages(listingId: number, orderedImageIds: readonly number[]) {
      if (orderedImageIds.length === 0 || orderedImageIds.length > 8) {
        throw new RepositoryInvariantError("Listing image reorder input is invalid.");
      }
      const expectedCount = orderedImageIds.length;
      const result = await executor.query<OwnerImageRow>({
        text: `WITH desired(image_id, display_order) AS (SELECT * FROM unnest($2::integer[], $3::smallint[])) UPDATE listing_images AS li SET display_order = desired.display_order FROM desired WHERE li.listing_id = $1 AND li.id = desired.image_id RETURNING li.id, li.secure_url, li.format, li.width, li.height, li.byte_size, li.display_order, li.alt_text, li.created_at`,
        values: [listingId, [...orderedImageIds], Array.from({ length: expectedCount }, (_, index) => index + 1)]
      });
      if (
        result.rowCount === null ||
        result.rowCount < 0 ||
        result.rowCount > expectedCount ||
        result.rowCount !== result.rows.length
      ) {
        throw new RepositoryInvariantError("Listing image reorder affected an invalid number of rows.");
      }
      if (result.rowCount < expectedCount) {
        validateShortReorderResult(result.rows, orderedImageIds);
        return null;
      }
      return validateReorderedImages(result.rows.map(mapImage), orderedImageIds);
    },
    async touchListingAfterImageReorder(input: ListingImageOrderTouch) {
      const affected = await executeCommand(executor, {
        text: `UPDATE listings SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND landlord_id = $2 AND status = $3::listing_status`,
        values: [input.listingId, input.landlordId, input.currentStatus]
      });
      return validateAffectedRows(affected, "Listing image-reorder timestamp update");
    }
  });
}
