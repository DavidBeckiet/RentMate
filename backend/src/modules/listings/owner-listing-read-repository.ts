import type { QueryResultRow } from "pg";
import { queryMany, queryOptional, RepositoryInvariantError } from "../../db/repository-primitives.js";
import type { SqlExecutor } from "../../db/sql-executor.js";
import { mapOwnerImageRow, type OwnerImage, type OwnerImageRow } from "./owner-image-mapper.js";
import { mapLookupValueRow, type LookupValue, type LookupValueRow } from "./lookup-mapper.js";
import {
  mapPersistedOwnerListingRow,
  type ListingStatus,
  type OwnerListingDetailBase,
  type PersistedOwnerListingRow
} from "./owner-listing-mapper.js";
import {
  mapOwnerListingSummaryRow,
  type OwnerListingSummary,
  type OwnerListingSummaryRow
} from "./owner-listing-summary-mapper.js";

export interface OwnerListingPageInput {
  readonly landlordId: number;
  readonly status: ListingStatus | null;
  readonly limit: number;
  readonly offset: number;
}

export interface OwnerListingReadRepository {
  readonly findOwnerListingPage: (input: OwnerListingPageInput) => Promise<readonly OwnerListingSummary[]>;
  readonly findOwnerListingDetailBase: (
    listingId: number,
    landlordId: number
  ) => Promise<OwnerListingDetailBase | null>;
  readonly findAmenitiesForListing: (listingId: number) => Promise<readonly LookupValue[]>;
  readonly findImagesForListing: (listingId: number) => Promise<readonly OwnerImage[]>;
  readonly findCurrentModerationReason: (listingId: number, status: "REJECTED" | "HIDDEN") => Promise<string | null>;
}

interface ModerationReasonRow extends QueryResultRow {
  readonly reason: unknown;
}

function mapModerationReasonRow(row: Readonly<ModerationReasonRow>): string {
  if (typeof row.reason !== "string" || row.reason.trim().length === 0 || row.reason.length > 1_000) {
    throw new RepositoryInvariantError("Current moderation reason row is invalid.");
  }
  return row.reason;
}

export function createOwnerListingReadRepository(executor: SqlExecutor): OwnerListingReadRepository {
  return Object.freeze({
    async findOwnerListingPage(input: OwnerListingPageInput): Promise<readonly OwnerListingSummary[]> {
      return Object.freeze(
        await queryMany<OwnerListingSummaryRow, OwnerListingSummary>(
          executor,
          {
            text: `
              SELECT
                l.id,
                l.status,
                l.title,
                l.monthly_rent,
                l.area_name,
                l.updated_at,
                pt.code AS property_type_code,
                pt.label AS property_type_label,
                cover.id AS cover_image_id,
                cover.secure_url AS cover_image_url,
                cover.format AS cover_image_format,
                cover.width AS cover_image_width,
                cover.height AS cover_image_height,
                cover.byte_size AS cover_image_byte_size,
                cover.display_order AS cover_image_display_order,
                cover.alt_text AS cover_image_alt_text,
                cover.created_at AS cover_image_created_at,
                current_reason.reason AS current_moderation_reason
              FROM listings AS l
              LEFT JOIN property_types AS pt
                ON pt.id = l.property_type_id
              LEFT JOIN LATERAL (
                SELECT
                  id,
                  secure_url,
                  format,
                  width,
                  height,
                  byte_size,
                  display_order,
                  alt_text,
                  created_at
                FROM listing_images
                WHERE listing_id = l.id
                ORDER BY
                  display_order ASC,
                  id ASC
                LIMIT 1
              ) AS cover
                ON true
              LEFT JOIN LATERAL (
                SELECT
                  reason
                FROM moderation_history
                WHERE listing_id = l.id
                  AND new_status = l.status
                  AND l.status IN ('REJECTED', 'HIDDEN')
                ORDER BY
                  created_at DESC,
                  id DESC
                LIMIT 1
              ) AS current_reason
                ON true
              WHERE l.landlord_id = $1
                AND (
                  $2::listing_status IS NULL
                  OR l.status = $2::listing_status
                )
              ORDER BY
                l.updated_at DESC,
                l.id DESC
              LIMIT $3
              OFFSET $4
            `,
            values: [input.landlordId, input.status, input.limit, input.offset]
          },
          mapOwnerListingSummaryRow
        )
      );
    },

    async findOwnerListingDetailBase(listingId: number, landlordId: number): Promise<OwnerListingDetailBase | null> {
      return queryOptional<PersistedOwnerListingRow, OwnerListingDetailBase>(
        executor,
        {
          text: `
            SELECT
              l.id,
              l.status,
              l.title,
              l.description,
              l.monthly_rent,
              l.room_area_sqm,
              l.address_text,
              l.area_name,
              l.latitude,
              l.longitude,
              l.created_at,
              l.updated_at,
              pt.code AS property_type_code,
              pt.label AS property_type_label
            FROM listings AS l
            LEFT JOIN property_types AS pt
              ON pt.id = l.property_type_id
            WHERE l.id = $1
              AND l.landlord_id = $2
            LIMIT 1
          `,
          values: [listingId, landlordId]
        },
        mapPersistedOwnerListingRow
      );
    },

    async findAmenitiesForListing(listingId: number): Promise<readonly LookupValue[]> {
      return Object.freeze(
        await queryMany<LookupValueRow, LookupValue>(
          executor,
          {
            text: `
              SELECT
                a.code,
                a.label
              FROM listing_amenities AS la
              JOIN amenities AS a
                ON a.id = la.amenity_id
              WHERE la.listing_id = $1
              ORDER BY
                a.label ASC,
                a.code ASC
            `,
            values: [listingId]
          },
          mapLookupValueRow
        )
      );
    },

    async findImagesForListing(listingId: number): Promise<readonly OwnerImage[]> {
      return Object.freeze(
        await queryMany<OwnerImageRow, OwnerImage>(
          executor,
          {
            text: `
              SELECT
                id,
                secure_url,
                format,
                width,
                height,
                byte_size,
                display_order,
                alt_text,
                created_at
              FROM listing_images
              WHERE listing_id = $1
              ORDER BY
                display_order ASC,
                id ASC
            `,
            values: [listingId]
          },
          mapOwnerImageRow
        )
      );
    },

    async findCurrentModerationReason(listingId: number, status: "REJECTED" | "HIDDEN"): Promise<string | null> {
      return queryOptional<ModerationReasonRow, string>(
        executor,
        {
          text: `
            SELECT
              reason
            FROM moderation_history
            WHERE listing_id = $1
              AND new_status = $2
            ORDER BY
              created_at DESC,
              id DESC
            LIMIT 1
          `,
          values: [listingId, status]
        },
        mapModerationReasonRow
      );
    }
  });
}
