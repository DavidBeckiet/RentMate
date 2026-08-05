import type { QueryResultRow } from "pg";
import { mapNullablePgWholeNumeric, mapPgTimestamptz } from "../../db/value-mappers.js";
import { formatApiTimestamp } from "../../shared/mapping/api-values.js";
import { resolveCurrentModerationReason } from "./current-moderation-reason.js";
import { mapOwnerImageRow, mapOwnerImageToDto, type OwnerImage, type OwnerImageDto } from "./owner-image-mapper.js";
import { mapLookupValueRow, mapPropertyTypeToDto, type LookupValue, type PropertyTypeDto } from "./lookup-mapper.js";
import { isListingStatus, type ListingStatus } from "./owner-listing-mapper.js";

const maximumListingId = 2_147_483_647;

export interface OwnerListingSummaryRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
  readonly title: unknown;
  readonly monthly_rent: unknown;
  readonly area_name: unknown;
  readonly updated_at: unknown;
  readonly property_type_code: unknown;
  readonly property_type_label: unknown;
  readonly cover_image_id: unknown;
  readonly cover_image_url: unknown;
  readonly cover_image_format: unknown;
  readonly cover_image_width: unknown;
  readonly cover_image_height: unknown;
  readonly cover_image_byte_size: unknown;
  readonly cover_image_display_order: unknown;
  readonly cover_image_alt_text: unknown;
  readonly cover_image_created_at: unknown;
  readonly current_moderation_reason: unknown;
}

export interface OwnerListingSummary {
  readonly id: number;
  readonly status: ListingStatus;
  readonly title: string | null;
  readonly monthlyRent: number | null;
  readonly areaName: string | null;
  readonly propertyType: LookupValue | null;
  readonly coverImage: OwnerImage | null;
  readonly currentModerationReason: string | null;
  readonly updatedAt: Date;
}

export interface OwnerListingSummaryDto {
  readonly id: number;
  readonly status: ListingStatus;
  readonly title: string | null;
  readonly monthlyRent: number | null;
  readonly areaName: string | null;
  readonly propertyType: PropertyTypeDto | null;
  readonly coverImage: OwnerImageDto | null;
  readonly currentModerationReason: string | null;
  readonly updatedAt: string;
}

export class OwnerListingSummaryMappingError extends Error {
  constructor() {
    super("Owner listing summary representation is invalid.");
    this.name = "OwnerListingSummaryMappingError";
  }
}

function mapPropertyType(code: unknown, label: unknown): LookupValue | null {
  if (code === null && label === null) {
    return null;
  }
  if (code === null || label === null) {
    throw new OwnerListingSummaryMappingError();
  }
  return mapLookupValueRow({ code, label });
}

function mapCoverImage(row: Readonly<OwnerListingSummaryRow>): OwnerImage | null {
  if (row.cover_image_id === null) {
    const absentValues = [
      row.cover_image_url,
      row.cover_image_format,
      row.cover_image_width,
      row.cover_image_height,
      row.cover_image_byte_size,
      row.cover_image_display_order,
      row.cover_image_alt_text,
      row.cover_image_created_at
    ];
    if (absentValues.some((value) => value !== null)) {
      throw new OwnerListingSummaryMappingError();
    }
    return null;
  }

  return mapOwnerImageRow({
    id: row.cover_image_id,
    secure_url: row.cover_image_url,
    format: row.cover_image_format,
    width: row.cover_image_width,
    height: row.cover_image_height,
    byte_size: row.cover_image_byte_size,
    display_order: row.cover_image_display_order,
    alt_text: row.cover_image_alt_text,
    created_at: row.cover_image_created_at
  });
}

export function mapOwnerListingSummaryRow(row: Readonly<OwnerListingSummaryRow>): OwnerListingSummary {
  if (
    !Number.isInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    !isListingStatus(row.status) ||
    (row.title !== null && typeof row.title !== "string") ||
    (row.area_name !== null && typeof row.area_name !== "string")
  ) {
    throw new OwnerListingSummaryMappingError();
  }

  try {
    return Object.freeze({
      id: row.id as number,
      status: row.status,
      title: row.title as string | null,
      monthlyRent: mapNullablePgWholeNumeric(row.monthly_rent, "monthly_rent"),
      areaName: row.area_name as string | null,
      propertyType: mapPropertyType(row.property_type_code, row.property_type_label),
      coverImage: mapCoverImage(row),
      currentModerationReason: resolveCurrentModerationReason(row.status, row.current_moderation_reason),
      updatedAt: mapPgTimestamptz(row.updated_at, "updated_at")
    });
  } catch (error) {
    if (error instanceof OwnerListingSummaryMappingError) {
      throw error;
    }
    throw new OwnerListingSummaryMappingError();
  }
}

export function mapOwnerListingSummaryToDto(summary: Readonly<OwnerListingSummary>): OwnerListingSummaryDto {
  try {
    return Object.freeze({
      id: summary.id,
      status: summary.status,
      title: summary.title,
      monthlyRent: summary.monthlyRent,
      areaName: summary.areaName,
      propertyType: summary.propertyType === null ? null : mapPropertyTypeToDto(summary.propertyType),
      coverImage: summary.coverImage === null ? null : mapOwnerImageToDto(summary.coverImage),
      currentModerationReason: resolveCurrentModerationReason(summary.status, summary.currentModerationReason),
      updatedAt: formatApiTimestamp(summary.updatedAt)
    });
  } catch {
    throw new OwnerListingSummaryMappingError();
  }
}
