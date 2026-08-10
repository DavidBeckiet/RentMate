import type { QueryResultRow } from "pg";
import { mapPgTimestamptz } from "../../db/value-mappers.js";
import { formatApiTimestamp } from "../../shared/mapping/api-values.js";
import { isListingStatus, type ListingStatus } from "./owner-listing-mapper.js";

const maximumIntegerId = 2_147_483_647;

export interface ModerationHistoryItemRow extends QueryResultRow {
  readonly id: unknown;
  readonly listing_id: unknown;
  readonly admin_id: unknown;
  readonly previous_status: unknown;
  readonly new_status: unknown;
  readonly reason: unknown;
  readonly created_at: unknown;
}

export interface ModerationHistoryItem {
  readonly id: number;
  readonly listingId: number;
  readonly adminId: number;
  readonly previousStatus: ListingStatus;
  readonly newStatus: ListingStatus;
  readonly reason: string | null;
  readonly createdAt: Date;
}

export interface ModerationHistoryItemDto {
  readonly id: number;
  readonly listingId: number;
  readonly adminId: number;
  readonly previousStatus: ListingStatus;
  readonly newStatus: ListingStatus;
  readonly reason: string | null;
  readonly createdAt: string;
}

export class ModerationHistoryMappingError extends Error {
  constructor() {
    super("Moderation history representation is invalid.");
    this.name = "ModerationHistoryMappingError";
  }
}

function isPositiveIntegerId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= maximumIntegerId;
}

function isReason(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.trim().length > 0 && [...value].length <= 1_000);
}

export function mapModerationHistoryItemRow(row: Readonly<ModerationHistoryItemRow>): ModerationHistoryItem {
  if (
    !isPositiveIntegerId(row.id) ||
    !isPositiveIntegerId(row.listing_id) ||
    !isPositiveIntegerId(row.admin_id) ||
    !isListingStatus(row.previous_status) ||
    !isListingStatus(row.new_status) ||
    !isReason(row.reason)
  ) {
    throw new ModerationHistoryMappingError();
  }
  try {
    return Object.freeze({
      id: row.id,
      listingId: row.listing_id,
      adminId: row.admin_id,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      reason: row.reason,
      createdAt: mapPgTimestamptz(row.created_at, "created_at")
    });
  } catch {
    throw new ModerationHistoryMappingError();
  }
}

export function mapModerationHistoryItemToDto(item: Readonly<ModerationHistoryItem>): ModerationHistoryItemDto {
  if (
    !isPositiveIntegerId(item.id) ||
    !isPositiveIntegerId(item.listingId) ||
    !isPositiveIntegerId(item.adminId) ||
    !isListingStatus(item.previousStatus) ||
    !isListingStatus(item.newStatus) ||
    !isReason(item.reason)
  ) {
    throw new ModerationHistoryMappingError();
  }
  try {
    return Object.freeze({
      id: item.id,
      listingId: item.listingId,
      adminId: item.adminId,
      previousStatus: item.previousStatus,
      newStatus: item.newStatus,
      reason: item.reason,
      createdAt: formatApiTimestamp(item.createdAt)
    });
  } catch {
    throw new ModerationHistoryMappingError();
  }
}
