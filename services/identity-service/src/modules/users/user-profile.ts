import type { QueryResultRow } from "pg";
import { mapPgTimestamptz } from "../../../../shared/src/runtime/db/value-mappers.js";
import { formatApiTimestamp } from "../../../../shared/src/runtime/shared/mapping/api-values.js";
import { isUserRole, type UserRole } from "../../../../shared/src/runtime/shared/types/authentication.js";

const maximumUserId = 2_147_483_647;

export interface UserProfileRow extends QueryResultRow {
  readonly id: number;
  readonly role: UserRole;
  readonly email: string;
  readonly phone_e164: string | null;
  readonly is_active: boolean;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

export interface UserProfile {
  readonly id: number;
  readonly role: UserRole;
  readonly email: string;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserProfileDto {
  readonly id: number;
  readonly role: UserRole;
  readonly email: string;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class UserProfileMappingError extends Error {
  constructor() {
    super("User profile row is invalid.");
    this.name = "UserProfileMappingError";
  }
}

function isValidUserId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= maximumUserId;
}

export function mapUserProfileRow(row: Readonly<UserProfileRow>): UserProfile {
  if (
    !isValidUserId(row.id) ||
    !isUserRole(row.role) ||
    typeof row.email !== "string" ||
    (row.phone_e164 !== null && typeof row.phone_e164 !== "string") ||
    typeof row.is_active !== "boolean"
  ) {
    throw new UserProfileMappingError();
  }

  let createdAt: Date;
  let updatedAt: Date;

  try {
    createdAt = mapPgTimestamptz(row.created_at, "created_at");
    updatedAt = mapPgTimestamptz(row.updated_at, "updated_at");
  } catch {
    throw new UserProfileMappingError();
  }

  return Object.freeze({
    id: row.id,
    role: row.role,
    email: row.email,
    phone: row.phone_e164,
    isActive: row.is_active,
    createdAt,
    updatedAt
  });
}

export function mapUserProfileToDto(user: Readonly<UserProfile>): UserProfileDto {
  if (
    !isValidUserId(user.id) ||
    !isUserRole(user.role) ||
    typeof user.email !== "string" ||
    (user.phone !== null && typeof user.phone !== "string") ||
    typeof user.isActive !== "boolean"
  ) {
    throw new UserProfileMappingError();
  }

  try {
    return Object.freeze({
      id: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      createdAt: formatApiTimestamp(user.createdAt),
      updatedAt: formatApiTimestamp(user.updatedAt)
    });
  } catch {
    throw new UserProfileMappingError();
  }
}
