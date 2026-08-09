import type { QueryResultRow } from "pg";
import { queryMany, queryOptional } from "../../db/repository-primitives.js";
import type { SqlExecutor } from "../../db/sql-executor.js";
import {
  mapAdminListingDetailRow,
  type AdminListingDetailBase,
  type AdminListingDetailRow
} from "./admin-listing-detail-mapper.js";
import {
  mapAdminListingSummaryRow,
  type AdminListingSummary,
  type AdminListingSummaryRow
} from "./admin-listing-summary-mapper.js";
import {
  createCurrentModerationReasonRepository,
  type CurrentModerationReasonRepository
} from "./current-moderation-reason-repository.js";
import type { CurrentModerationReasonStatus } from "./current-moderation-reason.js";
import { mapLookupValueRow, type LookupValue, type LookupValueRow } from "./lookup-mapper.js";
import {
  mapModerationHistoryItemRow,
  type ModerationHistoryItem,
  type ModerationHistoryItemRow
} from "./moderation-history-mapper.js";
import { mapOwnerImageRow, type OwnerImage, type OwnerImageRow } from "./owner-image-mapper.js";
import type { ListingStatus } from "./owner-listing-mapper.js";

interface ListingExistenceRow extends QueryResultRow {
  readonly id: unknown;
}

export interface AdminListingPageInput {
  readonly status: ListingStatus;
  readonly limit: number;
  readonly offset: number;
}

export interface ModerationHistoryPageInput {
  readonly listingId: number;
  readonly limit: number;
  readonly offset: number;
}

export interface AdminListingReadRepository {
  readonly findListingPage: (input: AdminListingPageInput) => Promise<readonly AdminListingSummary[]>;
  readonly findListingDetailBase: (listingId: number) => Promise<AdminListingDetailBase | null>;
  readonly findAmenitiesForListing: (listingId: number) => Promise<readonly LookupValue[]>;
  readonly findImagesForListing: (listingId: number) => Promise<readonly OwnerImage[]>;
  readonly findCurrentModerationReason: (
    listingId: number,
    status: CurrentModerationReasonStatus
  ) => Promise<string | null>;
  readonly listingExists: (listingId: number) => Promise<boolean>;
  readonly findModerationHistoryPage: (input: ModerationHistoryPageInput) => Promise<readonly ModerationHistoryItem[]>;
}

function mapExistenceRow(row: Readonly<ListingExistenceRow>): number {
  if (!Number.isInteger(row.id) || (row.id as number) < 1 || (row.id as number) > 2_147_483_647) {
    throw new Error("Listing existence row is invalid.");
  }
  return row.id as number;
}

export function createAdminListingReadRepository(executor: SqlExecutor): AdminListingReadRepository {
  const currentReasonRepository: CurrentModerationReasonRepository = createCurrentModerationReasonRepository(executor);
  return Object.freeze({
    async findListingPage(input: AdminListingPageInput): Promise<readonly AdminListingSummary[]> {
      return Object.freeze(
        await queryMany<AdminListingSummaryRow, AdminListingSummary>(
          executor,
          {
            text: `
              SELECT
                l.id,
                l.status,
                l.title,
                l.area_name,
                l.updated_at,
                landlord.id AS landlord_id,
                landlord.email AS landlord_email,
                landlord.phone_e164 AS landlord_phone,
                landlord.is_active AS landlord_is_active
              FROM listings AS l
              JOIN users AS landlord
                ON landlord.id = l.landlord_id
              WHERE l.status = $1::listing_status
              ORDER BY
                l.updated_at DESC,
                l.id DESC
              LIMIT $2
              OFFSET $3
            `,
            values: [input.status, input.limit, input.offset]
          },
          mapAdminListingSummaryRow
        )
      );
    },

    async findListingDetailBase(listingId: number): Promise<AdminListingDetailBase | null> {
      return queryOptional<AdminListingDetailRow, AdminListingDetailBase>(
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
              property_type.code AS property_type_code,
              property_type.label AS property_type_label,
              landlord.id AS landlord_id,
              landlord.role AS landlord_role,
              landlord.email AS landlord_email,
              landlord.phone_e164 AS landlord_phone,
              landlord.is_active AS landlord_is_active
            FROM listings AS l
            LEFT JOIN property_types AS property_type
              ON property_type.id = l.property_type_id
            JOIN users AS landlord
              ON landlord.id = l.landlord_id
            WHERE l.id = $1
            LIMIT 1
          `,
          values: [listingId]
        },
        mapAdminListingDetailRow
      );
    },

    async findAmenitiesForListing(listingId: number): Promise<readonly LookupValue[]> {
      return Object.freeze(
        await queryMany<LookupValueRow, LookupValue>(
          executor,
          {
            text: `
              SELECT
                amenity.code,
                amenity.label
              FROM listing_amenities
              JOIN amenities AS amenity
                ON amenity.id = listing_amenities.amenity_id
              WHERE listing_amenities.listing_id = $1
              ORDER BY
                amenity.label ASC,
                amenity.code ASC
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

    async findCurrentModerationReason(
      listingId: number,
      status: CurrentModerationReasonStatus
    ): Promise<string | null> {
      return currentReasonRepository.findLatestReason(listingId, status);
    },

    async listingExists(listingId: number): Promise<boolean> {
      const id = await queryOptional<ListingExistenceRow, number>(
        executor,
        { text: "SELECT id FROM listings WHERE id = $1", values: [listingId] },
        mapExistenceRow
      );
      return id !== null;
    },

    async findModerationHistoryPage(input: ModerationHistoryPageInput): Promise<readonly ModerationHistoryItem[]> {
      return Object.freeze(
        await queryMany<ModerationHistoryItemRow, ModerationHistoryItem>(
          executor,
          {
            text: `
              SELECT
                id,
                listing_id,
                admin_id,
                previous_status,
                new_status,
                reason,
                created_at
              FROM moderation_history
              WHERE listing_id = $1
              ORDER BY
                created_at DESC,
                id DESC
              LIMIT $2
              OFFSET $3
            `,
            values: [input.listingId, input.limit, input.offset]
          },
          mapModerationHistoryItemRow
        )
      );
    }
  });
}
