import type { QueryResultRow } from "pg";
import { mapPgTimestamptz } from "../../../../shared/src/runtime/db/value-mappers.js";
import { formatApiTimestamp } from "../../../../shared/src/runtime/shared/mapping/api-values.js";

const maximumUserId = 2_147_483_647;

export interface RoommateRiskProjectionRow extends QueryResultRow {
  readonly id: unknown;
  readonly created_at: unknown;
}

export interface RoommateRiskProjection {
  readonly tenantId: number;
  readonly createdAt: string;
}

function isValidUserId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= maximumUserId;
}

export function mapRoommateRiskProjectionRow(row: Readonly<RoommateRiskProjectionRow>): RoommateRiskProjection {
  if (!isValidUserId(row.id)) throw new Error("Roommate risk projection row is invalid.");
  let createdAt: Date;
  try {
    createdAt = mapPgTimestamptz(row.created_at, "created_at");
  } catch {
    throw new Error("Roommate risk projection row is invalid.");
  }
  return Object.freeze({ tenantId: row.id, createdAt: formatApiTimestamp(createdAt) });
}
