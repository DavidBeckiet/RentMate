import type { QueryResultRow } from "pg";
import {
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import type { CreateVerificationInput, VerificationStatus } from "../validations/verification-validation.js";

export interface LandlordVerification {
  readonly id: number;
  readonly landlord: {
    readonly id: number;
    readonly email: string;
    readonly phone: string | null;
    readonly isActive: boolean;
  };
  readonly displayName: string;
  readonly requestNote: string | null;
  readonly status: VerificationStatus;
  readonly decisionNote: string | null;
  readonly reviewedByAdminId: number | null;
  readonly submittedAt: string;
  readonly reviewedAt: string | null;
  readonly updatedAt: string;
}

interface VerificationRow extends QueryResultRow {
  id: unknown;
  landlord_id: unknown;
  landlord_email: unknown;
  landlord_phone: unknown;
  landlord_is_active: unknown;
  display_name: unknown;
  request_note: unknown;
  status: unknown;
  decision_note: unknown;
  reviewed_by_admin_id: unknown;
  submitted_at: unknown;
  reviewed_at: unknown;
  updated_at: unknown;
}
interface IdRow extends QueryResultRow {
  id: unknown;
}

const projection = `
  v.id, v.landlord_id, u.email AS landlord_email, u.phone_e164 AS landlord_phone,
  u.is_active AS landlord_is_active, v.display_name, v.request_note, v.status,
  v.decision_note, v.reviewed_by_admin_id, v.submitted_at, v.reviewed_at, v.updated_at
`;

function positiveId(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as number;
}
function nullableId(value: unknown, field: string): number | null {
  return value === null ? null : positiveId(value, field);
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value;
}
function nullableText(value: unknown, field: string): string | null {
  return value === null ? null : text(value, field);
}
function timestamp(value: unknown, field: string): string {
  try {
    return formatApiTimestamp(value instanceof Date ? value : new Date(String(value)));
  } catch {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}
function nullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : timestamp(value, field);
}
function isStatus(value: unknown): value is VerificationStatus {
  return value === "PENDING" || value === "APPROVED" || value === "REJECTED";
}

function mapVerification(row: Readonly<VerificationRow>): LandlordVerification {
  if (!isStatus(row.status) || typeof row.landlord_is_active !== "boolean") {
    throw new RepositoryInvariantError("Landlord verification representation is invalid.");
  }
  return Object.freeze({
    id: positiveId(row.id, "verification.id"),
    landlord: Object.freeze({
      id: positiveId(row.landlord_id, "verification.landlordId"),
      email: text(row.landlord_email, "verification.landlordEmail"),
      phone: nullableText(row.landlord_phone, "verification.landlordPhone"),
      isActive: row.landlord_is_active
    }),
    displayName: text(row.display_name, "verification.displayName"),
    requestNote: nullableText(row.request_note, "verification.requestNote"),
    status: row.status,
    decisionNote: nullableText(row.decision_note, "verification.decisionNote"),
    reviewedByAdminId: nullableId(row.reviewed_by_admin_id, "verification.reviewedByAdminId"),
    submittedAt: timestamp(row.submitted_at, "verification.submittedAt"),
    reviewedAt: nullableTimestamp(row.reviewed_at, "verification.reviewedAt"),
    updatedAt: timestamp(row.updated_at, "verification.updatedAt")
  });
}

export interface VerificationRepository {
  readonly create: (
    executor: SqlExecutor,
    landlordId: number,
    input: CreateVerificationInput
  ) => Promise<LandlordVerification>;
  readonly findLatestForLandlord: (executor: SqlExecutor, landlordId: number) => Promise<LandlordVerification | null>;
  readonly findBlockingForLandlord: (executor: SqlExecutor, landlordId: number) => Promise<LandlordVerification | null>;
  readonly list: (
    executor: SqlExecutor,
    input: { readonly status: VerificationStatus; readonly limit: number; readonly offset: number }
  ) => Promise<readonly LandlordVerification[]>;
  readonly findById: (
    executor: SqlExecutor,
    verificationId: number,
    forUpdate?: boolean
  ) => Promise<LandlordVerification | null>;
  readonly review: (
    executor: SqlExecutor,
    verificationId: number,
    status: Exclude<VerificationStatus, "PENDING">,
    note: string,
    adminId: number
  ) => Promise<LandlordVerification>;
  readonly findVerifiedLandlordIds: (
    executor: SqlExecutor,
    landlordIds: readonly number[]
  ) => Promise<readonly number[]>;
}

export function createVerificationRepository(): VerificationRepository {
  const selectFrom = `FROM landlord_verifications AS v JOIN users AS u ON u.id = v.landlord_id`;
  const repository: VerificationRepository = {
    create(executor, landlordId, input) {
      return queryExactlyOne<VerificationRow, LandlordVerification>(
        executor,
        {
          text: `WITH inserted AS (
            INSERT INTO landlord_verifications (landlord_id, display_name, request_note)
            VALUES ($1, $2, $3) RETURNING *
          ) SELECT ${projection} FROM inserted AS v JOIN users AS u ON u.id = v.landlord_id`,
          values: [landlordId, input.displayName, input.note]
        },
        mapVerification
      );
    },
    findLatestForLandlord(executor, landlordId) {
      return queryOptional<VerificationRow, LandlordVerification>(
        executor,
        {
          text: `SELECT ${projection} ${selectFrom} WHERE v.landlord_id = $1 ORDER BY v.submitted_at DESC, v.id DESC LIMIT 1`,
          values: [landlordId]
        },
        mapVerification
      );
    },
    findBlockingForLandlord(executor, landlordId) {
      return queryOptional<VerificationRow, LandlordVerification>(
        executor,
        {
          text: `SELECT ${projection} ${selectFrom} WHERE v.landlord_id = $1 AND v.status IN ('PENDING', 'APPROVED') ORDER BY v.id DESC LIMIT 1 FOR UPDATE OF v`,
          values: [landlordId]
        },
        mapVerification
      );
    },
    list(executor, input) {
      return queryMany<VerificationRow, LandlordVerification>(
        executor,
        {
          text: `SELECT ${projection} ${selectFrom} WHERE v.status = $1 ORDER BY v.submitted_at ASC, v.id ASC LIMIT $2 OFFSET $3`,
          values: [input.status, input.limit, input.offset]
        },
        mapVerification
      );
    },
    findById(executor, verificationId, forUpdate = false) {
      return queryOptional<VerificationRow, LandlordVerification>(
        executor,
        {
          text: `SELECT ${projection} ${selectFrom} WHERE v.id = $1 ${forUpdate ? "FOR UPDATE OF v" : ""}`,
          values: [verificationId]
        },
        mapVerification
      );
    },
    review(executor, verificationId, status, note, adminId) {
      return queryExactlyOne<VerificationRow, LandlordVerification>(
        executor,
        {
          text: `WITH updated AS (
            UPDATE landlord_verifications SET status = $2, decision_note = $3,
              reviewed_by_admin_id = $4, reviewed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'PENDING' RETURNING *
          ) SELECT ${projection} FROM updated AS v JOIN users AS u ON u.id = v.landlord_id`,
          values: [verificationId, status, note, adminId]
        },
        mapVerification
      );
    },
    async findVerifiedLandlordIds(executor, landlordIds) {
      if (landlordIds.length === 0) return Object.freeze([]);
      return Object.freeze(
        await queryMany<IdRow, number>(
          executor,
          {
            text: `SELECT DISTINCT landlord_id AS id FROM landlord_verifications WHERE status = 'APPROVED' AND landlord_id = ANY($1::integer[]) ORDER BY landlord_id ASC`,
            values: [[...landlordIds]]
          },
          (row) => positiveId(row.id, "verifiedLandlord.id")
        )
      );
    }
  };
  return Object.freeze(repository);
}
