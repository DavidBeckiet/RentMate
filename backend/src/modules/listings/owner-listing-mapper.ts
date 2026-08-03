import type { QueryResultRow } from "pg";
import { mapNullablePgScaleTwoNumeric, mapNullablePgWholeNumeric, mapPgTimestamptz } from "../../db/value-mappers.js";
import { formatApiTimestamp } from "../../shared/mapping/api-values.js";
import {
  mapAmenityToDto,
  mapPropertyTypeToDto,
  type AmenityDto,
  type LookupValue,
  type PropertyTypeDto
} from "./lookup-mapper.js";

const maximumListingId = 2_147_483_647;
const emptyImages: readonly never[] = Object.freeze([]);

export interface CreatedListingRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
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

export interface CreatedListing {
  readonly id: number;
  readonly status: "DRAFT";
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

export interface OwnerListing extends CreatedListing {
  readonly propertyType: LookupValue | null;
  readonly amenities: readonly LookupValue[];
  readonly images: readonly never[];
  readonly currentModerationReason: null;
}

export interface OwnerListingDto {
  readonly id: number;
  readonly status: "DRAFT";
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: number | null;
  readonly roomAreaSqm: number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly propertyType: PropertyTypeDto | null;
  readonly amenities: readonly AmenityDto[];
  readonly images: readonly never[];
  readonly currentModerationReason: null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class OwnerListingMappingError extends Error {
  constructor() {
    super("Owner listing representation is invalid.");
    this.name = "OwnerListingMappingError";
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function mapCoordinatePair(
  latitudeValue: unknown,
  longitudeValue: unknown
): Readonly<{ latitude: number | null; longitude: number | null }> {
  if (latitudeValue === null && longitudeValue === null) {
    return Object.freeze({ latitude: null, longitude: null });
  }

  if (
    typeof latitudeValue !== "number" ||
    !Number.isFinite(latitudeValue) ||
    latitudeValue < -90 ||
    latitudeValue > 90 ||
    typeof longitudeValue !== "number" ||
    !Number.isFinite(longitudeValue) ||
    longitudeValue < -180 ||
    longitudeValue > 180
  ) {
    throw new OwnerListingMappingError();
  }

  return Object.freeze({ latitude: latitudeValue, longitude: longitudeValue });
}

function copyLookup(value: Readonly<LookupValue>): LookupValue {
  return Object.freeze({ code: value.code, label: value.label });
}

function compareLookups(left: Readonly<LookupValue>, right: Readonly<LookupValue>): number {
  return left.label.localeCompare(right.label) || left.code.localeCompare(right.code);
}

export function mapCreatedListingRow(row: Readonly<CreatedListingRow>): CreatedListing {
  if (
    !Number.isInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    row.status !== "DRAFT" ||
    !isNullableString(row.title) ||
    !isNullableString(row.description) ||
    !isNullableString(row.address_text) ||
    !isNullableString(row.area_name)
  ) {
    throw new OwnerListingMappingError();
  }

  try {
    const coordinates = mapCoordinatePair(row.latitude, row.longitude);
    return Object.freeze({
      id: row.id as number,
      status: "DRAFT",
      title: row.title,
      description: row.description,
      monthlyRent: mapNullablePgWholeNumeric(row.monthly_rent, "monthly_rent"),
      roomAreaSqm: mapNullablePgScaleTwoNumeric(row.room_area_sqm, "room_area_sqm"),
      addressText: row.address_text,
      areaName: row.area_name,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      createdAt: mapPgTimestamptz(row.created_at, "created_at"),
      updatedAt: mapPgTimestamptz(row.updated_at, "updated_at")
    });
  } catch (error) {
    if (error instanceof OwnerListingMappingError) {
      throw error;
    }

    throw new OwnerListingMappingError();
  }
}

export function createOwnerListing(
  listing: Readonly<CreatedListing>,
  propertyType: Readonly<LookupValue> | null,
  amenities: readonly Readonly<LookupValue>[]
): OwnerListing {
  try {
    const mappedPropertyType = propertyType === null ? null : copyLookup(mapPropertyTypeToDto(propertyType));
    const mappedAmenities = Object.freeze(
      amenities.map((amenity) => copyLookup(mapAmenityToDto(amenity))).sort(compareLookups)
    );

    return Object.freeze({
      id: listing.id,
      status: listing.status,
      title: listing.title,
      description: listing.description,
      monthlyRent: listing.monthlyRent,
      roomAreaSqm: listing.roomAreaSqm,
      addressText: listing.addressText,
      areaName: listing.areaName,
      latitude: listing.latitude,
      longitude: listing.longitude,
      propertyType: mappedPropertyType,
      amenities: mappedAmenities,
      images: emptyImages,
      currentModerationReason: null,
      createdAt: new Date(listing.createdAt.getTime()),
      updatedAt: new Date(listing.updatedAt.getTime())
    });
  } catch {
    throw new OwnerListingMappingError();
  }
}

export function mapOwnerListingToDto(listing: Readonly<OwnerListing>): OwnerListingDto {
  if (listing.status !== "DRAFT" || listing.images.length !== 0 || listing.currentModerationReason !== null) {
    throw new OwnerListingMappingError();
  }

  try {
    return Object.freeze({
      id: listing.id,
      status: "DRAFT",
      title: listing.title,
      description: listing.description,
      monthlyRent: listing.monthlyRent,
      roomAreaSqm: listing.roomAreaSqm,
      addressText: listing.addressText,
      areaName: listing.areaName,
      latitude: listing.latitude,
      longitude: listing.longitude,
      propertyType: listing.propertyType === null ? null : mapPropertyTypeToDto(listing.propertyType),
      amenities: Object.freeze(listing.amenities.map(mapAmenityToDto)),
      images: emptyImages,
      currentModerationReason: null,
      createdAt: formatApiTimestamp(listing.createdAt),
      updatedAt: formatApiTimestamp(listing.updatedAt)
    });
  } catch {
    throw new OwnerListingMappingError();
  }
}
