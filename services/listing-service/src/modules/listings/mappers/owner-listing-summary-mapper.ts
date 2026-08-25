import type { QueryResultRow } from "pg";
import {
  mapNullablePgTimestamptz,
  mapNullablePgWholeNumeric,
  mapPgTimestamptz
} from "../../../../../shared/src/runtime/db/value-mappers.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import { resolveCurrentModerationReason } from "../current-moderation-reason.js";
import { isListingBusinessStatus, type ListingBusinessStatus } from "../../../../../shared/listing-business-status.js";
import { mapOwnerImageRow, mapOwnerImageToDto, type OwnerImage, type OwnerImageDto } from "./owner-image-mapper.js";
import { mapLookupValueRow, mapPropertyTypeToDto, type LookupValue, type PropertyTypeDto } from "./lookup-mapper.js";
import { isListingStatus, type ListingStatus } from "./owner-listing-mapper.js";
import {
  resolveListingAvailabilitySnapshot,
  type ListingAvailabilityStatus
} from "../listing-availability.js";

const maximumListingId = 2_147_483_647;

export interface OwnerListingSummaryRow extends QueryResultRow {
  readonly id: unknown;
  readonly status: unknown;
  readonly business_status: unknown;
  readonly title: unknown;
  readonly monthly_rent: unknown;
  readonly max_occupants: unknown;
  readonly area_name: unknown;
  readonly availability_confirmed_at: unknown;
  readonly availability_reminder_sent_at: unknown;
  readonly availability_reminder_notified_at: unknown;
  readonly availability_auto_paused_at: unknown;
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
  readonly businessStatus: ListingBusinessStatus;
  readonly title: string | null;
  readonly monthlyRent: number | null;
  readonly maxOccupants: number | null;
  readonly areaName: string | null;
  readonly availabilityConfirmedAt: Date | null;
  readonly availabilityReminderSentAt: Date | null;
  readonly availabilityReminderNotifiedAt: Date | null;
  readonly availabilityAutoPausedAt: Date | null;
  readonly propertyType: LookupValue | null;
  readonly coverImage: OwnerImage | null;
  readonly currentModerationReason: string | null;
  readonly updatedAt: Date;
}

export interface OwnerListingSummaryDto {
  readonly id: number;
  readonly status: ListingStatus;
  readonly businessStatus: ListingBusinessStatus;
  readonly title: string | null;
  readonly monthlyRent: number | null;
  readonly maxOccupants: number | null;
  readonly areaName: string | null;
  readonly availabilityStatus: ListingAvailabilityStatus;
  readonly availabilityConfirmedAt: string | null;
  readonly availabilityExpiresAt: string | null;
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

function mapMaxOccupants(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 20) {
    throw new OwnerListingSummaryMappingError();
  }
  return value as number;
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
    !isListingBusinessStatus(row.business_status) ||
    (row.title !== null && typeof row.title !== "string") ||
    (row.area_name !== null && typeof row.area_name !== "string")
  ) {
    throw new OwnerListingSummaryMappingError();
  }

  try {
    return Object.freeze({
      id: row.id as number,
      status: row.status,
      businessStatus: row.business_status,
      title: row.title as string | null,
      monthlyRent: mapNullablePgWholeNumeric(row.monthly_rent, "monthly_rent"),
      maxOccupants: mapMaxOccupants(row.max_occupants),
      areaName: row.area_name as string | null,
      availabilityConfirmedAt: mapNullablePgTimestamptz(
        row.availability_confirmed_at ?? null,
        "availability_confirmed_at"
      ),
      availabilityReminderSentAt: mapNullablePgTimestamptz(
        row.availability_reminder_sent_at ?? null,
        "availability_reminder_sent_at"
      ),
      availabilityReminderNotifiedAt: mapNullablePgTimestamptz(
        row.availability_reminder_notified_at ?? null,
        "availability_reminder_notified_at"
      ),
      availabilityAutoPausedAt: mapNullablePgTimestamptz(
        row.availability_auto_paused_at ?? null,
        "availability_auto_paused_at"
      ),
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
    const availability = resolveListingAvailabilitySnapshot(summary);
    return Object.freeze({
      id: summary.id,
      status: summary.status,
      businessStatus: summary.businessStatus,
      title: summary.title,
      monthlyRent: summary.monthlyRent,
      maxOccupants: summary.maxOccupants,
      areaName: summary.areaName,
      availabilityStatus: availability.availabilityStatus,
      availabilityConfirmedAt:
        availability.availabilityConfirmedAt === null
          ? null
          : formatApiTimestamp(availability.availabilityConfirmedAt),
      availabilityExpiresAt:
        availability.availabilityExpiresAt === null ? null : formatApiTimestamp(availability.availabilityExpiresAt),
      propertyType: summary.propertyType === null ? null : mapPropertyTypeToDto(summary.propertyType),
      coverImage: summary.coverImage === null ? null : mapOwnerImageToDto(summary.coverImage),
      currentModerationReason: resolveCurrentModerationReason(summary.status, summary.currentModerationReason),
      updatedAt: formatApiTimestamp(summary.updatedAt)
    });
  } catch {
    throw new OwnerListingSummaryMappingError();
  }
}
