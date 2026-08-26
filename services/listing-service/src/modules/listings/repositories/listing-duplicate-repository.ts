import type { QueryResultRow } from "pg";
import { queryMany, queryOptional } from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { mapLookupValueRow, type LookupValue } from "../mappers/lookup-mapper.js";
import {
  mapPersistedOwnerListingRow,
  type OwnerListingDetailBase,
  type PersistedOwnerListingRow
} from "../mappers/owner-listing-mapper.js";
import {
  createListingCreateRepository,
  type InsertListingDraftRecord,
  type ListingCreateRepository,
  type ListingCreateRepositoryFactory,
  type ResolvedControlledLookup
} from "./listing-create-repository.js";

const maximumSmallintId = 32_767;

interface DuplicableListingRow extends PersistedOwnerListingRow, QueryResultRow {
  readonly property_type_id: unknown;
}

interface DuplicableAmenityRow extends QueryResultRow {
  readonly id: unknown;
  readonly code: unknown;
  readonly label: unknown;
}

export interface DuplicableListingSource {
  readonly content: Omit<InsertListingDraftRecord, "landlordId">;
  readonly propertyType: LookupValue | null;
  readonly amenities: readonly ResolvedControlledLookup[];
}

export interface ListingDuplicateSourceRepository {
  readonly findOwnedSource: (listingId: number, landlordId: number) => Promise<DuplicableListingSource | null>;
}

export type ListingDuplicateSourceRepositoryFactory = (executor: SqlExecutor) => ListingDuplicateSourceRepository;

function nullableSmallint(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > maximumSmallintId) {
    throw new Error("Listing property type representation is invalid.");
  }
  return value as number;
}

function mapSourceRow(row: Readonly<DuplicableListingRow>): DuplicableListingSource {
  const listing: OwnerListingDetailBase = mapPersistedOwnerListingRow(row);
  const propertyTypeId = nullableSmallint(row.property_type_id);
  if ((propertyTypeId === null) !== (listing.propertyType === null)) {
    throw new Error("Listing property type representation is invalid.");
  }

  return Object.freeze({
    content: Object.freeze({
      title: listing.title,
      description: listing.description,
      monthlyRent: listing.monthlyRent,
      roomAreaSqm: listing.roomAreaSqm,
      maxOccupants: listing.maxOccupants,
      addressText: listing.addressText,
      areaName: listing.areaName,
      latitude: listing.latitude,
      longitude: listing.longitude,
      propertyTypeId
    }),
    propertyType: listing.propertyType,
    amenities: Object.freeze([])
  });
}

function mapAmenityRow(row: Readonly<DuplicableAmenityRow>): ResolvedControlledLookup {
  const id = nullableSmallint(row.id);
  if (id === null) throw new Error("Listing amenity representation is invalid.");
  const lookup = mapLookupValueRow(row);
  return Object.freeze({ id, code: lookup.code, label: lookup.label });
}

export function createListingDuplicateSourceRepository(executor: SqlExecutor): ListingDuplicateSourceRepository {
  return Object.freeze({
    async findOwnedSource(listingId: number, landlordId: number): Promise<DuplicableListingSource | null> {
      const source = await queryOptional<DuplicableListingRow, DuplicableListingSource>(
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
              l.property_type_id,
              pt.code AS property_type_code,
              pt.label AS property_type_label
            FROM listings AS l
            LEFT JOIN property_types AS pt
              ON pt.id = l.property_type_id
            WHERE l.id = $1
              AND l.landlord_id = $2
            LIMIT 1
            FOR SHARE OF l
          `,
          values: [listingId, landlordId]
        },
        mapSourceRow
      );
      if (source === null) return null;

      const amenities = await queryMany<DuplicableAmenityRow, ResolvedControlledLookup>(
        executor,
        {
          text: `
            SELECT
              a.id,
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
        mapAmenityRow
      );

      return Object.freeze({ ...source, amenities: Object.freeze(amenities) });
    }
  });
}

export interface ListingDuplicateRepositories {
  readonly source: ListingDuplicateSourceRepository;
  readonly create: ListingCreateRepository;
}

export function createListingDuplicateRepositories(
  executor: SqlExecutor,
  sourceFactory: ListingDuplicateSourceRepositoryFactory = createListingDuplicateSourceRepository,
  createFactory: ListingCreateRepositoryFactory = createListingCreateRepository
): ListingDuplicateRepositories {
  return Object.freeze({ source: sourceFactory(executor), create: createFactory(executor) });
}
