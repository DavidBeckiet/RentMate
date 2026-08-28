import type { QueryResultRow } from "pg";
import { mapPgTimestamptz } from "../../../../shared/src/runtime/db/value-mappers.js";
import { isUserRole, type UserRole } from "../../../../shared/src/runtime/shared/types/authentication.js";

const maximumUserId = 2_147_483_647;
const maximumProjectionBatchSize = 100;

export interface RoommateTenantProjectionRow extends QueryResultRow {
  readonly id: unknown;
  readonly role: unknown;
  readonly display_name: unknown;
  readonly is_active: unknown;
  readonly created_at: unknown;
  readonly email_verified: unknown;
  readonly phone_verified: unknown;
}

export interface RoommateTenantProjection {
  readonly tenantId: number;
  readonly role: UserRole;
  readonly displayName: string | null;
  readonly isActive: boolean;
  readonly memberSince: string;
  readonly emailVerified: boolean;
  readonly phoneVerified: boolean;
}

function isValidUserId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= maximumUserId;
}

export function parseRoommateTenantProjectionIds(value: unknown): readonly number[] | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ids = value.split(",").map((item) => Number(item));
  if (
    ids.length === 0 ||
    ids.length > maximumProjectionBatchSize ||
    ids.some((id) => !Number.isSafeInteger(id) || !isValidUserId(id))
  ) {
    return null;
  }
  return Object.freeze([...new Set(ids)]);
}

function formatMemberSince(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Roommate tenant projection member date is invalid.");
  }

  return `${String(value.getUTCFullYear()).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function mapRoommateTenantProjectionRow(row: Readonly<RoommateTenantProjectionRow>): RoommateTenantProjection {
  if (
    !isValidUserId(row.id) ||
    !isUserRole(row.role) ||
    (row.display_name !== null && typeof row.display_name !== "string") ||
    typeof row.is_active !== "boolean" ||
    typeof row.email_verified !== "boolean" ||
    typeof row.phone_verified !== "boolean"
  ) {
    throw new Error("Roommate tenant projection row is invalid.");
  }

  let createdAt: Date;
  try {
    createdAt = mapPgTimestamptz(row.created_at, "created_at");
  } catch {
    throw new Error("Roommate tenant projection row is invalid.");
  }

  return Object.freeze({
    tenantId: row.id,
    role: row.role,
    displayName: row.display_name,
    isActive: row.is_active,
    memberSince: formatMemberSince(createdAt),
    emailVerified: row.email_verified,
    phoneVerified: row.phone_verified
  });
}
