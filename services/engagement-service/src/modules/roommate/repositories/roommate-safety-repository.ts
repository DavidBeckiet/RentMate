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
  RoommateModerationState,
  RoommateReportCategory,
  RoommateReportStatus,
  RoommateReportTargetType
} from "../validations/roommate-safety-validation.js";
import type { RoommateMessageRecord } from "./roommate-repository.js";

export type RoommateNotificationEvent =
  | "ROOMMATE_INTEREST_RECEIVED"
  | "ROOMMATE_INTEREST_ACCEPTED"
  | "ROOMMATE_INTEREST_REJECTED"
  | "ROOMMATE_INTEREST_WITHDRAWN"
  | "ROOMMATE_MESSAGE_RECEIVED"
  | "ROOMMATE_CONNECTION_LEFT";

export interface RoommateBlockRecord {
  readonly blockerTenantId: number;
  readonly blockedTenantId: number;
  readonly requestId: number;
}

export interface RoommateReportRecord {
  readonly id: number;
  readonly reporterTenantId: number;
  readonly requestId: number;
  readonly messageId: number | null;
  readonly subjectTenantId: number | null;
  readonly targetType: RoommateReportTargetType;
  readonly category: RoommateReportCategory;
  readonly details: string | null;
  readonly evidenceSnapshot: Readonly<Record<string, unknown>>;
  readonly status: RoommateReportStatus;
  readonly resolutionNote: string | null;
  readonly assignedAdminId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
}

export interface RoommateReportEvent {
  readonly id: number;
  readonly actorId: number;
  readonly actorRole: "TENANT" | "LANDLORD" | "ADMIN";
  readonly eventType: "STATUS" | "SUBJECT_HIDDEN" | "SUBJECT_RESTORED";
  readonly previousStatus: RoommateReportStatus | null;
  readonly newStatus: RoommateReportStatus | "SUBJECT_HIDDEN" | "SUBJECT_RESTORED";
  readonly subjectType: RoommateReportTargetType | null;
  readonly subjectId: number | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface RoommateReportCreationResult {
  readonly report: RoommateReportRecord;
  readonly created: boolean;
}

export interface RoommateSafetyRepository {
  readonly listMessages: (
    executor: SqlExecutor,
    interestId: number,
    limit: number,
    offset: number
  ) => Promise<readonly RoommateMessageRecord[]>;
  readonly findMessageById: (
    executor: SqlExecutor,
    messageId: number,
    forUpdate?: boolean
  ) => Promise<RoommateMessageRecord | null>;
  readonly createMessage: (
    executor: SqlExecutor,
    input: { readonly interestId: number; readonly senderTenantId: number; readonly body: string }
  ) => Promise<RoommateMessageRecord>;
  readonly markMessagesRead: (executor: SqlExecutor, interestId: number, recipientTenantId: number) => Promise<number>;
  readonly createNotification: (
    executor: SqlExecutor,
    input: {
      readonly recipientId: number;
      readonly eventType: RoommateNotificationEvent;
      readonly interestId: number;
      readonly dedupeKey: string;
      readonly refreshOnDuplicate?: boolean;
    }
  ) => Promise<void>;
  readonly findBlock: (
    executor: SqlExecutor,
    blockerTenantId: number,
    blockedTenantId: number,
    requestId?: number,
    forUpdate?: boolean
  ) => Promise<RoommateBlockRecord | null>;
  readonly createBlock: (
    executor: SqlExecutor,
    input: { readonly blockerTenantId: number; readonly blockedTenantId: number; readonly requestId: number }
  ) => Promise<void>;
  readonly deleteBlock: (
    executor: SqlExecutor,
    input: { readonly blockerTenantId: number; readonly blockedTenantId: number; readonly requestId?: number }
  ) => Promise<void>;
  readonly applyBlockEffects: (
    executor: SqlExecutor,
    blockerTenantId: number,
    blockedTenantId: number
  ) => Promise<number>;
  readonly findActiveReport: (
    executor: SqlExecutor,
    input: {
      readonly reporterTenantId: number;
      readonly requestId: number;
      readonly targetType: RoommateReportTargetType;
      readonly subjectTenantId: number | null;
      readonly messageId: number | null;
    }
  ) => Promise<RoommateReportRecord | null>;
  readonly createReport: (
    executor: SqlExecutor,
    input: {
      readonly reporterTenantId: number;
      readonly requestId: number;
      readonly targetType: RoommateReportTargetType;
      readonly subjectTenantId: number | null;
      readonly messageId: number | null;
      readonly category: RoommateReportCategory;
      readonly details: string | null;
      readonly evidenceSnapshot: Readonly<Record<string, unknown>>;
    }
  ) => Promise<RoommateReportCreationResult>;
  readonly listReports: (
    executor: SqlExecutor,
    input: {
      readonly status: RoommateReportStatus;
      readonly category: RoommateReportCategory | null;
      readonly limit: number;
      readonly offset: number;
    }
  ) => Promise<readonly RoommateReportRecord[]>;
  readonly findReport: (
    executor: SqlExecutor,
    reportId: number,
    forUpdate?: boolean
  ) => Promise<RoommateReportRecord | null>;
  readonly updateReportStatus: (
    executor: SqlExecutor,
    reportId: number,
    status: RoommateReportStatus,
    adminId: number,
    note: string | null
  ) => Promise<RoommateReportRecord>;
  readonly appendReportEvent: (
    executor: SqlExecutor,
    input: {
      readonly reportId: number;
      readonly actorId: number;
      readonly actorRole: "TENANT" | "LANDLORD" | "ADMIN";
      readonly previousStatus: RoommateReportStatus | null;
      readonly newStatus: RoommateReportStatus;
      readonly note: string | null;
    }
  ) => Promise<RoommateReportEvent>;
  readonly appendModerationEvent: (
    executor: SqlExecutor,
    input: {
      readonly reportId: number;
      readonly actorId: number;
      readonly targetType: RoommateReportTargetType;
      readonly subjectId: number;
      readonly state: RoommateModerationState;
      readonly note: string;
    }
  ) => Promise<RoommateReportEvent>;
  readonly listReportEvents: (executor: SqlExecutor, reportId: number) => Promise<readonly RoommateReportEvent[]>;
  readonly findProfileModeration: (
    executor: SqlExecutor,
    tenantId: number,
    forUpdate?: boolean
  ) => Promise<RoommateModerationState | null>;
  readonly findRequestModeration: (
    executor: SqlExecutor,
    requestId: number,
    forUpdate?: boolean
  ) => Promise<RoommateModerationState | null>;
  readonly findMessageModeration: (
    executor: SqlExecutor,
    messageId: number,
    forUpdate?: boolean
  ) => Promise<RoommateModerationState | null>;
  readonly updateProfileModeration: (
    executor: SqlExecutor,
    tenantId: number,
    state: RoommateModerationState
  ) => Promise<RoommateModerationState | null>;
  readonly updateRequestModeration: (
    executor: SqlExecutor,
    requestId: number,
    state: RoommateModerationState
  ) => Promise<RoommateModerationState | null>;
  readonly updateMessageModeration: (
    executor: SqlExecutor,
    messageId: number,
    state: RoommateModerationState
  ) => Promise<RoommateModerationState | null>;
}

interface MessageRow extends QueryResultRow {
  id: unknown;
  interest_id: unknown;
  sender_tenant_id: unknown;
  body: unknown;
  moderation_state: unknown;
  created_at: unknown;
  read_at: unknown;
}

interface BlockRow extends QueryResultRow {
  blocker_id: unknown;
  blocked_id: unknown;
  roommate_request_id: unknown;
}

interface ReportRow extends QueryResultRow {
  id: unknown;
  reporter_id: unknown;
  roommate_request_id: unknown;
  roommate_message_id: unknown;
  subject_tenant_id: unknown;
  target_type: unknown;
  category: unknown;
  details: unknown;
  evidence_snapshot: unknown;
  status: unknown;
  resolution_note: unknown;
  assigned_admin_id: unknown;
  created_at: unknown;
  updated_at: unknown;
  resolved_at: unknown;
  inserted_id?: unknown;
}

interface EventRow extends QueryResultRow {
  id: unknown;
  actor_id: unknown;
  actor_role: unknown;
  event_type: unknown;
  previous_status: unknown;
  new_status: unknown;
  subject_type: unknown;
  subject_id: unknown;
  note: unknown;
  created_at: unknown;
}

interface StateRow extends QueryResultRow {
  state: unknown;
}

const messageColumns = `id, interest_id, sender_tenant_id, body, moderation_state, created_at, read_at`;
const reportColumns = `
  id, reporter_id, roommate_request_id, roommate_message_id, subject_tenant_id, target_type,
  category, details, evidence_snapshot, status, resolution_note, assigned_admin_id,
  created_at, updated_at, resolved_at
`;

function positiveId(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return parsed;
}

function nullableId(value: unknown, field: string): number | null {
  return value === null || value === undefined ? null : positiveId(value, field);
}

function timestamp(value: unknown, field: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  try {
    return formatApiTimestamp(date);
  } catch {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
}

function nullableTimestamp(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : timestamp(value, field);
}

function nullableText(value: unknown, field: string): string | null {
  if (value !== null && value !== undefined && typeof value !== "string") {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value === undefined ? null : (value as string | null);
}

function moderationState(value: unknown, field: string): RoommateModerationState {
  if (value !== "VISIBLE" && value !== "HIDDEN") throw new RepositoryInvariantError(`${field} is invalid.`);
  return value;
}

function reportTarget(value: unknown): RoommateReportTargetType {
  if (value !== "ROOMMATE_PROFILE" && value !== "ROOMMATE_REQUEST" && value !== "ROOMMATE_MESSAGE") {
    throw new RepositoryInvariantError("roommateReport.targetType is invalid.");
  }
  return value;
}

function reportCategory(value: unknown): RoommateReportCategory {
  if (
    value !== "FRAUD" &&
    value !== "PAYMENT_SCAM" &&
    value !== "SPAM" &&
    value !== "HARASSMENT" &&
    value !== "IMPERSONATION" &&
    value !== "INAPPROPRIATE_CONTENT" &&
    value !== "OTHER"
  ) {
    throw new RepositoryInvariantError("roommateReport.category is invalid.");
  }
  return value;
}

function reportStatus(value: unknown): RoommateReportStatus {
  if (value !== "OPEN" && value !== "INVESTIGATING" && value !== "RESOLVED" && value !== "DISMISSED") {
    throw new RepositoryInvariantError("roommateReport.status is invalid.");
  }
  return value;
}

function evidence(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RepositoryInvariantError("roommateReport.evidenceSnapshot is invalid.");
  }
  return Object.freeze({ ...(value as Record<string, unknown>) });
}

function mapMessage(row: Readonly<MessageRow>): RoommateMessageRecord {
  if (typeof row.body !== "string") throw new RepositoryInvariantError("roommateMessage.body is invalid.");
  return Object.freeze({
    id: positiveId(row.id, "roommateMessage.id"),
    interestId: positiveId(row.interest_id, "roommateMessage.interestId"),
    senderTenantId: positiveId(row.sender_tenant_id, "roommateMessage.senderTenantId"),
    body: row.body,
    moderationState: moderationState(row.moderation_state, "roommateMessage.moderationState"),
    createdAt: timestamp(row.created_at, "roommateMessage.createdAt"),
    readAt: nullableTimestamp(row.read_at, "roommateMessage.readAt")
  });
}

function mapBlock(row: Readonly<BlockRow>): RoommateBlockRecord {
  return Object.freeze({
    blockerTenantId: positiveId(row.blocker_id, "roommateBlock.blockerTenantId"),
    blockedTenantId: positiveId(row.blocked_id, "roommateBlock.blockedTenantId"),
    requestId: positiveId(row.roommate_request_id, "roommateBlock.requestId")
  });
}

function mapReport(row: Readonly<ReportRow>): RoommateReportRecord {
  const messageId = nullableId(row.roommate_message_id, "roommateReport.messageId");
  const subjectTenantId = nullableId(row.subject_tenant_id, "roommateReport.subjectTenantId");
  const targetType = reportTarget(row.target_type);
  if (
    (targetType === "ROOMMATE_PROFILE" && (subjectTenantId === null || messageId !== null)) ||
    (targetType === "ROOMMATE_REQUEST" && (subjectTenantId !== null || messageId !== null)) ||
    (targetType === "ROOMMATE_MESSAGE" && (subjectTenantId !== null || messageId === null))
  ) {
    throw new RepositoryInvariantError("roommateReport target representation is invalid.");
  }
  return Object.freeze({
    id: positiveId(row.id, "roommateReport.id"),
    reporterTenantId: positiveId(row.reporter_id, "roommateReport.reporterTenantId"),
    requestId: positiveId(row.roommate_request_id, "roommateReport.requestId"),
    messageId,
    subjectTenantId,
    targetType,
    category: reportCategory(row.category),
    details: nullableText(row.details, "roommateReport.details"),
    evidenceSnapshot: evidence(row.evidence_snapshot),
    status: reportStatus(row.status),
    resolutionNote: nullableText(row.resolution_note, "roommateReport.resolutionNote"),
    assignedAdminId: nullableId(row.assigned_admin_id, "roommateReport.assignedAdminId"),
    createdAt: timestamp(row.created_at, "roommateReport.createdAt"),
    updatedAt: timestamp(row.updated_at, "roommateReport.updatedAt"),
    resolvedAt: nullableTimestamp(row.resolved_at, "roommateReport.resolvedAt")
  });
}

function mapEvent(row: Readonly<EventRow>): RoommateReportEvent {
  if (row.actor_role !== "TENANT" && row.actor_role !== "LANDLORD" && row.actor_role !== "ADMIN") {
    throw new RepositoryInvariantError("roommateReportEvent.actorRole is invalid.");
  }
  if (row.event_type !== "STATUS" && row.event_type !== "SUBJECT_HIDDEN" && row.event_type !== "SUBJECT_RESTORED") {
    throw new RepositoryInvariantError("roommateReportEvent.eventType is invalid.");
  }
  const previousStatus = row.previous_status === null ? null : reportStatus(row.previous_status);
  const newStatus =
    row.event_type === "STATUS"
      ? reportStatus(row.new_status)
      : row.event_type === "SUBJECT_HIDDEN"
        ? "SUBJECT_HIDDEN"
        : "SUBJECT_RESTORED";
  const subjectType = row.subject_type === null ? null : reportTarget(row.subject_type);
  const subjectId = nullableId(row.subject_id, "roommateReportEvent.subjectId");
  return Object.freeze({
    id: positiveId(row.id, "roommateReportEvent.id"),
    actorId: positiveId(row.actor_id, "roommateReportEvent.actorId"),
    actorRole: row.actor_role,
    eventType: row.event_type,
    previousStatus,
    newStatus,
    subjectType,
    subjectId,
    note: nullableText(row.note, "roommateReportEvent.note"),
    createdAt: timestamp(row.created_at, "roommateReportEvent.createdAt")
  });
}

function reportTargetPredicate(
  input: {
    readonly targetType: RoommateReportTargetType;
    readonly subjectTenantId: number | null;
    readonly messageId: number | null;
  },
  startIndex = 1
): { readonly clause: string; readonly values: readonly unknown[] } {
  const values: unknown[] = [input.targetType, input.subjectTenantId, input.messageId];
  return {
    clause: `target_type = $${startIndex} AND subject_tenant_id IS NOT DISTINCT FROM $${startIndex + 1} AND roommate_message_id IS NOT DISTINCT FROM $${startIndex + 2}`,
    values
  };
}

export function createRoommateSafetyRepository(): RoommateSafetyRepository {
  const repository: RoommateSafetyRepository = {
    listMessages(executor, interestId, limit, offset) {
      return queryMany<MessageRow, RoommateMessageRecord>(
        executor,
        {
          text: `
            SELECT ${messageColumns}
            FROM roommate_messages
            WHERE interest_id = $1
            ORDER BY created_at ASC, id ASC
            LIMIT $2 OFFSET $3
          `,
          values: [interestId, limit, offset]
        },
        mapMessage
      );
    },

    findMessageById(executor, messageId, forUpdate = false) {
      return queryOptional<MessageRow, RoommateMessageRecord>(
        executor,
        {
          text: `SELECT ${messageColumns} FROM roommate_messages WHERE id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: [messageId]
        },
        mapMessage
      );
    },

    createMessage(executor, input) {
      return queryExactlyOne<MessageRow, RoommateMessageRecord>(
        executor,
        {
          text: `
            INSERT INTO roommate_messages (interest_id, sender_tenant_id, body)
            VALUES ($1, $2, $3)
            RETURNING ${messageColumns}
          `,
          values: [input.interestId, input.senderTenantId, input.body]
        },
        mapMessage
      );
    },

    async markMessagesRead(executor, interestId, recipientTenantId) {
      return executeCommand(executor, {
        text: `
          UPDATE roommate_messages
          SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
          WHERE interest_id = $1
            AND sender_tenant_id <> $2
            AND read_at IS NULL
        `,
        values: [interestId, recipientTenantId]
      });
    },

    async createNotification(executor, input) {
      await executeCommand(executor, {
        text: `
          INSERT INTO notifications (
            recipient_id, event_type, roommate_interest_id, resource_path, dedupe_key
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO ${input.refreshOnDuplicate ? "UPDATE SET is_read = false, created_at = CURRENT_TIMESTAMP" : "NOTHING"}
        `,
        values: [
          input.recipientId,
          input.eventType,
          input.interestId,
          `/roommate-interests/${input.interestId}`,
          input.dedupeKey
        ]
      });
    },

    findBlock(executor, blockerTenantId, blockedTenantId, requestId, forUpdate = false) {
      const context =
        requestId === undefined ? " AND roommate_request_id IS NOT NULL" : " AND roommate_request_id = $3";
      return queryOptional<BlockRow, RoommateBlockRecord>(
        executor,
        {
          text: `
            SELECT blocker_id, blocked_id, roommate_request_id
            FROM contact_blocks
            WHERE blocker_id = $1 AND blocked_id = $2${context}
            ${forUpdate ? "FOR UPDATE" : ""}
          `,
          values:
            requestId === undefined ? [blockerTenantId, blockedTenantId] : [blockerTenantId, blockedTenantId, requestId]
        },
        mapBlock
      );
    },

    async createBlock(executor, input) {
      await executeCommand(executor, {
        text: `
          INSERT INTO contact_blocks (blocker_id, blocked_id, roommate_request_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (blocker_id, blocked_id) DO NOTHING
        `,
        values: [input.blockerTenantId, input.blockedTenantId, input.requestId]
      });
    },

    async deleteBlock(executor, input) {
      const context =
        input.requestId === undefined ? " AND roommate_request_id IS NOT NULL" : " AND roommate_request_id = $3";
      await executeCommand(executor, {
        text: `
          DELETE FROM contact_blocks
          WHERE blocker_id = $1 AND blocked_id = $2${context}
        `,
        values:
          input.requestId === undefined
            ? [input.blockerTenantId, input.blockedTenantId]
            : [input.blockerTenantId, input.blockedTenantId, input.requestId]
      });
    },

    async applyBlockEffects(executor, blockerTenantId, blockedTenantId) {
      const rows = await queryMany<{ id: unknown }, { readonly id: number }>(
        executor,
        {
          text: `
            UPDATE roommate_interests i
            SET status = CASE
                  WHEN i.status = 'ACCEPTED' THEN 'LEFT'
                  WHEN r.owner_tenant_id = $1 THEN 'REJECTED'
                  ELSE 'WITHDRAWN'
                END,
                ended_at = CURRENT_TIMESTAMP,
                ended_by_tenant_id = $1,
                terminal_reason = 'PARTICIPANT_BLOCKED',
                updated_at = CURRENT_TIMESTAMP
            FROM roommate_requests r
            WHERE i.request_id = r.id
              AND i.status IN ('PENDING', 'ACCEPTED')
              AND (
                (r.owner_tenant_id = $1 AND i.interested_tenant_id = $2)
                OR (r.owner_tenant_id = $2 AND i.interested_tenant_id = $1)
              )
            RETURNING i.id
          `,
          values: [blockerTenantId, blockedTenantId]
        },
        (row) => ({ id: positiveId(row.id, "roommateInterest.id") })
      );
      return rows.length;
    },

    findActiveReport(executor, input) {
      const profileTarget = input.targetType === "ROOMMATE_PROFILE";
      const target = reportTargetPredicate(input, profileTarget ? 2 : 3);
      const contextClause = profileTarget ? "reporter_id = $1" : "reporter_id = $1 AND roommate_request_id = $2";
      return queryOptional<ReportRow, RoommateReportRecord>(
        executor,
        {
          text: `
            SELECT ${reportColumns}
            FROM contact_reports
            WHERE source = 'ROOMMATE'
              AND ${contextClause}
              AND status IN ('OPEN', 'INVESTIGATING')
              AND ${target.clause}
            ORDER BY id DESC
            LIMIT 1
          `,
          values: profileTarget
            ? [input.reporterTenantId, ...target.values]
            : [input.reporterTenantId, input.requestId, ...target.values]
        },
        mapReport
      );
    },

    async createReport(executor, input) {
      const inserted = await executor.query<{ inserted_id: unknown }>({
        text: `
          INSERT INTO contact_reports (
            inquiry_id, reporter_id, source, roommate_request_id, roommate_message_id,
            subject_tenant_id, target_type, category, details, evidence_snapshot
          ) VALUES (
            NULL, $1, 'ROOMMATE', $2, $3, $4, $5, $6, $7, $8::jsonb
          )
          ON CONFLICT DO NOTHING
          RETURNING id AS inserted_id
        `,
        values: [
          input.reporterTenantId,
          input.requestId,
          input.messageId,
          input.subjectTenantId,
          input.targetType,
          input.category,
          input.details,
          JSON.stringify(input.evidenceSnapshot)
        ]
      });
      const insertedId = inserted.rows[0]?.inserted_id;
      if (insertedId !== undefined) {
        const row = await queryExactlyOne<ReportRow, RoommateReportRecord>(
          executor,
          {
            text: `SELECT ${reportColumns} FROM contact_reports WHERE source = 'ROOMMATE' AND id = $1`,
            values: [insertedId]
          },
          mapReport
        );
        return Object.freeze({ report: row, created: true });
      }

      const profileTarget = input.targetType === "ROOMMATE_PROFILE";
      const target = reportTargetPredicate(
        {
          targetType: input.targetType,
          subjectTenantId: input.subjectTenantId,
          messageId: input.messageId
        },
        profileTarget ? 2 : 3
      );
      const existing = await queryOptional<ReportRow, RoommateReportRecord>(
        executor,
        {
          text: `
            SELECT ${reportColumns}
            FROM contact_reports
            WHERE source = 'ROOMMATE'
              AND ${profileTarget ? "reporter_id = $1" : "reporter_id = $1 AND roommate_request_id = $2"}
              AND status IN ('OPEN', 'INVESTIGATING')
              AND ${target.clause}
            ORDER BY id DESC
            LIMIT 1
          `,
          values: profileTarget
            ? [input.reporterTenantId, ...target.values]
            : [input.reporterTenantId, input.requestId, ...target.values]
        },
        mapReport
      );
      if (!existing)
        throw new RepositoryInvariantError("Roommate report could not be loaded after a duplicate insert.");
      return Object.freeze({ report: existing, created: false });
    },

    listReports(executor, input) {
      const values: unknown[] = [input.status];
      const categoryClause = input.category === null ? "" : ` AND category = $${values.push(input.category)}`;
      const limitIndex = values.push(input.limit);
      const offsetIndex = values.push(input.offset);
      return queryMany<ReportRow, RoommateReportRecord>(
        executor,
        {
          text: `
            SELECT ${reportColumns}
            FROM contact_reports
            WHERE source = 'ROOMMATE' AND status = $1${categoryClause}
            ORDER BY created_at DESC, id DESC
            LIMIT $${limitIndex} OFFSET $${offsetIndex}
          `,
          values
        },
        mapReport
      );
    },

    findReport(executor, reportId, forUpdate = false) {
      return queryOptional<ReportRow, RoommateReportRecord>(
        executor,
        {
          text: `
            SELECT ${reportColumns}
            FROM contact_reports
            WHERE source = 'ROOMMATE' AND id = $1
            ${forUpdate ? "FOR UPDATE" : ""}
          `,
          values: [reportId]
        },
        mapReport
      );
    },

    updateReportStatus(executor, reportId, status, adminId, note) {
      const terminal = status === "RESOLVED" || status === "DISMISSED";
      return queryExactlyOne<ReportRow, RoommateReportRecord>(
        executor,
        {
          text: `
            UPDATE contact_reports
            SET status = $2,
                assigned_admin_id = $3,
                resolution_note = CASE WHEN $4::boolean THEN $5 ELSE NULL END,
                resolved_at = CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
                updated_at = CURRENT_TIMESTAMP
            WHERE source = 'ROOMMATE' AND id = $1
            RETURNING ${reportColumns}
          `,
          values: [reportId, status, adminId, terminal, note]
        },
        mapReport
      );
    },

    appendReportEvent(executor, input) {
      return queryExactlyOne<EventRow, RoommateReportEvent>(
        executor,
        {
          text: `
            INSERT INTO contact_report_events (
              report_id, actor_id, actor_role, previous_status, new_status, note, event_type
            ) VALUES ($1, $2, $3, $4, $5, $6, 'STATUS')
            RETURNING id, actor_id, actor_role, event_type, previous_status, new_status,
                      subject_type, subject_id, note, created_at
          `,
          values: [input.reportId, input.actorId, input.actorRole, input.previousStatus, input.newStatus, input.note]
        },
        mapEvent
      );
    },

    appendModerationEvent(executor, input) {
      const eventType = input.state === "HIDDEN" ? "SUBJECT_HIDDEN" : "SUBJECT_RESTORED";
      return queryExactlyOne<EventRow, RoommateReportEvent>(
        executor,
        {
          text: `
            INSERT INTO contact_report_events (
              report_id, actor_id, actor_role, previous_status, new_status, note,
              event_type, subject_type, subject_id
            ) VALUES ($1, $2, 'ADMIN', NULL, $3, $4, $3, $5, $6)
            RETURNING id, actor_id, actor_role, event_type, previous_status, new_status,
                      subject_type, subject_id, note, created_at
          `,
          values: [input.reportId, input.actorId, eventType, input.note, input.targetType, input.subjectId]
        },
        mapEvent
      );
    },

    listReportEvents(executor, reportId) {
      return queryMany<EventRow, RoommateReportEvent>(
        executor,
        {
          text: `
            SELECT id, actor_id, actor_role, event_type, previous_status, new_status,
                   subject_type, subject_id, note, created_at
            FROM contact_report_events
            WHERE report_id = $1
            ORDER BY created_at ASC, id ASC
          `,
          values: [reportId]
        },
        mapEvent
      );
    },

    findProfileModeration(executor, tenantId, forUpdate = false) {
      return queryOptional<StateRow, RoommateModerationState>(
        executor,
        {
          text: `SELECT moderation_state AS state FROM roommate_profiles WHERE tenant_id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: [tenantId]
        },
        (row) => moderationState(row.state, "roommateProfile.moderationState")
      );
    },

    findRequestModeration(executor, requestId, forUpdate = false) {
      return queryOptional<StateRow, RoommateModerationState>(
        executor,
        {
          text: `SELECT moderation_state AS state FROM roommate_requests WHERE id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: [requestId]
        },
        (row) => moderationState(row.state, "roommateRequest.moderationState")
      );
    },

    findMessageModeration(executor, messageId, forUpdate = false) {
      return queryOptional<StateRow, RoommateModerationState>(
        executor,
        {
          text: `SELECT moderation_state AS state FROM roommate_messages WHERE id = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
          values: [messageId]
        },
        (row) => moderationState(row.state, "roommateMessage.moderationState")
      );
    },

    updateProfileModeration(executor, tenantId, state) {
      return queryOptional<StateRow, RoommateModerationState>(
        executor,
        {
          text: `UPDATE roommate_profiles SET moderation_state = $2, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 RETURNING moderation_state AS state`,
          values: [tenantId, state]
        },
        (row) => moderationState(row.state, "roommateProfile.moderationState")
      );
    },

    updateRequestModeration(executor, requestId, state) {
      return queryOptional<StateRow, RoommateModerationState>(
        executor,
        {
          text: `UPDATE roommate_requests SET moderation_state = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING moderation_state AS state`,
          values: [requestId, state]
        },
        (row) => moderationState(row.state, "roommateRequest.moderationState")
      );
    },

    updateMessageModeration(executor, messageId, state) {
      return queryOptional<StateRow, RoommateModerationState>(
        executor,
        {
          text: `UPDATE roommate_messages SET moderation_state = $2 WHERE id = $1 RETURNING moderation_state AS state`,
          values: [messageId, state]
        },
        (row) => moderationState(row.state, "roommateMessage.moderationState")
      );
    }
  };
  return Object.freeze(repository);
}
