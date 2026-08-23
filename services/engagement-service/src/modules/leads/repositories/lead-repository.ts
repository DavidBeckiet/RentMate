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
import type { InquiryStatus } from "../../contact/validations/contact-validation.js";
import type { LeadView } from "../validations/lead-validation.js";

export interface LandlordLead {
  readonly inquiryId: number;
  readonly listingId: number;
  readonly status: InquiryStatus;
  readonly contactPhone: string | null;
  readonly preferredContactAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastMessage: {
    readonly senderRole: "TENANT" | "LANDLORD";
    readonly snippet: string;
    readonly createdAt: string;
  } | null;
  readonly needsReply: boolean;
  readonly hasUnreadTenantMessages: boolean;
  readonly note: string | null;
  readonly noteUpdatedAt: string | null;
  readonly reminderAt: string | null;
  readonly reminderUpdatedAt: string | null;
}

export interface LeadNoteState {
  readonly inquiryId: number;
  readonly note: string | null;
  readonly updatedAt: string | null;
}

export interface LeadReminderState {
  readonly inquiryId: number;
  readonly remindAt: string | null;
  readonly updatedAt: string | null;
}

interface LeadRow extends QueryResultRow {
  inquiry_id: unknown;
  listing_id: unknown;
  status: unknown;
  contact_phone: unknown;
  preferred_contact_at: unknown;
  created_at: unknown;
  updated_at: unknown;
  last_sender_role: unknown;
  last_message_snippet: unknown;
  last_message_created_at: unknown;
  has_unread_tenant_messages: unknown;
  note: unknown;
  note_updated_at: unknown;
  reminder_at: unknown;
  reminder_updated_at: unknown;
}

interface InquiryOwnerRow extends QueryResultRow {
  inquiry_id: unknown;
}

interface NoteRow extends QueryResultRow {
  inquiry_id: unknown;
  note: unknown;
  updated_at: unknown;
}

interface ReminderRow extends QueryResultRow {
  inquiry_id: unknown;
  remind_at: unknown;
  updated_at: unknown;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new RepositoryInvariantError(`${field} is invalid.`);
  return value as number;
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
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value;
}

function isInquiryStatus(value: unknown): value is InquiryStatus {
  return value === "NEW" || value === "CONTACTED" || value === "CLOSED";
}

function mapLead(row: Readonly<LeadRow>): LandlordLead {
  if (
    !isInquiryStatus(row.status) ||
    (row.contact_phone !== null && typeof row.contact_phone !== "string") ||
    typeof row.has_unread_tenant_messages !== "boolean"
  ) {
    throw new RepositoryInvariantError("Landlord lead representation is invalid.");
  }
  const hasLastMessage = row.last_sender_role !== null;
  if (
    hasLastMessage &&
    (row.last_sender_role !== "TENANT" || typeof row.last_message_snippet !== "string") &&
    (row.last_sender_role !== "LANDLORD" || typeof row.last_message_snippet !== "string")
  ) {
    throw new RepositoryInvariantError("Landlord lead message representation is invalid.");
  }
  const lastMessage = hasLastMessage
    ? Object.freeze({
        senderRole: row.last_sender_role as "TENANT" | "LANDLORD",
        snippet: row.last_message_snippet as string,
        createdAt: timestamp(row.last_message_created_at, "lead.lastMessage.createdAt")
      })
    : null;
  return Object.freeze({
    inquiryId: positiveInteger(row.inquiry_id, "lead.inquiryId"),
    listingId: positiveInteger(row.listing_id, "lead.listingId"),
    status: row.status,
    contactPhone: row.contact_phone as string | null,
    preferredContactAt: nullableTimestamp(row.preferred_contact_at, "lead.preferredContactAt"),
    createdAt: timestamp(row.created_at, "lead.createdAt"),
    updatedAt: timestamp(row.updated_at, "lead.updatedAt"),
    lastMessage,
    needsReply: row.status !== "CLOSED" && lastMessage?.senderRole === "TENANT",
    hasUnreadTenantMessages: row.has_unread_tenant_messages,
    note: nullableText(row.note, "lead.note"),
    noteUpdatedAt: nullableTimestamp(row.note_updated_at, "lead.noteUpdatedAt"),
    reminderAt: nullableTimestamp(row.reminder_at, "lead.reminderAt"),
    reminderUpdatedAt: nullableTimestamp(row.reminder_updated_at, "lead.reminderUpdatedAt")
  });
}

function mapReminder(row: Readonly<ReminderRow>): LeadReminderState {
  return Object.freeze({
    inquiryId: positiveInteger(row.inquiry_id, "leadReminder.inquiryId"),
    remindAt: nullableTimestamp(row.remind_at, "leadReminder.remindAt"),
    updatedAt: nullableTimestamp(row.updated_at, "leadReminder.updatedAt")
  });
}

function mapNote(row: Readonly<NoteRow>): LeadNoteState {
  return Object.freeze({
    inquiryId: positiveInteger(row.inquiry_id, "leadNote.inquiryId"),
    note: nullableText(row.note, "leadNote.note"),
    updatedAt: nullableTimestamp(row.updated_at, "leadNote.updatedAt")
  });
}

const viewConditions: Readonly<Record<LeadView, string>> = Object.freeze({
  NEEDS_REPLY: "i.status <> 'CLOSED' AND latest.sender_role = 'TENANT'",
  REMINDERS: "reminders.inquiry_id IS NOT NULL",
  NEW: "i.status = 'NEW'",
  ACTIVE: "i.status = 'CONTACTED' AND latest.sender_role = 'LANDLORD'",
  CLOSED: "i.status = 'CLOSED'",
  ALL: "TRUE"
});

export interface LeadRepository {
  readonly list: (
    executor: SqlExecutor,
    landlordId: number,
    view: LeadView,
    limit: number,
    offset: number
  ) => Promise<readonly LandlordLead[]>;
  readonly lockOwnedInquiry: (executor: SqlExecutor, landlordId: number, inquiryId: number) => Promise<boolean>;
  readonly upsertNote: (
    executor: SqlExecutor,
    landlordId: number,
    inquiryId: number,
    note: string
  ) => Promise<LeadNoteState>;
  readonly deleteNote: (executor: SqlExecutor, landlordId: number, inquiryId: number) => Promise<void>;
  readonly upsertReminder: (
    executor: SqlExecutor,
    landlordId: number,
    inquiryId: number,
    remindAt: string
  ) => Promise<LeadReminderState>;
  readonly deleteReminder: (executor: SqlExecutor, landlordId: number, inquiryId: number) => Promise<void>;
}

export function createLeadRepository(): LeadRepository {
  const repository: LeadRepository = {
    list(executor, landlordId, view, limit, offset) {
      const order =
        view === "NEEDS_REPLY"
          ? "latest.created_at ASC, i.id ASC"
          : view === "REMINDERS"
            ? "reminders.remind_at ASC, i.id ASC"
            : "i.updated_at DESC, i.id DESC";
      return queryMany<LeadRow, LandlordLead>(
        executor,
        {
          text: `SELECT i.id AS inquiry_id, i.listing_id, i.status, i.contact_phone, i.preferred_contact_at,
            i.created_at, i.updated_at, latest.sender_role AS last_sender_role,
            latest.snippet AS last_message_snippet, latest.created_at AS last_message_created_at,
            EXISTS (
              SELECT 1 FROM inquiry_messages AS unread
              WHERE unread.inquiry_id = i.id AND unread.sender_role = 'TENANT' AND unread.landlord_read_at IS NULL
            ) AS has_unread_tenant_messages,
            notes.note, notes.updated_at AS note_updated_at,
            reminders.remind_at AS reminder_at, reminders.updated_at AS reminder_updated_at
            FROM listing_inquiries AS i
            LEFT JOIN LATERAL (
              SELECT sender_role, left(body, 240) AS snippet, created_at
              FROM inquiry_messages WHERE inquiry_id = i.id
              ORDER BY created_at DESC, id DESC LIMIT 1
            ) AS latest ON TRUE
            LEFT JOIN landlord_lead_notes AS notes ON notes.inquiry_id = i.id AND notes.landlord_id = i.landlord_id
            LEFT JOIN landlord_lead_reminders AS reminders
              ON reminders.inquiry_id = i.id AND reminders.landlord_id = i.landlord_id
            WHERE i.landlord_id = $1 AND ${viewConditions[view]}
            ORDER BY ${order} LIMIT $2 OFFSET $3`,
          values: [landlordId, limit, offset]
        },
        mapLead
      );
    },
    async lockOwnedInquiry(executor, landlordId, inquiryId) {
      const row = await queryOptional<InquiryOwnerRow, number>(
        executor,
        {
          text: "SELECT id AS inquiry_id FROM listing_inquiries WHERE id = $1 AND landlord_id = $2 FOR UPDATE",
          values: [inquiryId, landlordId]
        },
        (value) => positiveInteger(value.inquiry_id, "inquiry.id")
      );
      return row !== null;
    },
    upsertNote(executor, landlordId, inquiryId, note) {
      return queryExactlyOne<NoteRow, LeadNoteState>(
        executor,
        {
          text: `INSERT INTO landlord_lead_notes (inquiry_id, landlord_id, note)
            VALUES ($1, $2, $3)
            ON CONFLICT (inquiry_id) DO UPDATE
            SET note = EXCLUDED.note, landlord_id = EXCLUDED.landlord_id, updated_at = CURRENT_TIMESTAMP
            RETURNING inquiry_id, note, updated_at`,
          values: [inquiryId, landlordId, note]
        },
        mapNote
      );
    },
    async deleteNote(executor, landlordId, inquiryId) {
      await executeCommand(executor, {
        text: "DELETE FROM landlord_lead_notes WHERE inquiry_id = $1 AND landlord_id = $2",
        values: [inquiryId, landlordId]
      });
    },
    upsertReminder(executor, landlordId, inquiryId, remindAt) {
      return queryExactlyOne<ReminderRow, LeadReminderState>(
        executor,
        {
          text: `INSERT INTO landlord_lead_reminders (inquiry_id, landlord_id, remind_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (inquiry_id) DO UPDATE
            SET landlord_id = EXCLUDED.landlord_id, remind_at = EXCLUDED.remind_at,
              updated_at = CURRENT_TIMESTAMP
            RETURNING inquiry_id, remind_at, updated_at`,
          values: [inquiryId, landlordId, remindAt]
        },
        mapReminder
      );
    },
    async deleteReminder(executor, landlordId, inquiryId) {
      await executeCommand(executor, {
        text: "DELETE FROM landlord_lead_reminders WHERE inquiry_id = $1 AND landlord_id = $2",
        values: [inquiryId, landlordId]
      });
    }
  };
  return Object.freeze(repository);
}
