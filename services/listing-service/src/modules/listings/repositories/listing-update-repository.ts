import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import {
  mapNullablePgScaleTwoNumeric,
  mapNullablePgWholeNumeric,
  mapPgTimestamptz
} from "../../../../../shared/src/runtime/db/value-mappers.js";
import { isListingStatus, type ListingStatus } from "../mappers/owner-listing-mapper.js";

const maximumSmallintId = 32_767;
const maximumListingId = 2_147_483_647;

interface LockedListingRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
  readonly property_type_id: unknown;
  readonly property_type_code: unknown;
  readonly property_type_label: unknown;
  readonly property_type_is_active: unknown;
  readonly title: unknown;
  readonly description: unknown;
  readonly monthly_rent: unknown;
  readonly room_area_sqm: unknown;
  readonly max_occupants: unknown;
  readonly address_text: unknown;
  readonly area_name: unknown;
  readonly latitude: unknown;
  readonly longitude: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface ControlledRow extends QueryResultRow {
  readonly id: unknown;
  readonly code: unknown;
  readonly label: unknown;
  readonly is_active: unknown;
}

export interface UpdateControlledValue {
  readonly id: number;
  readonly code: string;
  readonly label: string;
  readonly isActive: boolean;
}
export interface LockedOwnedListing {
  readonly id: number;
  readonly status: ListingStatus;
  readonly propertyType: UpdateControlledValue | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: number | null;
  readonly roomAreaSqm: number | null;
  readonly maxOccupants: number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
export interface UpdateListingContentRecord {
  readonly listingId: number;
  readonly landlordId: number;
  readonly expectedStatus: ListingStatus;
  readonly status: ListingStatus;
  readonly propertyTypeId: number | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: number | null;
  readonly roomAreaSqm: number | null;
  readonly maxOccupants: number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}
export interface ListingUpdateRepository {
  readonly lockOwnedListing: (listingId: number, landlordId: number) => Promise<LockedOwnedListing | null>;
  readonly findCurrentAmenities: (listingId: number) => Promise<readonly UpdateControlledValue[]>;
  readonly findActivePropertyTypeByCode: (code: string) => Promise<UpdateControlledValue | null>;
  readonly findAmenitiesByCodes: (codes: readonly string[]) => Promise<readonly UpdateControlledValue[]>;
  readonly updateListingContent: (record: UpdateListingContentRecord) => Promise<boolean>;
  readonly replaceAmenities: (listingId: number, amenityIds: readonly number[]) => Promise<void>;
}
export type ListingUpdateRepositoryFactory = (executor: SqlExecutor) => ListingUpdateRepository;

function controlled(row: Readonly<ControlledRow>): UpdateControlledValue {
  if (
    !Number.isInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumSmallintId ||
    typeof row.code !== "string" ||
    typeof row.label !== "string" ||
    typeof row.is_active !== "boolean"
  ) {
    throw new RepositoryInvariantError("Controlled listing value is invalid.");
  }
  return Object.freeze({ id: row.id as number, code: row.code, label: row.label, isActive: row.is_active });
}

function locked(row: Readonly<LockedListingRow>): LockedOwnedListing {
  if (
    !Number.isInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    !isListingStatus(row.status) ||
    (row.title !== null && typeof row.title !== "string") ||
    (row.description !== null && typeof row.description !== "string") ||
    (row.address_text !== null && typeof row.address_text !== "string") ||
    (row.area_name !== null && typeof row.area_name !== "string")
  ) {
    throw new RepositoryInvariantError("Locked listing row is invalid.");
  }
  const noProperty =
    row.property_type_id === null &&
    row.property_type_code === null &&
    row.property_type_label === null &&
    row.property_type_is_active === null;
  const propertyType = noProperty
    ? null
    : controlled({
        id: row.property_type_id,
        code: row.property_type_code,
        label: row.property_type_label,
        is_active: row.property_type_is_active
      });
  const latitude = row.latitude === null ? null : Number(row.latitude);
  const longitude = row.longitude === null ? null : Number(row.longitude);
  if (
    (latitude === null) !== (longitude === null) ||
    (latitude !== null && (!Number.isFinite(latitude) || !Number.isFinite(longitude)))
  ) {
    throw new RepositoryInvariantError("Locked listing coordinates are invalid.");
  }
  return Object.freeze({
    id: row.id as number,
    status: row.status,
    propertyType,
    title: row.title as string | null,
    description: row.description as string | null,
    monthlyRent: mapNullablePgWholeNumeric(row.monthly_rent, "monthly_rent"),
    roomAreaSqm: mapNullablePgScaleTwoNumeric(row.room_area_sqm, "room_area_sqm"),
    maxOccupants:
      row.max_occupants === null ||
      (Number.isInteger(row.max_occupants) && (row.max_occupants as number) >= 1 && (row.max_occupants as number) <= 20)
        ? (row.max_occupants as number | null)
        : (() => {
            throw new RepositoryInvariantError("Locked listing max occupants value is invalid.");
          })(),
    addressText: row.address_text as string | null,
    areaName: row.area_name as string | null,
    latitude,
    longitude,
    createdAt: mapPgTimestamptz(row.created_at, "created_at"),
    updatedAt: mapPgTimestamptz(row.updated_at, "updated_at")
  });
}

export function createListingUpdateRepository(executor: SqlExecutor): ListingUpdateRepository {
  return Object.freeze({
    lockOwnedListing(listingId: number, landlordId: number) {
      return queryOptional(
        executor,
        {
          text: `SELECT l.id, l.status, l.property_type_id, pt.code AS property_type_code, pt.label AS property_type_label, pt.is_active AS property_type_is_active, l.title, l.description, l.monthly_rent, l.room_area_sqm, l.max_occupants, l.address_text, l.area_name, l.latitude, l.longitude, l.created_at, l.updated_at FROM listings AS l LEFT JOIN property_types AS pt ON pt.id = l.property_type_id WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l`,
          values: [listingId, landlordId]
        },
        locked
      );
    },
    findCurrentAmenities(listingId: number) {
      return queryMany(
        executor,
        {
          text: `SELECT a.id, a.code, a.label, a.is_active FROM listing_amenities AS la JOIN amenities AS a ON a.id = la.amenity_id WHERE la.listing_id = $1 ORDER BY a.code ASC`,
          values: [listingId]
        },
        controlled
      );
    },
    findActivePropertyTypeByCode(code: string) {
      return queryOptional(
        executor,
        {
          text: `SELECT id, code, label, is_active FROM property_types WHERE code = $1 AND is_active = true LIMIT 1`,
          values: [code]
        },
        controlled
      );
    },
    findAmenitiesByCodes(codes: readonly string[]) {
      if (codes.length === 0) return Promise.resolve(Object.freeze([]));
      return queryMany(
        executor,
        {
          text: `SELECT id, code, label, is_active FROM amenities WHERE code = ANY($1::text[]) ORDER BY code ASC`,
          values: [[...codes]]
        },
        controlled
      );
    },
    async updateListingContent(record: UpdateListingContentRecord) {
      const count = await executeCommand(executor, {
        text: `UPDATE listings SET property_type_id = $4, status = $5, title = $6, description = $7, monthly_rent = $8, room_area_sqm = $9, max_occupants = $10, address_text = $11, area_name = $12, latitude = $13, longitude = $14, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND landlord_id = $2 AND status = $3::listing_status`,
        values: [
          record.listingId,
          record.landlordId,
          record.expectedStatus,
          record.propertyTypeId,
          record.status,
          record.title,
          record.description,
          record.monthlyRent,
          record.roomAreaSqm,
          record.maxOccupants,
          record.addressText,
          record.areaName,
          record.latitude,
          record.longitude
        ]
      });
      return count === 1;
    },
    async replaceAmenities(listingId: number, amenityIds: readonly number[]) {
      await executeCommand(executor, {
        text: `DELETE FROM listing_amenities WHERE listing_id = $1`,
        values: [listingId]
      });
      if (amenityIds.length === 0) return;
      const count = await executeCommand(executor, {
        text: `INSERT INTO listing_amenities (listing_id, amenity_id) SELECT $1, selected.amenity_id FROM UNNEST($2::smallint[]) AS selected(amenity_id)`,
        values: [listingId, [...amenityIds]]
      });
      if (count !== amenityIds.length)
        throw new RepositoryInvariantError("Listing amenity replacement did not affect the expected rows.");
    }
  });
}
