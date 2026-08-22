import type { QueryResultRow } from "pg";
import {
  mapNullablePgScaleTwoNumeric,
  mapNullablePgWholeNumeric,
  mapPgTimestamptz
} from "../../../../shared/src/runtime/db/value-mappers.js";
import { formatApiTimestamp } from "../../../../shared/src/runtime/shared/mapping/api-values.js";
import { resolveCurrentModerationReason } from "./current-moderation-reason.js";
import { copyOwnerImage, mapOwnerImageToDto, type OwnerImage, type OwnerImageDto } from "./owner-image-mapper.js";
import {
  mapAmenityToDto,
  mapLookupValueRow,
  mapPropertyTypeToDto,
  type AmenityDto,
  type LookupValue,
  type PropertyTypeDto
} from "./lookup-mapper.js";

const maximumListingId = 2_147_483_647;

export const listingStatuses = Object.freeze([
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "HIDDEN",
  "INACTIVE"
] as const);

export type ListingStatus = (typeof listingStatuses)[number];

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

export interface PersistedOwnerListingRow extends CreatedListingRow {
  readonly property_type_code: unknown;
  readonly property_type_label: unknown;
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

export interface OwnerListingDetailBase {
  readonly id: number;
  readonly status: ListingStatus;
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: number | null;
  readonly roomAreaSqm: number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly propertyType: LookupValue | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OwnerListingDetail extends OwnerListingDetailBase {
  readonly amenities: readonly LookupValue[];
  readonly images: readonly OwnerImage[];
  readonly currentModerationReason: string | null;
}

export interface OwnerListingDetailDto {
  readonly id: number;
  readonly status: ListingStatus;
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
  readonly images: readonly OwnerImageDto[];
  readonly currentModerationReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type OwnerListing = OwnerListingDetail;
export type OwnerListingDto = OwnerListingDetailDto;

export class OwnerListingMappingError extends Error {
  constructor() {
    super("Owner listing representation is invalid.");
    this.name = "OwnerListingMappingError";
  }
}

export function isListingStatus(value: unknown): value is ListingStatus {
  return typeof value === "string" && listingStatuses.some((status) => status === value);
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

function compareImages(left: Readonly<OwnerImage>, right: Readonly<OwnerImage>): number {
  return left.displayOrder - right.displayOrder || left.id - right.id;
}

function mapPropertyType(code: unknown, label: unknown): LookupValue | null {
  if (code === null && label === null) {
    return null;
  }
  if (code === null || label === null) {
    throw new OwnerListingMappingError();
  }
  return mapLookupValueRow({ code, label });
}

function mapBaseListingRow(
  row: Readonly<CreatedListingRow>,
  expectedStatus?: "DRAFT"
): Omit<OwnerListingDetailBase, "propertyType"> {
  if (
    !Number.isInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    !isListingStatus(row.status) ||
    (expectedStatus !== undefined && row.status !== expectedStatus) ||
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
      status: row.status,
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

export function mapCreatedListingRow(row: Readonly<CreatedListingRow>): CreatedListing {
  const mapped = mapBaseListingRow(row, "DRAFT");
  return Object.freeze({
    id: mapped.id,
    status: "DRAFT",
    title: mapped.title,
    description: mapped.description,
    monthlyRent: mapped.monthlyRent,
    roomAreaSqm: mapped.roomAreaSqm,
    addressText: mapped.addressText,
    areaName: mapped.areaName,
    latitude: mapped.latitude,
    longitude: mapped.longitude,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt
  });
}

export function mapPersistedOwnerListingRow(row: Readonly<PersistedOwnerListingRow>): OwnerListingDetailBase {
  try {
    const mapped = mapBaseListingRow(row);
    return Object.freeze({
      id: mapped.id,
      status: mapped.status,
      title: mapped.title,
      description: mapped.description,
      monthlyRent: mapped.monthlyRent,
      roomAreaSqm: mapped.roomAreaSqm,
      addressText: mapped.addressText,
      areaName: mapped.areaName,
      latitude: mapped.latitude,
      longitude: mapped.longitude,
      propertyType: mapPropertyType(row.property_type_code, row.property_type_label),
      createdAt: mapped.createdAt,
      updatedAt: mapped.updatedAt
    });
  } catch {
    throw new OwnerListingMappingError();
  }
}

export function createOwnerListingDetail(
  listing: Readonly<OwnerListingDetailBase>,
  amenities: readonly Readonly<LookupValue>[],
  images: readonly Readonly<OwnerImage>[],
  currentModerationReason: unknown
): OwnerListingDetail {
  try {
    const mappedAmenities = Object.freeze(amenities.map(copyLookup).sort(compareLookups));
    const mappedImages = Object.freeze(images.map(copyOwnerImage).sort(compareImages));
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
      propertyType: listing.propertyType === null ? null : copyLookup(listing.propertyType),
      amenities: mappedAmenities,
      images: mappedImages,
      currentModerationReason: resolveCurrentModerationReason(listing.status, currentModerationReason),
      createdAt: new Date(listing.createdAt.getTime()),
      updatedAt: new Date(listing.updatedAt.getTime())
    });
  } catch {
    throw new OwnerListingMappingError();
  }
}

export function createOwnerListing(
  listing: Readonly<CreatedListing>,
  propertyType: Readonly<LookupValue> | null,
  amenities: readonly Readonly<LookupValue>[]
): OwnerListingDetail {
  const base: OwnerListingDetailBase = Object.freeze({
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
    propertyType,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt
  });
  return createOwnerListingDetail(base, amenities, [], null);
}

export function mapOwnerListingToDto(listing: Readonly<OwnerListingDetail>): OwnerListingDetailDto {
  try {
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
      propertyType: listing.propertyType === null ? null : mapPropertyTypeToDto(listing.propertyType),
      amenities: Object.freeze(listing.amenities.map(mapAmenityToDto)),
      images: Object.freeze(listing.images.map(mapOwnerImageToDto)),
      currentModerationReason: resolveCurrentModerationReason(listing.status, listing.currentModerationReason),
      createdAt: formatApiTimestamp(listing.createdAt),
      updatedAt: formatApiTimestamp(listing.updatedAt)
    });
  } catch {
    throw new OwnerListingMappingError();
  }
}
