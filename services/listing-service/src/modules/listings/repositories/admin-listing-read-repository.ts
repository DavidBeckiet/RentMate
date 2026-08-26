import type { QueryResultRow } from "pg";
import {
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { UserRole } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import {
  mapAdminListingDetailRow,
  type AdminListingDetailBase,
  type AdminListingDetailRow
} from "../mappers/admin-listing-detail-mapper.js";
import {
  mapAdminListingSummaryRow,
  type AdminListingSummary,
  type AdminListingSummaryRow
} from "../mappers/admin-listing-summary-mapper.js";
import {
  createCurrentModerationReasonRepository,
  type CurrentModerationReasonRepository
} from "./current-moderation-reason-repository.js";
import type { CurrentModerationReasonStatus } from "../current-moderation-reason.js";
import { mapLookupValueRow, type LookupValue, type LookupValueRow } from "../mappers/lookup-mapper.js";
import {
  mapModerationHistoryItemRow,
  type ModerationHistoryItem,
  type ModerationHistoryItemRow
} from "../mappers/moderation-history-mapper.js";
import { mapOwnerImageRow, type OwnerImage, type OwnerImageRow } from "../mappers/owner-image-mapper.js";
import type { ListingStatus } from "../mappers/owner-listing-mapper.js";

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

export interface AdminListingLandlordProfile {
  readonly id: number;
  readonly role: UserRole;
  readonly email: string;
  readonly phone: string | null;
  readonly isActive: boolean;
}

export interface AdminListingReadRepositoryDependencies {
  readonly loadLandlordProfiles?: (userIds: readonly number[]) => Promise<readonly AdminListingLandlordProfile[]>;
}

function mapExistenceRow(row: Readonly<ListingExistenceRow>): number {
  if (!Number.isInteger(row.id) || (row.id as number) < 1 || (row.id as number) > 2_147_483_647) {
    throw new Error("Listing existence row is invalid.");
  }
  return row.id as number;
}

function landlordIdFromRow(row: Readonly<AdminListingSummaryRow | AdminListingDetailRow>): number {
  if (!Number.isSafeInteger(row.landlord_id) || (row.landlord_id as number) < 1) {
    throw new RepositoryInvariantError("Admin listing landlord identity is invalid.");
  }
  return row.landlord_id as number;
}

export function createAdminListingReadRepository(
  executor: SqlExecutor,
  dependencies: AdminListingReadRepositoryDependencies = {}
): AdminListingReadRepository {
  const currentReasonRepository: CurrentModerationReasonRepository = createCurrentModerationReasonRepository(executor);
  return Object.freeze({
    async findListingPage(input: AdminListingPageInput): Promise<readonly AdminListingSummary[]> {
      if (dependencies.loadLandlordProfiles) {
        const rows = await queryMany<AdminListingSummaryRow, AdminListingSummaryRow>(
          executor,
          {
            text: `
              SELECT
                l.id,
                l.status,
                l.business_status,
                l.title,
                l.area_name,
                l.updated_at,
                l.landlord_id,
                (
                  SELECT COUNT(*)::integer
                  FROM listing_reports AS report
                  WHERE report.listing_id = l.id
                    AND report.status IN ('OPEN', 'INVESTIGATING')
                ) AS open_report_count,
                EXISTS (
                  SELECT 1
                  FROM listings AS duplicate
                  WHERE duplicate.landlord_id = l.landlord_id
                    AND duplicate.id <> l.id
                    AND BTRIM(COALESCE(duplicate.title, '')) <> ''
                    AND BTRIM(COALESCE(l.title, '')) <> ''
                    AND LOWER(BTRIM(duplicate.title)) = LOWER(BTRIM(l.title))
                ) AS possible_duplicate
              FROM listings AS l
              WHERE l.status = $1::listing_status
              ORDER BY
                l.updated_at DESC,
                l.id DESC
              LIMIT $2
              OFFSET $3
            `,
            values: [input.status, input.limit, input.offset]
          },
          (row) => row
        );
        const profiles = await dependencies.loadLandlordProfiles(rows.map(landlordIdFromRow));
        const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
        return Object.freeze(
          rows.map((row) => {
            const profile = profilesById.get(landlordIdFromRow(row));
            if (profile === undefined) {
              throw new RepositoryInvariantError("Admin listing landlord profile is missing.");
            }
            return mapAdminListingSummaryRow({
              ...row,
              landlord_email: profile.email,
              landlord_phone: profile.phone,
              landlord_is_active: profile.isActive
            });
          })
        );
      }

      return Object.freeze(
        await queryMany<AdminListingSummaryRow, AdminListingSummary>(
          executor,
          {
            text: `
              SELECT
                l.id,
                l.status,
                l.business_status,
                l.title,
                l.area_name,
                l.updated_at,
                landlord.id AS landlord_id,
                landlord.email AS landlord_email,
                landlord.phone_e164 AS landlord_phone,
                landlord.is_active AS landlord_is_active,
                (
                  SELECT COUNT(*)::integer
                  FROM listing_reports AS report
                  WHERE report.listing_id = l.id
                    AND report.status IN ('OPEN', 'INVESTIGATING')
                ) AS open_report_count,
                EXISTS (
                  SELECT 1
                  FROM listings AS duplicate
                  WHERE duplicate.landlord_id = l.landlord_id
                    AND duplicate.id <> l.id
                    AND BTRIM(COALESCE(duplicate.title, '')) <> ''
                    AND BTRIM(COALESCE(l.title, '')) <> ''
                    AND LOWER(BTRIM(duplicate.title)) = LOWER(BTRIM(l.title))
                ) AS possible_duplicate
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
      if (dependencies.loadLandlordProfiles) {
        const row = await queryOptional<AdminListingDetailRow, AdminListingDetailRow>(
          executor,
          {
            text: `
              SELECT
                l.id,
                l.status,
                l.business_status,
                l.title,
                l.description,
                l.monthly_rent,
                l.room_area_sqm,
                l.max_occupants,
                l.address_text,
                l.area_name,
                l.latitude,
                l.longitude,
                l.availability_confirmed_at,
                l.availability_reminder_sent_at,
                l.availability_reminder_notified_at,
                l.availability_auto_paused_at,
                l.created_at,
                l.updated_at,
                property_type.code AS property_type_code,
                property_type.label AS property_type_label,
                l.landlord_id
              FROM listings AS l
              LEFT JOIN property_types AS property_type
                ON property_type.id = l.property_type_id
              WHERE l.id = $1
              LIMIT 1
            `,
            values: [listingId]
          },
          (value) => value
        );
        if (row === null) return null;
        const profiles = await dependencies.loadLandlordProfiles([landlordIdFromRow(row)]);
        const profile = profiles.find((candidate) => candidate.id === landlordIdFromRow(row));
        if (profile === undefined) return null;
        return mapAdminListingDetailRow({
          ...row,
          landlord_role: profile.role,
          landlord_email: profile.email,
          landlord_phone: profile.phone,
          landlord_is_active: profile.isActive
        });
      }

      return queryOptional<AdminListingDetailRow, AdminListingDetailBase>(
        executor,
        {
          text: `
            SELECT
              l.id,
              l.status,
              l.business_status,
              l.title,
              l.description,
              l.monthly_rent,
              l.room_area_sqm,
              l.max_occupants,
              l.address_text,
              l.area_name,
              l.latitude,
              l.longitude,
              l.availability_confirmed_at,
              l.availability_reminder_sent_at,
              l.availability_reminder_notified_at,
              l.availability_auto_paused_at,
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
