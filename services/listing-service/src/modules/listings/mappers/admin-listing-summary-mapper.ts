import type { QueryResultRow } from "pg";
import { mapPgTimestamptz } from "../../../../../shared/src/runtime/db/value-mappers.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import { isListingStatus, type ListingStatus } from "./owner-listing-mapper.js";

const maximumIntegerId = 2_147_483_647;
const e164Pattern = /^\+[1-9][0-9]{7,14}$/;

export interface AdminListingSummaryRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
  readonly title: unknown;
  readonly area_name: unknown;
  readonly landlord_id: unknown;
  readonly landlord_email: unknown;
  readonly landlord_phone: unknown;
  readonly landlord_is_active: unknown;
  readonly updated_at: unknown;
}

export interface AdminListingSummaryLandlord {
  readonly id: number;
  readonly email: string;
  readonly phone: string;
  readonly isActive: boolean;
}

export interface AdminListingSummary {
  readonly id: number;
  readonly status: ListingStatus;
  readonly title: string | null;
  readonly areaName: string | null;
  readonly landlord: AdminListingSummaryLandlord;
  readonly updatedAt: Date;
}

export interface AdminListingSummaryDto {
  readonly id: number;
  readonly status: ListingStatus;
  readonly title: string | null;
  readonly areaName: string | null;
  readonly landlord: AdminListingSummaryLandlord;
  readonly updatedAt: string;
}

export class AdminListingSummaryMappingError extends Error {
  constructor() {
    super("Admin listing summary representation is invalid.");
    this.name = "AdminListingSummaryMappingError";
  }
}

function isPositiveIntegerId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= maximumIntegerId;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNormalizedEmail(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim().toLowerCase();
}

function isLandlordPhone(value: unknown): value is string {
  return typeof value === "string" && e164Pattern.test(value);
}

function copyLandlord(landlord: Readonly<AdminListingSummaryLandlord>): AdminListingSummaryLandlord {
  if (
    !isPositiveIntegerId(landlord.id) ||
    !isNormalizedEmail(landlord.email) ||
    !isLandlordPhone(landlord.phone) ||
    typeof landlord.isActive !== "boolean"
  ) {
    throw new AdminListingSummaryMappingError();
  }
  return Object.freeze({ ...landlord });
}

export function mapAdminListingSummaryRow(row: Readonly<AdminListingSummaryRow>): AdminListingSummary {
  if (
    !isPositiveIntegerId(row.id) ||
    !isListingStatus(row.status) ||
    !isNullableString(row.title) ||
    !isNullableString(row.area_name) ||
    !isPositiveIntegerId(row.landlord_id) ||
    !isNormalizedEmail(row.landlord_email) ||
    !isLandlordPhone(row.landlord_phone) ||
    typeof row.landlord_is_active !== "boolean"
  ) {
    throw new AdminListingSummaryMappingError();
  }

  try {
    return Object.freeze({
      id: row.id,
      status: row.status,
      title: row.title,
      areaName: row.area_name,
      landlord: Object.freeze({
        id: row.landlord_id,
        email: row.landlord_email,
        phone: row.landlord_phone,
        isActive: row.landlord_is_active
      }),
      updatedAt: mapPgTimestamptz(row.updated_at, "updated_at")
    });
  } catch {
    throw new AdminListingSummaryMappingError();
  }
}

export function mapAdminListingSummaryToDto(summary: Readonly<AdminListingSummary>): AdminListingSummaryDto {
  if (
    !isPositiveIntegerId(summary.id) ||
    !isListingStatus(summary.status) ||
    !isNullableString(summary.title) ||
    !isNullableString(summary.areaName)
  ) {
    throw new AdminListingSummaryMappingError();
  }
  try {
    return Object.freeze({
      id: summary.id,
      status: summary.status,
      title: summary.title,
      areaName: summary.areaName,
      landlord: copyLandlord(summary.landlord),
      updatedAt: formatApiTimestamp(summary.updatedAt)
    });
  } catch {
    throw new AdminListingSummaryMappingError();
  }
}
