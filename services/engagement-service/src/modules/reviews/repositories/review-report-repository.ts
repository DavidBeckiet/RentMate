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
  CreateReviewReportInput,
  ReviewReportCategory,
  ReviewReportStatus
} from "../validations/review-validation.js";

export interface ReviewReportTarget {
  readonly reviewId: number;
  readonly tenantId: number;
  readonly listingId: number;
}

export interface ReviewReport {
  readonly id: number;
  readonly reviewId: number;
  readonly listingId: number;
  readonly reporterId: number;
  readonly category: ReviewReportCategory;
  readonly details: string | null;
  readonly status: ReviewReportStatus;
  readonly resolutionNote: string | null;
  readonly assignedAdminId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
}

export interface ReviewReportEvent {
  readonly id: number;
  readonly actorId: number;
  readonly actorRole: "TENANT" | "LANDLORD" | "ADMIN";
  readonly previousStatus: ReviewReportStatus | null;
  readonly newStatus: ReviewReportStatus;
  readonly note: string | null;
  readonly createdAt: string;
}

interface TargetRow extends QueryResultRow {
  review_id: unknown;
  tenant_id: unknown;
  listing_id: unknown;
}

interface ReportRow extends QueryResultRow {
  id: unknown;
  review_id: unknown;
  listing_id: unknown;
  reporter_id: unknown;
  category: unknown;
  details: unknown;
  status: unknown;
  resolution_note: unknown;
  assigned_admin_id: unknown;
  created_at: unknown;
  updated_at: unknown;
  resolved_at: unknown;
}

interface EventRow extends QueryResultRow {
  id: unknown;
  actor_id: unknown;
  actor_role: unknown;
  previous_status: unknown;
  new_status: unknown;
  note: unknown;
  created_at: unknown;
}

const reportSelect = `
  r.id, r.review_id, lr.listing_id, r.reporter_id, r.category, r.details, r.status,
  r.resolution_note, r.assigned_admin_id, r.created_at, r.updated_at, r.resolved_at
`;

function positiveId(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as number;
}

function nullableId(value: unknown, field: string): number | null {
  return value === null ? null : positiveId(value, field);
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

function nullableText(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as string | null;
}

function isCategory(value: unknown): value is ReviewReportCategory {
  return ["INACCURATE", "OFFENSIVE", "HARASSMENT", "SPAM", "OTHER"].includes(String(value) as ReviewReportCategory);
}

function isStatus(value: unknown): value is ReviewReportStatus {
  return ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"].includes(String(value) as ReviewReportStatus);
}

function mapTarget(row: Readonly<TargetRow>): ReviewReportTarget {
  return Object.freeze({
    reviewId: positiveId(row.review_id, "reviewId"),
    tenantId: positiveId(row.tenant_id, "review.tenantId"),
    listingId: positiveId(row.listing_id, "review.listingId")
  });
}

function mapReport(row: Readonly<ReportRow>): ReviewReport {
  if (!isCategory(row.category) || !isStatus(row.status)) {
    throw new RepositoryInvariantError("Review report representation is invalid.");
  }
  return Object.freeze({
    id: positiveId(row.id, "report.id"),
    reviewId: positiveId(row.review_id, "report.reviewId"),
    listingId: positiveId(row.listing_id, "report.listingId"),
    reporterId: positiveId(row.reporter_id, "report.reporterId"),
    category: row.category,
    details: nullableText(row.details, "report.details"),
    status: row.status,
    resolutionNote: nullableText(row.resolution_note, "report.resolutionNote"),
    assignedAdminId: nullableId(row.assigned_admin_id, "report.assignedAdminId"),
    createdAt: timestamp(row.created_at, "report.createdAt"),
    updatedAt: timestamp(row.updated_at, "report.updatedAt"),
    resolvedAt: nullableTimestamp(row.resolved_at, "report.resolvedAt")
  });
}

function mapEvent(row: Readonly<EventRow>): ReviewReportEvent {
  if (
    (row.actor_role !== "TENANT" && row.actor_role !== "LANDLORD" && row.actor_role !== "ADMIN") ||
    !isStatus(row.new_status) ||
    (row.previous_status !== null && !isStatus(row.previous_status))
  ) {
    throw new RepositoryInvariantError("Review report event representation is invalid.");
  }
  return Object.freeze({
    id: positiveId(row.id, "event.id"),
    actorId: positiveId(row.actor_id, "event.actorId"),
    actorRole: row.actor_role,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    note: nullableText(row.note, "event.note"),
    createdAt: timestamp(row.created_at, "event.createdAt")
  });
}

export interface ReviewReportRepository {
  readonly findReportableReview: (executor: SqlExecutor, reviewId: number) => Promise<ReviewReportTarget | null>;
  readonly create: (
    executor: SqlExecutor,
    reviewId: number,
    reporterId: number,
    input: CreateReviewReportInput
  ) => Promise<ReviewReport>;
  readonly list: (
    executor: SqlExecutor,
    input: {
      readonly status: ReviewReportStatus;
      readonly category: ReviewReportCategory | null;
      readonly limit: number;
      readonly offset: number;
    }
  ) => Promise<readonly ReviewReport[]>;
  readonly findById: (executor: SqlExecutor, reportId: number, forUpdate?: boolean) => Promise<ReviewReport | null>;
  readonly updateStatus: (
    executor: SqlExecutor,
    reportId: number,
    status: ReviewReportStatus,
    adminId: number,
    note: string | null
  ) => Promise<ReviewReport>;
  readonly appendEvent: (
    executor: SqlExecutor,
    input: {
      readonly reportId: number;
      readonly actorId: number;
      readonly actorRole: "TENANT" | "LANDLORD" | "ADMIN";
      readonly previousStatus: ReviewReportStatus | null;
      readonly newStatus: ReviewReportStatus;
      readonly note: string | null;
    }
  ) => Promise<ReviewReportEvent>;
  readonly listEvents: (executor: SqlExecutor, reportId: number) => Promise<readonly ReviewReportEvent[]>;
}

export function createReviewReportRepository(): ReviewReportRepository {
  const repository: ReviewReportRepository = {
    findReportableReview(executor, reviewId) {
      return queryOptional<TargetRow, ReviewReportTarget>(
        executor,
        {
          text: `
            SELECT id AS review_id, tenant_id, listing_id
            FROM listing_reviews
            WHERE id = $1 AND status = 'APPROVED'
          `,
          values: [reviewId]
        },
        mapTarget
      );
    },

    create(executor, reviewId, reporterId, input) {
      return queryExactlyOne<ReportRow, ReviewReport>(
        executor,
        {
          text: `
            WITH inserted AS (
              INSERT INTO review_reports (review_id, reporter_id, category, details)
              VALUES ($1, $2, $3, $4)
              RETURNING *
            )
            SELECT ${reportSelect}
            FROM inserted AS r
            JOIN listing_reviews AS lr ON lr.id = r.review_id
          `,
          values: [reviewId, reporterId, input.category, input.details]
        },
        mapReport
      );
    },

    list(executor, input) {
      const values: unknown[] = [input.status];
      const categoryPredicate = input.category === null ? "" : `AND r.category = $${values.push(input.category)}`;
      const limitIndex = values.push(input.limit);
      const offsetIndex = values.push(input.offset);
      return queryMany<ReportRow, ReviewReport>(
        executor,
        {
          text: `
            SELECT ${reportSelect}
            FROM review_reports AS r
            JOIN listing_reviews AS lr ON lr.id = r.review_id
            WHERE r.status = $1 ${categoryPredicate}
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
          `,
          values
        },
        mapReport
      );
    },

    findById(executor, reportId, forUpdate = false) {
      return queryOptional<ReportRow, ReviewReport>(
        executor,
        {
          text: `
            SELECT ${reportSelect}
            FROM review_reports AS r
            JOIN listing_reviews AS lr ON lr.id = r.review_id
            WHERE r.id = $1 ${forUpdate ? "FOR UPDATE OF r" : ""}
          `,
          values: [reportId]
        },
        mapReport
      );
    },

    updateStatus(executor, reportId, status, adminId, note) {
      const terminal = status === "RESOLVED" || status === "DISMISSED";
      return queryExactlyOne<ReportRow, ReviewReport>(
        executor,
        {
          text: `
            WITH updated AS (
              UPDATE review_reports
              SET status = $2,
                  assigned_admin_id = $3,
                  resolution_note = CASE WHEN $4::boolean THEN $5 ELSE NULL END,
                  resolved_at = CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
              RETURNING *
            )
            SELECT ${reportSelect}
            FROM updated AS r
            JOIN listing_reviews AS lr ON lr.id = r.review_id
          `,
          values: [reportId, status, adminId, terminal, note]
        },
        mapReport
      );
    },

    appendEvent(executor, input) {
      return queryExactlyOne<EventRow, ReviewReportEvent>(
        executor,
        {
          text: `
            INSERT INTO review_report_events
              (report_id, actor_id, actor_role, previous_status, new_status, note)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, actor_id, actor_role, previous_status, new_status, note, created_at
          `,
          values: [input.reportId, input.actorId, input.actorRole, input.previousStatus, input.newStatus, input.note]
        },
        mapEvent
      );
    },

    listEvents(executor, reportId) {
      return queryMany<EventRow, ReviewReportEvent>(
        executor,
        {
          text: `
            SELECT id, actor_id, actor_role, previous_status, new_status, note, created_at
            FROM review_report_events
            WHERE report_id = $1
            ORDER BY created_at ASC, id ASC
          `,
          values: [reportId]
        },
        mapEvent
      );
    }
  };
  return Object.freeze(repository);
}
