import type { QueryResultRow } from "pg";
import { executeCommand, queryMany, RepositoryInvariantError } from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";

const reminderNotificationEvent = "LEAD_REMINDER_DUE" as const;
const reminderResourcePath = (inquiryId: number): string => `/inquiries/${inquiryId}`;

interface DueReminderRow extends QueryResultRow {
  inquiry_id: unknown;
  landlord_id: unknown;
}

export interface LeadReminderNotificationRepository {
  readonly createDueNotifications: (executor: SqlExecutor, now: Date, limit: number) => Promise<number>;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RepositoryInvariantError(`${field} is invalid.`);
  }
  return value as number;
}

function mapDueReminder(row: Readonly<DueReminderRow>): { readonly inquiryId: number; readonly landlordId: number } {
  return Object.freeze({
    inquiryId: positiveInteger(row.inquiry_id, "leadReminder.inquiryId"),
    landlordId: positiveInteger(row.landlord_id, "leadReminder.landlordId")
  });
}

function validateBatchLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RepositoryInvariantError("lead reminder notification batch limit is invalid.");
  }
}

export function createLeadReminderNotificationRepository(): LeadReminderNotificationRepository {
  const repository: LeadReminderNotificationRepository = {
    async createDueNotifications(executor, now, limit) {
      validateBatchLimit(limit);
      if (Number.isNaN(now.getTime())) throw new RepositoryInvariantError("lead reminder notification time is invalid.");

      const dueReminders = await queryMany<DueReminderRow, { readonly inquiryId: number; readonly landlordId: number }>(
        executor,
        {
          text: `
            SELECT reminders.inquiry_id, reminders.landlord_id
            FROM landlord_lead_reminders AS reminders
            JOIN listing_inquiries AS inquiries ON inquiries.id = reminders.inquiry_id
            WHERE reminders.remind_at <= $1
              AND reminders.due_notification_sent_at IS NULL
              AND inquiries.status <> 'CLOSED'
            ORDER BY reminders.remind_at ASC, reminders.inquiry_id ASC
            LIMIT $2
            FOR UPDATE OF reminders, inquiries SKIP LOCKED
          `,
          values: [now, limit]
        },
        mapDueReminder
      );

      for (const reminder of dueReminders) {
        await executeCommand(executor, {
          text: `
            INSERT INTO notifications (recipient_id, event_type, inquiry_id, resource_path)
            VALUES ($1, $2, $3, $4)
          `,
          values: [
            reminder.landlordId,
            reminderNotificationEvent,
            reminder.inquiryId,
            reminderResourcePath(reminder.inquiryId)
          ]
        });

        const updated = await executeCommand(executor, {
          text: `
            UPDATE landlord_lead_reminders
            SET due_notification_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE inquiry_id = $1 AND due_notification_sent_at IS NULL
          `,
          values: [reminder.inquiryId]
        });
        if (updated !== 1) throw new RepositoryInvariantError("Due lead reminder was not marked as notified.");
      }

      return dueReminders.length;
    }
  };
  return Object.freeze(repository);
}
