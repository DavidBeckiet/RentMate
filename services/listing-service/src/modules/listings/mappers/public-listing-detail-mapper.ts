import type { QueryResultRow } from "pg";
import { RepositoryInvariantError } from "../../../../../shared/src/runtime/db/repository-primitives.js";
import {
  mapPgScaleTwoNumeric,
  mapPgTimestamptz,
  mapPgWholeNumeric
} from "../../../../../shared/src/runtime/db/value-mappers.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import { isListingBusinessStatus, type ListingBusinessStatus } from "../../../../../shared/listing-business-status.js";

const codePattern = /^[A-Z][A-Z0-9_]*$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9][0-9]{7,14}$/;

export interface PublicListingDetailRow extends QueryResultRow {
  readonly landlord_id?: unknown;
  readonly id: unknown;
  readonly business_status: unknown;
  readonly title: unknown;
  readonly description: unknown;
  readonly monthly_rent: unknown;
  readonly room_area_sqm: unknown;
  readonly max_occupants: unknown;
  readonly area_name: unknown;
  readonly latitude: unknown;
  readonly longitude: unknown;
  readonly property_type_code: unknown;
  readonly property_type_label: unknown;
  readonly amenities: unknown;
  readonly images: unknown;
  readonly has_reported?: unknown;
  readonly updated_at: unknown;
}

export interface TenantPublicListingDetailRow extends PublicListingDetailRow {
  readonly landlord_email: unknown;
  readonly landlord_phone: unknown;
}

export interface PublicDetailLookupValue {
  readonly code: string;
  readonly label: string;
}

export interface PublicDetailImage {
  readonly url: string;
  readonly altText: string | null;
  readonly displayOrder: number;
}

export interface LandlordContact {
  readonly email: string;
  readonly phone: string;
}

export interface PublicListingDetail {
  readonly id: number;
  readonly businessStatus: ListingBusinessStatus;
  readonly title: string;
  readonly description: string;
  readonly monthlyRent: number;
  readonly roomAreaSqm: number;
  readonly maxOccupants: number | null;
  readonly areaName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly propertyType: PublicDetailLookupValue;
  readonly amenities: readonly PublicDetailLookupValue[];
  readonly images: readonly PublicDetailImage[];
  readonly landlordVerified: boolean;
  readonly hasReported: boolean;
  readonly updatedAt: string;
}

export interface TenantPublicListingDetail extends PublicListingDetail {
  readonly landlordContact: LandlordContact;
}

export interface MappedPublicListingDetailResult {
  readonly detail: PublicListingDetail;
  readonly landlordContact: LandlordContact | null;
}

function invariant(): never {
  throw new RepositoryInvariantError("Public listing detail representation is invalid.");
}

function positiveInteger(value: unknown, maximum = 2_147_483_647): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) invariant();
  return value;
}

function nonblank(value: unknown, maximum?: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    (maximum !== undefined && value.length > maximum)
  ) {
    invariant();
  }
  return value;
}

function lookupValue(value: unknown): PublicDetailLookupValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invariant();
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || !codePattern.test(record.code)) invariant();
  return Object.freeze({ code: record.code, label: nonblank(record.label) });
}

function mapAmenities(value: unknown): readonly PublicDetailLookupValue[] {
  if (!Array.isArray(value)) invariant();
  const amenities = value.map(lookupValue);
  amenities.sort((left, right) => left.label.localeCompare(right.label) || left.code.localeCompare(right.code));
  return Object.freeze(amenities);
}

function mapImage(value: unknown): PublicDetailImage {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invariant();
  const record = value as Record<string, unknown>;
  const url = nonblank(record.url, 2_048);
  if (!url.startsWith("https://")) invariant();
  if (
    record.altText !== null &&
    (typeof record.altText !== "string" || record.altText.length === 0 || record.altText !== record.altText.trim())
  ) {
    invariant();
  }
  return Object.freeze({
    url,
    altText: record.altText as string | null,
    displayOrder: positiveInteger(record.displayOrder, 8)
  });
}

function mapImages(value: unknown): readonly PublicDetailImage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) invariant();
  const images = value.map(mapImage);
  const slots = new Set(images.map((image) => image.displayOrder));
  if (slots.size !== images.length) invariant();
  images.sort((left, right) => left.displayOrder - right.displayOrder);
  return Object.freeze(images);
}

function coordinate(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) invariant();
  return Math.round(value * 1_000) / 1_000;
}

function nullableMaxOccupants(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 20) invariant();
  return value as number;
}

function hasReported(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") invariant();
  return value;
}

function mapContact(emailValue: unknown, phoneValue: unknown): LandlordContact {
  const email = nonblank(emailValue, 320);
  const phone = nonblank(phoneValue, 16);
  if (email !== email.toLowerCase() || !emailPattern.test(email) || !phonePattern.test(phone)) invariant();
  return Object.freeze({ email, phone });
}

export function mapPublicListingDetailRow(row: Readonly<PublicListingDetailRow>): PublicListingDetail {
  if (!isListingBusinessStatus(row.business_status)) invariant();
  const monthlyRent = mapPgWholeNumeric(row.monthly_rent, "public_listing_detail.monthly_rent");
  const roomAreaSqm = mapPgScaleTwoNumeric(row.room_area_sqm, "public_listing_detail.room_area_sqm");
  if (monthlyRent <= 0 || monthlyRent > 999_999_999_999 || roomAreaSqm <= 0 || roomAreaSqm > 999_999.99) {
    invariant();
  }

  return Object.freeze({
    id: positiveInteger(row.id),
    businessStatus: row.business_status,
    title: nonblank(row.title, 160),
    description: nonblank(row.description, 5_000),
    monthlyRent,
    roomAreaSqm,
    maxOccupants: nullableMaxOccupants(row.max_occupants),
    areaName: nonblank(row.area_name, 120),
    latitude: coordinate(row.latitude, -90, 90),
    longitude: coordinate(row.longitude, -180, 180),
    propertyType: lookupValue({ code: row.property_type_code, label: row.property_type_label }),
    amenities: mapAmenities(row.amenities),
    images: mapImages(row.images),
    landlordVerified: false,
    hasReported: hasReported(row.has_reported),
    updatedAt: formatApiTimestamp(mapPgTimestamptz(row.updated_at, "public_listing_detail.updated_at"))
  });
}

export function mapBasePublicListingDetailResult(
  row: Readonly<PublicListingDetailRow>
): MappedPublicListingDetailResult {
  return Object.freeze({ detail: mapPublicListingDetailRow(row), landlordContact: null });
}

export function mapTenantPublicListingDetailResult(
  row: Readonly<TenantPublicListingDetailRow>
): MappedPublicListingDetailResult {
  return Object.freeze({
    detail: mapPublicListingDetailRow(row),
    landlordContact: mapContact(row.landlord_email, row.landlord_phone)
  });
}

export function enrichPublicListingDetail(
  detail: Readonly<PublicListingDetail>,
  landlordContact: Readonly<LandlordContact>
): TenantPublicListingDetail {
  const contact = mapContact(landlordContact.email, landlordContact.phone);
  return Object.freeze({
    id: detail.id,
    businessStatus: detail.businessStatus,
    title: detail.title,
    description: detail.description,
    monthlyRent: detail.monthlyRent,
    roomAreaSqm: detail.roomAreaSqm,
    maxOccupants: detail.maxOccupants,
    areaName: detail.areaName,
    latitude: detail.latitude,
    longitude: detail.longitude,
    propertyType: detail.propertyType,
    amenities: detail.amenities,
    images: detail.images,
    landlordVerified: detail.landlordVerified,
    hasReported: detail.hasReported,
    updatedAt: detail.updatedAt,
    landlordContact: contact
  });
}
