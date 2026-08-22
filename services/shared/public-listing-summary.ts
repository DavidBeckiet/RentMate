import type { QueryResultRow } from "pg";
import { RepositoryInvariantError } from "./src/runtime/db/repository-primitives.js";
import { mapPgScaleTwoNumeric, mapPgTimestamptz, mapPgWholeNumeric } from "./src/runtime/db/value-mappers.js";
import { formatApiTimestamp } from "./src/runtime/shared/mapping/api-values.js";

const codePattern = /^[A-Z][A-Z0-9_]*$/;

export interface PublicListingSummaryRow extends QueryResultRow {
  readonly id: unknown;
  readonly title: unknown;
  readonly monthly_rent: unknown;
  readonly room_area_sqm: unknown;
  readonly area_name: unknown;
  readonly latitude: unknown;
  readonly longitude: unknown;
  readonly property_type_code: unknown;
  readonly property_type_label: unknown;
  readonly amenities: unknown;
  readonly cover_image_url: unknown;
  readonly cover_image_alt_text: unknown;
  readonly cover_image_display_order: unknown;
  readonly updated_at: unknown;
}

export interface PublicRadiusListingSummaryRow extends PublicListingSummaryRow {
  readonly distance_km: unknown;
}

export interface PublicLookupValue {
  readonly code: string;
  readonly label: string;
}

export interface PublicCoverImage {
  readonly url: string;
  readonly altText: string | null;
  readonly displayOrder: number;
}

export interface PublicListingSummary {
  readonly id: number;
  readonly title: string;
  readonly monthlyRent: number;
  readonly roomAreaSqm: number;
  readonly areaName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly propertyType: PublicLookupValue;
  readonly amenities: readonly PublicLookupValue[];
  readonly coverImage: PublicCoverImage;
  readonly updatedAt: string;
}

export type PublicRadiusListingSummary = PublicListingSummary & {
  readonly distanceKm: number;
};

function invariant(): never {
  throw new RepositoryInvariantError("Public listing summary representation is invalid.");
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invariant();
  return value;
}

function nonblank(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) invariant();
  return value;
}

function lookupValue(value: unknown): PublicLookupValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invariant();
  const record = value as Record<string, unknown>;
  const code = record.code;
  const label = record.label;
  if (typeof code !== "string" || !codePattern.test(code)) invariant();
  return Object.freeze({ code, label: nonblank(label) });
}

function mapAmenities(value: unknown): readonly PublicLookupValue[] {
  if (!Array.isArray(value)) invariant();
  const items = value.map(lookupValue);
  items.sort((left, right) => {
    if (left.label < right.label) return -1;
    if (left.label > right.label) return 1;
    return left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
  });
  return Object.freeze(items);
}

function coordinate(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) invariant();
  return Math.round(value * 1_000) / 1_000;
}

function distance(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invariant();
  return value;
}

export function mapPublicListingSummaryRow(row: Readonly<PublicListingSummaryRow>): PublicListingSummary {
  const monthlyRent = mapPgWholeNumeric(row.monthly_rent, "public_listing.monthly_rent");
  const roomAreaSqm = mapPgScaleTwoNumeric(row.room_area_sqm, "public_listing.room_area_sqm");
  if (monthlyRent <= 0 || monthlyRent > 999_999_999_999 || roomAreaSqm <= 0 || roomAreaSqm > 999_999.99) invariant();
  if (typeof row.cover_image_url !== "string" || row.cover_image_url.length === 0) invariant();
  if (row.cover_image_alt_text !== null && typeof row.cover_image_alt_text !== "string") invariant();

  return Object.freeze({
    id: positiveInteger(row.id),
    title: nonblank(row.title),
    monthlyRent,
    roomAreaSqm,
    areaName: nonblank(row.area_name),
    latitude: coordinate(row.latitude, -90, 90),
    longitude: coordinate(row.longitude, -180, 180),
    propertyType: lookupValue({ code: row.property_type_code, label: row.property_type_label }),
    amenities: mapAmenities(row.amenities),
    coverImage: Object.freeze({
      url: row.cover_image_url,
      altText: row.cover_image_alt_text,
      displayOrder: positiveInteger(row.cover_image_display_order)
    }),
    updatedAt: formatApiTimestamp(mapPgTimestamptz(row.updated_at, "public_listing.updated_at"))
  });
}

export function mapPublicRadiusListingSummaryRow(
  row: Readonly<PublicRadiusListingSummaryRow>
): PublicRadiusListingSummary {
  return Object.freeze({
    ...mapPublicListingSummaryRow(row),
    distanceKm: distance(row.distance_km)
  });
}
