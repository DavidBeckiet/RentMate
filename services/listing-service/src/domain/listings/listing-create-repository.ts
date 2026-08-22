import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../shared/src/runtime/db/sql-executor.js";
import { mapLookupValueRow, type LookupValue, type LookupValueRow } from "./lookup-mapper.js";
import { mapCreatedListingRow, type CreatedListing, type CreatedListingRow } from "./owner-listing-mapper.js";

const maximumSmallintId = 32_767;

interface ControlledLookupRow extends LookupValueRow, QueryResultRow {
  readonly id: unknown;
}

export interface ResolvedControlledLookup extends LookupValue {
  readonly id: number;
}

export interface InsertListingDraftRecord {
  readonly landlordId: number;
  readonly propertyTypeId: number | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: number | null;
  readonly roomAreaSqm: number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface ListingCreateRepository {
  readonly findActivePropertyTypeByCode: (code: string) => Promise<ResolvedControlledLookup | null>;
  readonly findActiveAmenitiesByCodes: (codes: readonly string[]) => Promise<readonly ResolvedControlledLookup[]>;
  readonly insertDraft: (record: InsertListingDraftRecord) => Promise<CreatedListing>;
  readonly insertListingAmenities: (listingId: number, amenityIds: readonly number[]) => Promise<void>;
}

export type ListingCreateRepositoryFactory = (executor: SqlExecutor) => ListingCreateRepository;

function mapControlledLookupRow(row: Readonly<ControlledLookupRow>): ResolvedControlledLookup {
  if (!Number.isInteger(row.id) || (row.id as number) < 1 || (row.id as number) > maximumSmallintId) {
    throw new RepositoryInvariantError("Controlled lookup row has an invalid identifier.");
  }

  const lookup = mapLookupValueRow(row);
  return Object.freeze({ id: row.id as number, code: lookup.code, label: lookup.label });
}

export function createListingCreateRepository(executor: SqlExecutor): ListingCreateRepository {
  return Object.freeze({
    async findActivePropertyTypeByCode(code: string): Promise<ResolvedControlledLookup | null> {
      return queryOptional<ControlledLookupRow, ResolvedControlledLookup>(
        executor,
        {
          text: `
            SELECT
              id,
              code,
              label
            FROM property_types
            WHERE code = $1
              AND is_active = true
            LIMIT 1
          `,
          values: [code]
        },
        mapControlledLookupRow
      );
    },

    async findActiveAmenitiesByCodes(codes: readonly string[]): Promise<readonly ResolvedControlledLookup[]> {
      if (codes.length === 0) {
        return Object.freeze([]);
      }

      return Object.freeze(
        await queryMany<ControlledLookupRow, ResolvedControlledLookup>(
          executor,
          {
            text: `
              SELECT
                id,
                code,
                label
              FROM amenities
              WHERE code = ANY($1::text[])
                AND is_active = true
              ORDER BY
                label ASC,
                code ASC
            `,
            values: [[...codes]]
          },
          mapControlledLookupRow
        )
      );
    },

    async insertDraft(record: InsertListingDraftRecord): Promise<CreatedListing> {
      return queryExactlyOne<CreatedListingRow, CreatedListing>(
        executor,
        {
          text: `
            INSERT INTO listings (
              landlord_id,
              property_type_id,
              status,
              title,
              description,
              monthly_rent,
              room_area_sqm,
              address_text,
              area_name,
              latitude,
              longitude
            )
            VALUES ($1, $2, 'DRAFT', $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING
              id,
              status,
              title,
              description,
              monthly_rent,
              room_area_sqm,
              address_text,
              area_name,
              latitude,
              longitude,
              created_at,
              updated_at
          `,
          values: [
            record.landlordId,
            record.propertyTypeId,
            record.title,
            record.description,
            record.monthlyRent,
            record.roomAreaSqm,
            record.addressText,
            record.areaName,
            record.latitude,
            record.longitude
          ]
        },
        mapCreatedListingRow
      );
    },

    async insertListingAmenities(listingId: number, amenityIds: readonly number[]): Promise<void> {
      if (amenityIds.length === 0) {
        return;
      }

      const inserted = await executeCommand(executor, {
        text: `
          INSERT INTO listing_amenities (
            listing_id,
            amenity_id
          )
          SELECT
            $1,
            selected.amenity_id
          FROM UNNEST($2::smallint[]) AS selected(amenity_id)
        `,
        values: [listingId, [...amenityIds]]
      });

      if (inserted !== amenityIds.length) {
        throw new RepositoryInvariantError("Listing amenity insertion did not affect the expected rows.");
      }
    }
  });
}
