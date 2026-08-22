import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryOptional,
  RepositoryInvariantError
} from "../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../shared/src/runtime/db/sql-executor.js";
import {
  mapNullablePgScaleTwoNumeric,
  mapNullablePgWholeNumeric,
  mapPgTimestamptz
} from "../../../../shared/src/runtime/db/value-mappers.js";
import type { LookupValue } from "./lookup-mapper.js";
import { isListingStatus, type ListingStatus } from "./owner-listing-mapper.js";

const maximumListingId = 2_147_483_647;

interface LockedSubmissionRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
  readonly property_type_present: unknown;
  readonly property_type_known: unknown;
  readonly property_type_code: unknown;
  readonly property_type_label: unknown;
  readonly title: unknown;
  readonly description: unknown;
  readonly monthly_rent: unknown;
  readonly room_area_sqm: unknown;
  readonly address_text: unknown;
  readonly area_name: unknown;
  readonly latitude: unknown;
  readonly longitude: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface BooleanResultRow extends QueryResultRow {
  readonly result: unknown;
}

export interface LockedSubmissionListing {
  readonly id: number;
  readonly status: ListingStatus;
  readonly propertyTypePresent: boolean;
  readonly propertyTypeKnown: boolean;
  readonly propertyType: LookupValue | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: number | null;
  readonly roomAreaSqm: number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type SubmissionSourceStatus = "DRAFT" | "HIDDEN";

export interface ListingSubmitRepository {
  readonly lockOwnedListing: (listingId: number, landlordId: number) => Promise<LockedSubmissionListing | null>;
  readonly areAmenityReferencesKnown: (listingId: number) => Promise<boolean>;
  readonly hasPersistedImage: (listingId: number) => Promise<boolean>;
  readonly transitionToPending: (
    listingId: number,
    landlordId: number,
    expectedStatus: SubmissionSourceStatus
  ) => Promise<boolean>;
}

export type ListingSubmitRepositoryFactory = (executor: SqlExecutor) => ListingSubmitRepository;

function nullableCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  if (value === null) return null;
  const mapped = Number(value);
  if (!Number.isFinite(mapped) || mapped < minimum || mapped > maximum) {
    throw new RepositoryInvariantError("Locked listing coordinate is invalid.");
  }
  return mapped;
}

function lockedSubmission(row: Readonly<LockedSubmissionRow>): LockedSubmissionListing {
  if (
    !Number.isInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    !isListingStatus(row.status) ||
    typeof row.property_type_present !== "boolean" ||
    typeof row.property_type_known !== "boolean" ||
    (row.title !== null && typeof row.title !== "string") ||
    (row.description !== null && typeof row.description !== "string") ||
    (row.address_text !== null && typeof row.address_text !== "string") ||
    (row.area_name !== null && typeof row.area_name !== "string")
  ) {
    throw new RepositoryInvariantError("Locked submission listing row is invalid.");
  }

  const propertyType = row.property_type_known
    ? typeof row.property_type_code === "string" && typeof row.property_type_label === "string"
      ? Object.freeze({ code: row.property_type_code, label: row.property_type_label })
      : null
    : row.property_type_code === null && row.property_type_label === null
      ? null
      : undefined;
  if (
    propertyType === undefined ||
    (row.property_type_known && !row.property_type_present) ||
    (row.property_type_known && propertyType === null)
  ) {
    throw new RepositoryInvariantError("Locked submission property type projection is invalid.");
  }

  return Object.freeze({
    id: row.id as number,
    status: row.status,
    propertyTypePresent: row.property_type_present,
    propertyTypeKnown: row.property_type_known,
    propertyType,
    title: row.title as string | null,
    description: row.description as string | null,
    monthlyRent: mapNullablePgWholeNumeric(row.monthly_rent, "monthly_rent"),
    roomAreaSqm: mapNullablePgScaleTwoNumeric(row.room_area_sqm, "room_area_sqm"),
    addressText: row.address_text as string | null,
    areaName: row.area_name as string | null,
    latitude: nullableCoordinate(row.latitude, -90, 90),
    longitude: nullableCoordinate(row.longitude, -180, 180),
    createdAt: mapPgTimestamptz(row.created_at, "created_at"),
    updatedAt: mapPgTimestamptz(row.updated_at, "updated_at")
  });
}

function booleanResult(row: Readonly<BooleanResultRow>): boolean {
  if (typeof row.result !== "boolean") {
    throw new RepositoryInvariantError("Submission eligibility query returned an invalid result.");
  }
  return row.result;
}

export function createListingSubmitRepository(executor: SqlExecutor): ListingSubmitRepository {
  return Object.freeze({
    lockOwnedListing(listingId: number, landlordId: number) {
      return queryOptional(
        executor,
        {
          text: `SELECT l.id, l.status, l.property_type_id, l.title, l.description, l.monthly_rent, l.room_area_sqm, l.address_text, l.area_name, l.latitude, l.longitude, l.created_at, l.updated_at, (l.property_type_id IS NOT NULL) AS property_type_present, (pt.id IS NOT NULL) AS property_type_known, pt.code AS property_type_code, pt.label AS property_type_label FROM listings AS l LEFT JOIN property_types AS pt ON pt.id = l.property_type_id WHERE l.id = $1 AND l.landlord_id = $2 FOR UPDATE OF l`,
          values: [listingId, landlordId]
        },
        lockedSubmission
      );
    },
    areAmenityReferencesKnown(listingId: number) {
      return queryExactlyOne(
        executor,
        {
          text: `SELECT NOT EXISTS (SELECT 1 FROM listing_amenities AS la LEFT JOIN amenities AS a ON a.id = la.amenity_id WHERE la.listing_id = $1 AND a.id IS NULL) AS result`,
          values: [listingId]
        },
        booleanResult
      );
    },
    hasPersistedImage(listingId: number) {
      return queryExactlyOne(
        executor,
        {
          text: `SELECT EXISTS (SELECT 1 FROM listing_images WHERE listing_id = $1) AS result`,
          values: [listingId]
        },
        booleanResult
      );
    },
    async transitionToPending(listingId: number, landlordId: number, expectedStatus: SubmissionSourceStatus) {
      const affected = await executeCommand(executor, {
        text: `UPDATE listings SET status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND landlord_id = $2 AND status = $3::listing_status`,
        values: [listingId, landlordId, expectedStatus]
      });
      if (affected !== 0 && affected !== 1) {
        throw new RepositoryInvariantError("Submission transition affected an invalid number of rows.");
      }
      return affected === 1;
    }
  });
}
