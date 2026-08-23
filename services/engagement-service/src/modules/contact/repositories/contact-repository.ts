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
import type { InquiryStatus } from "../validations/contact-validation.js";

export interface InquiryMessage {
  readonly id: number;
  readonly senderRole: "TENANT" | "LANDLORD";
  readonly body: string;
  readonly isRead: boolean;
  readonly createdAt: string;
}

export interface Inquiry {
  readonly id: number;
  readonly tenantId: number;
  readonly landlordId: number;
  readonly listingId: number;
  readonly status: InquiryStatus;
  readonly contactPhone: string | null;
  readonly preferredContactAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly InquiryMessage[];
}

export interface Notification {
  readonly id: number;
  readonly eventType: "INQUIRY_CREATED" | "MESSAGE_CREATED" | "INQUIRY_STATUS_CHANGED";
  readonly inquiryId: number;
  readonly resourcePath: string;
  readonly isRead: boolean;
  readonly createdAt: string;
}

interface InquiryRow extends QueryResultRow {
  id: unknown;
  tenant_id: unknown;
  landlord_id: unknown;
  listing_id: unknown;
  status: unknown;
  contact_phone: unknown;
  preferred_contact_at: unknown;
  created_at: unknown;
  updated_at: unknown;
}

interface MessageRow extends QueryResultRow {
  id: unknown;
  sender_role: unknown;
  body: unknown;
  tenant_read_at: unknown;
  landlord_read_at: unknown;
  created_at: unknown;
}

interface NotificationRow extends QueryResultRow {
  id: unknown;
  event_type: unknown;
  inquiry_id: unknown;
  resource_path: unknown;
  is_read: unknown;
  created_at: unknown;
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new RepositoryInvariantError(`${name} is invalid.`);
  return value as number;
}

function timestamp(value: unknown, name: string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  try {
    return formatApiTimestamp(date);
  } catch {
    throw new RepositoryInvariantError(`${name} is invalid.`);
  }
}

function nullableTimestamp(value: unknown, name: string): string | null {
  return value === null || value === undefined ? null : timestamp(value, name);
}

function mapInquiry(row: Readonly<InquiryRow>, messages: readonly InquiryMessage[] = []): Inquiry {
  if (
    typeof row.status !== "string" ||
    !["NEW", "CONTACTED", "CLOSED"].includes(row.status) ||
    (row.contact_phone !== null && typeof row.contact_phone !== "string")
  ) {
    throw new RepositoryInvariantError("Inquiry representation is invalid.");
  }
  return Object.freeze({
    id: positiveInteger(row.id, "inquiry.id"),
    tenantId: positiveInteger(row.tenant_id, "inquiry.tenant_id"),
    landlordId: positiveInteger(row.landlord_id, "inquiry.landlord_id"),
    listingId: positiveInteger(row.listing_id, "inquiry.listing_id"),
    status: row.status as InquiryStatus,
    contactPhone: row.contact_phone as string | null,
    preferredContactAt: nullableTimestamp(row.preferred_contact_at, "inquiry.preferred_contact_at"),
    createdAt: timestamp(row.created_at, "inquiry.created_at"),
    updatedAt: timestamp(row.updated_at, "inquiry.updated_at"),
    messages: Object.freeze([...messages])
  });
}

function mapMessage(row: Readonly<MessageRow>, viewerRole: "TENANT" | "LANDLORD"): InquiryMessage {
  if ((row.sender_role !== "TENANT" && row.sender_role !== "LANDLORD") || typeof row.body !== "string") {
    throw new RepositoryInvariantError("Inquiry message representation is invalid.");
  }
  const readAt = viewerRole === "TENANT" ? row.tenant_read_at : row.landlord_read_at;
  return Object.freeze({
    id: positiveInteger(row.id, "message.id"),
    senderRole: row.sender_role,
    body: row.body,
    isRead: readAt !== null,
    createdAt: timestamp(row.created_at, "message.created_at")
  });
}

function mapNotification(row: Readonly<NotificationRow>): Notification {
  if (
    !["INQUIRY_CREATED", "MESSAGE_CREATED", "INQUIRY_STATUS_CHANGED"].includes(String(row.event_type)) ||
    typeof row.resource_path !== "string" ||
    typeof row.is_read !== "boolean"
  ) {
    throw new RepositoryInvariantError("Notification representation is invalid.");
  }
  return Object.freeze({
    id: positiveInteger(row.id, "notification.id"),
    eventType: row.event_type as Notification["eventType"],
    inquiryId: positiveInteger(row.inquiry_id, "notification.inquiry_id"),
    resourcePath: row.resource_path,
    isRead: row.is_read,
    createdAt: timestamp(row.created_at, "notification.created_at")
  });
}

export interface ContactRepository {
  readonly createInquiry: (
    executor: SqlExecutor,
    input: {
      readonly tenantId: number;
      readonly landlordId: number;
      readonly listingId: number;
      readonly contactPhone: string | null;
      readonly preferredContactAt: string | null;
    }
  ) => Promise<Inquiry>;
  readonly findOpenInquiry: (executor: SqlExecutor, tenantId: number, listingId: number) => Promise<Inquiry | null>;
  readonly findInquiryForUpdate: (executor: SqlExecutor, inquiryId: number) => Promise<Inquiry | null>;
  readonly listInquiries: (
    executor: SqlExecutor,
    input: {
      readonly actorId: number;
      readonly role: "TENANT" | "LANDLORD";
      readonly pageSize: number;
      readonly offset: number;
    }
  ) => Promise<readonly Inquiry[]>;
  readonly listMessages: (
    executor: SqlExecutor,
    inquiryId: number,
    viewerRole: "TENANT" | "LANDLORD"
  ) => Promise<readonly InquiryMessage[]>;
  readonly appendMessage: (
    executor: SqlExecutor,
    input: {
      readonly inquiryId: number;
      readonly senderId: number;
      readonly senderRole: "TENANT" | "LANDLORD";
      readonly body: string;
    }
  ) => Promise<InquiryMessage>;
  readonly updateStatus: (executor: SqlExecutor, inquiryId: number, status: InquiryStatus) => Promise<Inquiry>;
  readonly markMessagesRead: (executor: SqlExecutor, inquiryId: number, role: "TENANT" | "LANDLORD") => Promise<void>;
  readonly createNotification: (
    executor: SqlExecutor,
    input: {
      readonly recipientId: number;
      readonly eventType: Notification["eventType"];
      readonly inquiryId: number;
    }
  ) => Promise<Notification>;
  readonly listNotifications: (
    executor: SqlExecutor,
    input: {
      readonly recipientId: number;
      readonly pageSize: number;
      readonly offset: number;
    }
  ) => Promise<readonly Notification[]>;
  readonly markNotificationRead: (
    executor: SqlExecutor,
    recipientId: number,
    notificationId: number
  ) => Promise<boolean>;
  readonly markAllNotificationsRead: (executor: SqlExecutor, recipientId: number) => Promise<void>;
}

export function createContactRepository(): ContactRepository {
  const inquirySelect = `
    SELECT id, tenant_id, landlord_id, listing_id, status, contact_phone, preferred_contact_at, created_at, updated_at
    FROM listing_inquiries
  `;
  const repository: ContactRepository = {
    async createInquiry(executor, input) {
      return queryExactlyOne<InquiryRow, Inquiry>(
        executor,
        {
          text: `
          INSERT INTO listing_inquiries (tenant_id, landlord_id, listing_id, contact_phone, preferred_contact_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, tenant_id, landlord_id, listing_id, status, contact_phone, preferred_contact_at, created_at, updated_at
        `,
          values: [input.tenantId, input.landlordId, input.listingId, input.contactPhone, input.preferredContactAt]
        },
        (row) => mapInquiry(row)
      );
    },

    async findOpenInquiry(executor, tenantId, listingId) {
      return queryOptional<InquiryRow, Inquiry>(
        executor,
        {
          text: `${inquirySelect} WHERE tenant_id = $1 AND listing_id = $2 AND status <> 'CLOSED'`,
          values: [tenantId, listingId]
        },
        (row) => mapInquiry(row)
      );
    },

    async findInquiryForUpdate(executor, inquiryId) {
      return queryOptional<InquiryRow, Inquiry>(
        executor,
        {
          text: `${inquirySelect} WHERE id = $1 FOR UPDATE`,
          values: [inquiryId]
        },
        (row) => mapInquiry(row)
      );
    },

    async listInquiries(executor, input) {
      const actorColumn = input.role === "TENANT" ? "tenant_id" : "landlord_id";
      return queryMany<InquiryRow, Inquiry>(
        executor,
        {
          text: `${inquirySelect} WHERE ${actorColumn} = $1 ORDER BY updated_at DESC, id DESC LIMIT $2 OFFSET $3`,
          values: [input.actorId, input.pageSize + 1, input.offset]
        },
        (row) => mapInquiry(row)
      );
    },

    async listMessages(executor, inquiryId, viewerRole) {
      return queryMany<MessageRow, InquiryMessage>(
        executor,
        {
          text: `SELECT id, sender_role, body, tenant_read_at, landlord_read_at, created_at FROM inquiry_messages WHERE inquiry_id = $1 ORDER BY created_at ASC, id ASC`,
          values: [inquiryId]
        },
        (row) => mapMessage(row, viewerRole)
      );
    },

    async appendMessage(executor, input) {
      return queryExactlyOne<MessageRow, InquiryMessage>(
        executor,
        {
          text: `
          INSERT INTO inquiry_messages (inquiry_id, sender_id, sender_role, body)
          VALUES ($1, $2, $3, $4)
          RETURNING id, sender_role, body, tenant_read_at, landlord_read_at, created_at
        `,
          values: [input.inquiryId, input.senderId, input.senderRole, input.body]
        },
        (row) => mapMessage(row, input.senderRole)
      );
    },

    async updateStatus(executor, inquiryId, status) {
      return queryExactlyOne<InquiryRow, Inquiry>(
        executor,
        {
          text: `
          UPDATE listing_inquiries
          SET status = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, tenant_id, landlord_id, listing_id, status, contact_phone, preferred_contact_at, created_at, updated_at
        `,
          values: [inquiryId, status]
        },
        (row) => mapInquiry(row)
      );
    },

    async markMessagesRead(executor, inquiryId, role) {
      const column = role === "TENANT" ? "tenant_read_at" : "landlord_read_at";
      await executeCommand(executor, {
        text: `UPDATE inquiry_messages SET ${column} = CURRENT_TIMESTAMP WHERE inquiry_id = $1 AND ${column} IS NULL`,
        values: [inquiryId]
      });
    },

    async createNotification(executor, input) {
      return queryExactlyOne<NotificationRow, Notification>(
        executor,
        {
          text: `
          INSERT INTO notifications (recipient_id, event_type, inquiry_id, resource_path)
          VALUES ($1, $2, $3, $4)
          RETURNING id, event_type, inquiry_id, resource_path, is_read, created_at
        `,
          values: [input.recipientId, input.eventType, input.inquiryId, `/inquiries/${input.inquiryId}`]
        },
        mapNotification
      );
    },

    async listNotifications(executor, input) {
      return queryMany<NotificationRow, Notification>(
        executor,
        {
          text: `
          SELECT id, event_type, inquiry_id, resource_path, is_read, created_at
          FROM notifications
          WHERE recipient_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3
        `,
          values: [input.recipientId, input.pageSize + 1, input.offset]
        },
        mapNotification
      );
    },

    async markNotificationRead(executor, recipientId, notificationId) {
      return executeCommand(executor, {
        text: `UPDATE notifications SET is_read = true WHERE id = $1 AND recipient_id = $2`,
        values: [notificationId, recipientId]
      }).then((affected) => affected === 1);
    },

    async markAllNotificationsRead(executor, recipientId) {
      await executeCommand(executor, {
        text: `UPDATE notifications SET is_read = true WHERE recipient_id = $1 AND is_read = false`,
        values: [recipientId]
      });
    }
  };
  return Object.freeze(repository);
}
