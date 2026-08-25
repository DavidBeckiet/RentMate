import type { QueryResultRow } from "pg";
import {
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import { isListingStatus, type ListingStatus } from "../../listings/mappers/owner-listing-mapper.js";
import type { CreateReportInput, ReportCategory, ReportStatus } from "../validations/report-validation.js";

export interface ListingReport {
  readonly id: number;
  readonly listing: {
    readonly id: number;
    readonly title: string | null;
    readonly areaName: string | null;
    readonly status: ListingStatus;
  };
  readonly reporterId: number;
  readonly category: ReportCategory;
  readonly details: string | null;
  readonly status: ReportStatus;
  readonly resolutionNote: string | null;
  readonly assignedAdminId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
}

export interface ReportEvent {
  readonly id: number;
  readonly actorId: number;
  readonly actorRole: "TENANT" | "ADMIN";
  readonly previousStatus: ReportStatus | null;
  readonly newStatus: ReportStatus;
  readonly note: string | null;
  readonly createdAt: string;
}

interface ReportRow extends QueryResultRow {
  id: unknown;
  listing_id: unknown;
  listing_title: unknown;
  listing_area_name: unknown;
  listing_status: unknown;
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
interface ExistsRow extends QueryResultRow {
  exists: unknown;
}

const reportSelect = `
  r.id, r.listing_id, l.title AS listing_title, l.area_name AS listing_area_name,
  l.status AS listing_status, r.reporter_id, r.category, r.details, r.status,
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
function isStatus(value: unknown): value is ReportStatus {
  return ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"].includes(String(value));
}
function isCategory(value: unknown): value is ReportCategory {
  return [
    "PRICE_INCORRECT",
    "LOCATION_INCORRECT",
    "IMAGE_INCORRECT",
    "ALREADY_RENTED",
    "FRAUD",
    "INAPPROPRIATE"
  ].includes(String(value));
}
function nullableText(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as string | null;
}

function mapReport(row: Readonly<ReportRow>): ListingReport {
  if (!isStatus(row.status) || !isCategory(row.category) || !isListingStatus(row.listing_status)) {
    throw new RepositoryInvariantError("Listing report representation is invalid.");
  }
  return Object.freeze({
    id: positiveId(row.id, "report.id"),
    listing: Object.freeze({
      id: positiveId(row.listing_id, "report.listingId"),
      title: nullableText(row.listing_title, "report.listingTitle"),
      areaName: nullableText(row.listing_area_name, "report.listingAreaName"),
      status: row.listing_status
    }),
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

function mapEvent(row: Readonly<EventRow>): ReportEvent {
  if (
    (row.actor_role !== "TENANT" && row.actor_role !== "ADMIN") ||
    !isStatus(row.new_status) ||
    (row.previous_status !== null && !isStatus(row.previous_status))
  ) {
    throw new RepositoryInvariantError("Report event representation is invalid.");
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

export interface ReportRepository {
  readonly isReportableListing: (
    executor: SqlExecutor,
    listingId: number,
    activeLandlordIds: readonly number[]
  ) => Promise<boolean>;
  readonly create: (
    executor: SqlExecutor,
    reporterId: number,
    listingId: number,
    input: CreateReportInput
  ) => Promise<ListingReport>;
  readonly list: (
    executor: SqlExecutor,
    input: {
      readonly status: ReportStatus;
      readonly category: ReportCategory | null;
      readonly limit: number;
      readonly offset: number;
    }
  ) => Promise<readonly ListingReport[]>;
  readonly findById: (executor: SqlExecutor, reportId: number, forUpdate?: boolean) => Promise<ListingReport | null>;
  readonly updateStatus: (
    executor: SqlExecutor,
    reportId: number,
    status: ReportStatus,
    adminId: number,
    note: string | null
  ) => Promise<ListingReport>;
  readonly appendEvent: (
    executor: SqlExecutor,
    input: {
      readonly reportId: number;
      readonly actorId: number;
      readonly actorRole: "TENANT" | "ADMIN";
      readonly previousStatus: ReportStatus | null;
      readonly newStatus: ReportStatus;
      readonly note: string | null;
    }
  ) => Promise<ReportEvent>;
  readonly listEvents: (executor: SqlExecutor, reportId: number) => Promise<readonly ReportEvent[]>;
}

export function createReportRepository(): ReportRepository {
  const repository: ReportRepository = {
    async isReportableListing(executor, listingId, activeLandlordIds) {
      if (activeLandlordIds.length === 0) return false;
      const row = await queryExactlyOne<ExistsRow, boolean>(
        executor,
        {
          text: `SELECT EXISTS (SELECT 1 FROM listings WHERE id = $1 AND status = 'APPROVED' AND business_status IN ('AVAILABLE', 'UNKNOWN') AND landlord_id = ANY($2::integer[])) AS exists`,
          values: [listingId, [...activeLandlordIds]]
        },
        (value) => {
          if (typeof value.exists !== "boolean")
            throw new RepositoryInvariantError("Reportable listing result is invalid.");
          return value.exists;
        }
      );
      return row;
    },
    create(executor, reporterId, listingId, input) {
      return queryExactlyOne<ReportRow, ListingReport>(
        executor,
        {
          text: `WITH inserted AS (
          INSERT INTO listing_reports (listing_id, reporter_id, category, details)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        ) SELECT ${reportSelect} FROM inserted AS r JOIN listings AS l ON l.id = r.listing_id`,
          values: [listingId, reporterId, input.category, input.details]
        },
        mapReport
      );
    },
    list(executor, input) {
      const values: unknown[] = [input.status];
      const categoryPredicate = input.category === null ? "" : `AND r.category = $${values.push(input.category)}`;
      const limitIndex = values.push(input.limit);
      const offsetIndex = values.push(input.offset);
      return queryMany<ReportRow, ListingReport>(
        executor,
        {
          text: `SELECT ${reportSelect} FROM listing_reports AS r JOIN listings AS l ON l.id = r.listing_id
          WHERE r.status = $1 ${categoryPredicate}
          ORDER BY r.created_at DESC, r.id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
          values
        },
        mapReport
      );
    },
    findById(executor, reportId, forUpdate = false) {
      return queryOptional<ReportRow, ListingReport>(
        executor,
        {
          text: `SELECT ${reportSelect} FROM listing_reports AS r JOIN listings AS l ON l.id = r.listing_id WHERE r.id = $1 ${forUpdate ? "FOR UPDATE OF r" : ""}`,
          values: [reportId]
        },
        mapReport
      );
    },
    updateStatus(executor, reportId, status, adminId, note) {
      const terminal = status === "RESOLVED" || status === "DISMISSED";
      return queryExactlyOne<ReportRow, ListingReport>(
        executor,
        {
          text: `WITH updated AS (
          UPDATE listing_reports SET status = $2, assigned_admin_id = $3,
            resolution_note = CASE WHEN $4::boolean THEN $5 ELSE NULL END,
            resolved_at = CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *
        ) SELECT ${reportSelect} FROM updated AS r JOIN listings AS l ON l.id = r.listing_id`,
          values: [reportId, status, adminId, terminal, note]
        },
        mapReport
      );
    },
    appendEvent(executor, input) {
      return queryExactlyOne<EventRow, ReportEvent>(
        executor,
        {
          text: `INSERT INTO listing_report_events (report_id, actor_id, actor_role, previous_status, new_status, note)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, actor_id, actor_role, previous_status, new_status, note, created_at`,
          values: [input.reportId, input.actorId, input.actorRole, input.previousStatus, input.newStatus, input.note]
        },
        mapEvent
      );
    },
    listEvents(executor, reportId) {
      return queryMany<EventRow, ReportEvent>(
        executor,
        {
          text: `SELECT id, actor_id, actor_role, previous_status, new_status, note, created_at
          FROM listing_report_events WHERE report_id = $1 ORDER BY created_at ASC, id ASC`,
          values: [reportId]
        },
        mapEvent
      );
    }
  };
  return Object.freeze(repository);
}
