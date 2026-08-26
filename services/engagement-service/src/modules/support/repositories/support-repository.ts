import type { QueryResultRow } from "pg";
import {
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import type {
  CreateSupportRequestInput,
  SupportRequestCategory,
  SupportRequestStatus
} from "../validations/support-validation.js";

export interface SupportRequest {
  readonly id: number;
  readonly requesterId: number;
  readonly requesterRole: "TENANT" | "LANDLORD" | "ADMIN";
  readonly category: SupportRequestCategory;
  readonly subject: string;
  readonly message: string;
  readonly status: SupportRequestStatus;
  readonly resolutionNote: string | null;
  readonly assignedAdminId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
}

interface SupportRequestRow extends QueryResultRow {
  id: unknown;
  requester_id: unknown;
  requester_role: unknown;
  category: unknown;
  subject: unknown;
  message: unknown;
  status: unknown;
  resolution_note: unknown;
  assigned_admin_id: unknown;
  created_at: unknown;
  updated_at: unknown;
  resolved_at: unknown;
}

const supportRequestColumns = `
  id, requester_id, requester_role, category, subject, message, status,
  resolution_note, assigned_admin_id, created_at, updated_at, resolved_at
`;

function positiveId(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value as number;
}

function nullableId(value: unknown, field: string): number | null {
  return value === null ? null : positiveId(value, field);
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new RepositoryInvariantError(`${field} is invalid.`);
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as string | null;
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

function isRole(value: unknown): value is SupportRequest["requesterRole"] {
  return value === "TENANT" || value === "LANDLORD" || value === "ADMIN";
}

function isCategory(value: unknown): value is SupportRequestCategory {
  return ["ACCOUNT", "LISTING", "SAFETY", "TECHNICAL", "OTHER"].includes(value as SupportRequestCategory);
}

function isStatus(value: unknown): value is SupportRequestStatus {
  return ["OPEN", "IN_PROGRESS", "RESOLVED"].includes(value as SupportRequestStatus);
}

function mapSupportRequest(row: Readonly<SupportRequestRow>): SupportRequest {
  if (!isRole(row.requester_role) || !isCategory(row.category) || !isStatus(row.status)) {
    throw new RepositoryInvariantError("Support request representation is invalid.");
  }
  return Object.freeze({
    id: positiveId(row.id, "supportRequest.id"),
    requesterId: positiveId(row.requester_id, "supportRequest.requesterId"),
    requesterRole: row.requester_role,
    category: row.category,
    subject: text(row.subject, "supportRequest.subject"),
    message: text(row.message, "supportRequest.message"),
    status: row.status,
    resolutionNote: nullableText(row.resolution_note, "supportRequest.resolutionNote"),
    assignedAdminId: nullableId(row.assigned_admin_id, "supportRequest.assignedAdminId"),
    createdAt: timestamp(row.created_at, "supportRequest.createdAt"),
    updatedAt: timestamp(row.updated_at, "supportRequest.updatedAt"),
    resolvedAt: nullableTimestamp(row.resolved_at, "supportRequest.resolvedAt")
  });
}

export interface SupportRepository {
  readonly create: (
    executor: SqlExecutor,
    requesterId: number,
    requesterRole: SupportRequest["requesterRole"],
    input: CreateSupportRequestInput
  ) => Promise<SupportRequest>;
  readonly list: (
    executor: SqlExecutor,
    input: { readonly status: SupportRequestStatus; readonly limit: number; readonly offset: number }
  ) => Promise<readonly SupportRequest[]>;
  readonly findById: (executor: SqlExecutor, supportRequestId: number, forUpdate?: boolean) => Promise<SupportRequest | null>;
  readonly updateStatus: (
    executor: SqlExecutor,
    supportRequestId: number,
    status: SupportRequestStatus,
    adminId: number,
    note: string | null
  ) => Promise<SupportRequest>;
}

export function createSupportRepository(): SupportRepository {
  const repository: SupportRepository = {
    create(executor, requesterId, requesterRole, input) {
      return queryExactlyOne<SupportRequestRow, SupportRequest>(
        executor,
        {
          text: `
            INSERT INTO support_requests (requester_id, requester_role, category, subject, message)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING ${supportRequestColumns}
          `,
          values: [requesterId, requesterRole, input.category, input.subject, input.message]
        },
        mapSupportRequest
      );
    },

    list(executor, input) {
      return queryMany<SupportRequestRow, SupportRequest>(
        executor,
        {
          text: `
            SELECT ${supportRequestColumns}
            FROM support_requests
            WHERE status = $1
            ORDER BY created_at DESC, id DESC
            LIMIT $2 OFFSET $3
          `,
          values: [input.status, input.limit, input.offset]
        },
        mapSupportRequest
      );
    },

    findById(executor, supportRequestId, forUpdate = false) {
      return queryOptional<SupportRequestRow, SupportRequest>(
        executor,
        {
          text: `
            SELECT ${supportRequestColumns}
            FROM support_requests
            WHERE id = $1
            ${forUpdate ? "FOR UPDATE" : ""}
          `,
          values: [supportRequestId]
        },
        mapSupportRequest
      );
    },

    updateStatus(executor, supportRequestId, status, adminId, note) {
      const resolved = status === "RESOLVED";
      return queryExactlyOne<SupportRequestRow, SupportRequest>(
        executor,
        {
          text: `
            UPDATE support_requests
            SET status = $2,
                assigned_admin_id = $3,
                resolution_note = CASE WHEN $4::boolean THEN $5 ELSE NULL END,
                resolved_at = CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING ${supportRequestColumns}
          `,
          values: [supportRequestId, status, adminId, resolved, note]
        },
        mapSupportRequest
      );
    }
  };
  return Object.freeze(repository);
}
