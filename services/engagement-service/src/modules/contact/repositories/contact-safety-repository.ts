import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryExactlyOne,
  queryMany,
  queryOptional,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { formatApiTimestamp } from "../../../../../shared/src/runtime/shared/mapping/api-values.js";
import type {
  ContactReportCategory,
  ContactReportStatus,
  CreateContactReportInput
} from "../validations/contact-safety-validation.js";

export interface ContactBlockState {
  readonly blockedByCurrentUser: boolean;
  readonly blockedByOtherUser: boolean;
  readonly canSendMessage: boolean;
}

export interface ContactReportMessage {
  readonly id: number;
  readonly senderRole: "TENANT" | "LANDLORD";
  readonly body: string;
  readonly createdAt: string;
}

export interface ContactReport {
  readonly id: number;
  readonly inquiryId: number;
  readonly listingId: number;
  readonly tenantId: number;
  readonly landlordId: number;
  readonly reporterId: number;
  readonly message: ContactReportMessage | null;
  readonly category: ContactReportCategory;
  readonly details: string | null;
  readonly status: ContactReportStatus;
  readonly resolutionNote: string | null;
  readonly assignedAdminId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
}

export interface ContactReportEvent {
  readonly id: number;
  readonly actorId: number;
  readonly actorRole: "TENANT" | "LANDLORD" | "ADMIN";
  readonly previousStatus: ContactReportStatus | null;
  readonly newStatus: ContactReportStatus;
  readonly note: string | null;
  readonly createdAt: string;
}

interface BooleanRow extends QueryResultRow {
  value: unknown;
}

interface ReportRow extends QueryResultRow {
  id: unknown;
  inquiry_id: unknown;
  listing_id: unknown;
  tenant_id: unknown;
  landlord_id: unknown;
  reporter_id: unknown;
  message_id: unknown;
  message_sender_role: unknown;
  message_body: unknown;
  message_created_at: unknown;
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
  r.id, r.inquiry_id, i.listing_id, i.tenant_id, i.landlord_id, r.reporter_id, r.message_id,
  m.sender_role AS message_sender_role, m.body AS message_body, m.created_at AS message_created_at,
  r.category, r.details, r.status, r.resolution_note, r.assigned_admin_id,
  r.created_at, r.updated_at, r.resolved_at
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

function isCategory(value: unknown): value is ContactReportCategory {
  return ["SPAM", "FRAUD", "HARASSMENT", "INAPPROPRIATE", "OTHER"].includes(String(value) as ContactReportCategory);
}

function isStatus(value: unknown): value is ContactReportStatus {
  return ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"].includes(String(value) as ContactReportStatus);
}

function mapReportMessage(row: Readonly<ReportRow>): ContactReportMessage | null {
  if (row.message_id === null) return null;
  if ((row.message_sender_role !== "TENANT" && row.message_sender_role !== "LANDLORD") || typeof row.message_body !== "string") {
    throw new RepositoryInvariantError("Contact report message representation is invalid.");
  }
  return Object.freeze({
    id: positiveId(row.message_id, "report.messageId"),
    senderRole: row.message_sender_role,
    body: row.message_body,
    createdAt: timestamp(row.message_created_at, "report.messageCreatedAt")
  });
}

function mapReport(row: Readonly<ReportRow>): ContactReport {
  if (!isCategory(row.category) || !isStatus(row.status)) {
    throw new RepositoryInvariantError("Contact report representation is invalid.");
  }
  return Object.freeze({
    id: positiveId(row.id, "report.id"),
    inquiryId: positiveId(row.inquiry_id, "report.inquiryId"),
    listingId: positiveId(row.listing_id, "report.listingId"),
    tenantId: positiveId(row.tenant_id, "report.tenantId"),
    landlordId: positiveId(row.landlord_id, "report.landlordId"),
    reporterId: positiveId(row.reporter_id, "report.reporterId"),
    message: mapReportMessage(row),
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

function mapEvent(row: Readonly<EventRow>): ContactReportEvent {
  if (
    (row.actor_role !== "TENANT" && row.actor_role !== "LANDLORD" && row.actor_role !== "ADMIN") ||
    !isStatus(row.new_status) ||
    (row.previous_status !== null && !isStatus(row.previous_status))
  ) {
    throw new RepositoryInvariantError("Contact report event representation is invalid.");
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

export interface ContactSafetyRepository {
  readonly getBlockState: (
    executor: SqlExecutor,
    currentUserId: number,
    otherUserId: number
  ) => Promise<ContactBlockState>;
  readonly isPairBlocked: (executor: SqlExecutor, firstUserId: number, secondUserId: number) => Promise<boolean>;
  readonly createBlock: (
    executor: SqlExecutor,
    input: { readonly blockerId: number; readonly blockedId: number; readonly inquiryId: number }
  ) => Promise<void>;
  readonly deleteBlock: (executor: SqlExecutor, blockerId: number, blockedId: number) => Promise<void>;
  readonly messageBelongsToInquiry: (executor: SqlExecutor, inquiryId: number, messageId: number) => Promise<boolean>;
  readonly createReport: (
    executor: SqlExecutor,
    inquiryId: number,
    reporterId: number,
    input: CreateContactReportInput
  ) => Promise<ContactReport>;
  readonly listReports: (
    executor: SqlExecutor,
    input: {
      readonly status: ContactReportStatus;
      readonly category: ContactReportCategory | null;
      readonly limit: number;
      readonly offset: number;
    }
  ) => Promise<readonly ContactReport[]>;
  readonly findReport: (executor: SqlExecutor, reportId: number, forUpdate?: boolean) => Promise<ContactReport | null>;
  readonly updateReportStatus: (
    executor: SqlExecutor,
    reportId: number,
    status: ContactReportStatus,
    adminId: number,
    note: string | null
  ) => Promise<ContactReport>;
  readonly appendReportEvent: (
    executor: SqlExecutor,
    input: {
      readonly reportId: number;
      readonly actorId: number;
      readonly actorRole: "TENANT" | "LANDLORD" | "ADMIN";
      readonly previousStatus: ContactReportStatus | null;
      readonly newStatus: ContactReportStatus;
      readonly note: string | null;
    }
  ) => Promise<ContactReportEvent>;
  readonly listReportEvents: (executor: SqlExecutor, reportId: number) => Promise<readonly ContactReportEvent[]>;
}

export function createContactSafetyRepository(): ContactSafetyRepository {
  const repository: ContactSafetyRepository = {
    async getBlockState(executor, currentUserId, otherUserId) {
      const row = await queryExactlyOne<{ blocked_by_current: unknown; blocked_by_other: unknown }, ContactBlockState>(
        executor,
        {
          text: `
            SELECT
              EXISTS (SELECT 1 FROM contact_blocks WHERE blocker_id = $1 AND blocked_id = $2) AS blocked_by_current,
              EXISTS (SELECT 1 FROM contact_blocks WHERE blocker_id = $2 AND blocked_id = $1) AS blocked_by_other
          `,
          values: [currentUserId, otherUserId]
        },
        (value) => {
          if (typeof value.blocked_by_current !== "boolean" || typeof value.blocked_by_other !== "boolean") {
            throw new RepositoryInvariantError("Contact block state representation is invalid.");
          }
          return Object.freeze({
            blockedByCurrentUser: value.blocked_by_current,
            blockedByOtherUser: value.blocked_by_other,
            canSendMessage: !value.blocked_by_current && !value.blocked_by_other
          });
        }
      );
      return row;
    },

    async isPairBlocked(executor, firstUserId, secondUserId) {
      return queryExactlyOne<BooleanRow, boolean>(
        executor,
        {
          text: `
            SELECT EXISTS (
              SELECT 1 FROM contact_blocks
              WHERE (blocker_id = $1 AND blocked_id = $2)
                 OR (blocker_id = $2 AND blocked_id = $1)
            ) AS value
          `,
          values: [firstUserId, secondUserId]
        },
        (value) => {
          if (typeof value.value !== "boolean") throw new RepositoryInvariantError("Contact block result is invalid.");
          return value.value;
        }
      );
    },

    async createBlock(executor, input) {
      await executeCommand(executor, {
        text: `
          INSERT INTO contact_blocks (blocker_id, blocked_id, inquiry_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (blocker_id, blocked_id) DO NOTHING
        `,
        values: [input.blockerId, input.blockedId, input.inquiryId]
      });
    },

    async deleteBlock(executor, blockerId, blockedId) {
      await executeCommand(executor, {
        text: "DELETE FROM contact_blocks WHERE blocker_id = $1 AND blocked_id = $2",
        values: [blockerId, blockedId]
      });
    },

    async messageBelongsToInquiry(executor, inquiryId, messageId) {
      return queryExactlyOne<BooleanRow, boolean>(
        executor,
        {
          text: "SELECT EXISTS (SELECT 1 FROM inquiry_messages WHERE id = $1 AND inquiry_id = $2) AS value",
          values: [messageId, inquiryId]
        },
        (value) => {
          if (typeof value.value !== "boolean") throw new RepositoryInvariantError("Contact message lookup is invalid.");
          return value.value;
        }
      );
    },

    createReport(executor, inquiryId, reporterId, input) {
      return queryExactlyOne<ReportRow, ContactReport>(
        executor,
        {
          text: `
            WITH inserted AS (
              INSERT INTO contact_reports (inquiry_id, reporter_id, message_id, category, details)
              VALUES ($1, $2, $3, $4, $5)
              RETURNING *
            )
            SELECT ${reportSelect}
            FROM inserted AS r
            JOIN listing_inquiries AS i ON i.id = r.inquiry_id
            LEFT JOIN inquiry_messages AS m ON m.id = r.message_id AND m.inquiry_id = r.inquiry_id
          `,
          values: [inquiryId, reporterId, input.messageId, input.category, input.details]
        },
        mapReport
      );
    },

    listReports(executor, input) {
      const values: unknown[] = [input.status];
      const categoryPredicate = input.category === null ? "" : `AND r.category = $${values.push(input.category)}`;
      const limitIndex = values.push(input.limit);
      const offsetIndex = values.push(input.offset);
      return queryMany<ReportRow, ContactReport>(
        executor,
        {
          text: `
            SELECT ${reportSelect}
            FROM contact_reports AS r
            JOIN listing_inquiries AS i ON i.id = r.inquiry_id
            LEFT JOIN inquiry_messages AS m ON m.id = r.message_id AND m.inquiry_id = r.inquiry_id
            WHERE r.status = $1 ${categoryPredicate}
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
          `,
          values
        },
        mapReport
      );
    },

    findReport(executor, reportId, forUpdate = false) {
      return queryOptional<ReportRow, ContactReport>(
        executor,
        {
          text: `
            SELECT ${reportSelect}
            FROM contact_reports AS r
            JOIN listing_inquiries AS i ON i.id = r.inquiry_id
            LEFT JOIN inquiry_messages AS m ON m.id = r.message_id AND m.inquiry_id = r.inquiry_id
            WHERE r.id = $1 ${forUpdate ? "FOR UPDATE OF r" : ""}
          `,
          values: [reportId]
        },
        mapReport
      );
    },

    updateReportStatus(executor, reportId, status, adminId, note) {
      const terminal = status === "RESOLVED" || status === "DISMISSED";
      return queryExactlyOne<ReportRow, ContactReport>(
        executor,
        {
          text: `
            WITH updated AS (
              UPDATE contact_reports
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
            JOIN listing_inquiries AS i ON i.id = r.inquiry_id
            LEFT JOIN inquiry_messages AS m ON m.id = r.message_id AND m.inquiry_id = r.inquiry_id
          `,
          values: [reportId, status, adminId, terminal, note]
        },
        mapReport
      );
    },

    appendReportEvent(executor, input) {
      return queryExactlyOne<EventRow, ContactReportEvent>(
        executor,
        {
          text: `
            INSERT INTO contact_report_events (report_id, actor_id, actor_role, previous_status, new_status, note)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, actor_id, actor_role, previous_status, new_status, note, created_at
          `,
          values: [input.reportId, input.actorId, input.actorRole, input.previousStatus, input.newStatus, input.note]
        },
        mapEvent
      );
    },

    listReportEvents(executor, reportId) {
      return queryMany<EventRow, ContactReportEvent>(
        executor,
        {
          text: `
            SELECT id, actor_id, actor_role, previous_status, new_status, note, created_at
            FROM contact_report_events
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
