import type { QueryResultRow } from "pg";
import {
  executeCommand,
  queryMany,
  RepositoryInvariantError
} from "../../../../../shared/src/runtime/db/repository-primitives.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import { mapNullablePgTimestamptz, mapPgTimestamptz } from "../../../../../shared/src/runtime/db/value-mappers.js";
import { isListingBusinessStatus, type ListingBusinessStatus } from "../../../../../shared/listing-business-status.js";
import { isListingStatus, type ListingStatus } from "../mappers/owner-listing-mapper.js";

const maximumListingId = 2_147_483_647;

export type ListingAvailabilityNotificationKind = "REMINDER_DUE" | "AUTO_PAUSED";
type NotificationDeliveryMarker = "REMINDER" | "AUTO_PAUSED";

interface DueListingRow extends QueryResultRow {
  readonly id: unknown;
  readonly landlord_id: unknown;
  readonly status: unknown;
  readonly business_status: unknown;
  readonly availability_confirmed_at: unknown;
  readonly availability_reminder_sent_at: unknown;
  readonly availability_reminder_notified_at: unknown;
  readonly availability_auto_paused_at: unknown;
  readonly created_at: unknown;
}

interface DueListing {
  readonly id: number;
  readonly landlordId: number;
  readonly status: ListingStatus;
  readonly businessStatus: ListingBusinessStatus;
  readonly availabilityConfirmedAt: Date | null;
  readonly availabilityReminderSentAt: Date | null;
  readonly availabilityReminderNotifiedAt: Date | null;
  readonly availabilityAutoPausedAt: Date | null;
  readonly createdAt: Date;
}

export interface ListingAvailabilityNotificationJob {
  readonly listingId: number;
  readonly landlordId: number;
  readonly kind: ListingAvailabilityNotificationKind;
  readonly dedupeKey: string;
  readonly deliveryMarker: NotificationDeliveryMarker;
  readonly deliveryAt: Date;
}

export interface ListingAvailabilityScanInput {
  readonly now: Date;
  readonly reminderDays: number;
  readonly graceDays: number;
  readonly limit: number;
}

export interface ListingAvailabilityRepository {
  readonly processDueListings: (
    executor: SqlExecutor,
    input: ListingAvailabilityScanInput
  ) => Promise<readonly ListingAvailabilityNotificationJob[]>;
  readonly markNotificationDelivered: (
    executor: SqlExecutor,
    job: ListingAvailabilityNotificationJob
  ) => Promise<void>;
}

function mapDueListing(row: Readonly<DueListingRow>): DueListing {
  if (
    !Number.isSafeInteger(row.id) ||
    (row.id as number) < 1 ||
    (row.id as number) > maximumListingId ||
    !Number.isSafeInteger(row.landlord_id) ||
    (row.landlord_id as number) < 1 ||
    !isListingStatus(row.status) ||
    !isListingBusinessStatus(row.business_status)
  ) {
    throw new RepositoryInvariantError("Listing availability row is invalid.");
  }

  return Object.freeze({
    id: row.id as number,
    landlordId: row.landlord_id as number,
    status: row.status,
    businessStatus: row.business_status,
    availabilityConfirmedAt: mapNullablePgTimestamptz(
      row.availability_confirmed_at,
      "availability_confirmed_at"
    ),
    availabilityReminderSentAt: mapNullablePgTimestamptz(
      row.availability_reminder_sent_at,
      "availability_reminder_sent_at"
    ),
    availabilityReminderNotifiedAt: mapNullablePgTimestamptz(
      row.availability_reminder_notified_at,
      "availability_reminder_notified_at"
    ),
    availabilityAutoPausedAt: mapNullablePgTimestamptz(
      row.availability_auto_paused_at,
      "availability_auto_paused_at"
    ),
    createdAt: mapPgTimestamptz(row.created_at, "created_at")
  });
}

function notificationJob(
  listing: DueListing,
  kind: ListingAvailabilityNotificationKind,
  deliveryMarker: NotificationDeliveryMarker,
  deliveryAt: Date
): ListingAvailabilityNotificationJob {
  return Object.freeze({
    listingId: listing.id,
    landlordId: listing.landlordId,
    kind,
    dedupeKey: `listing-availability:${listing.id}:${kind}:${deliveryAt.toISOString()}`,
    deliveryMarker,
    deliveryAt: new Date(deliveryAt.getTime())
  });
}

export function createListingAvailabilityRepository(): ListingAvailabilityRepository {
  return Object.freeze({
    async processDueListings(executorForTransaction: SqlExecutor, input: ListingAvailabilityScanInput) {
      const rows = await queryMany<DueListingRow, DueListing>(
        executorForTransaction,
        {
          text: `
            SELECT
              id,
              landlord_id,
              status,
              business_status,
              availability_confirmed_at,
              availability_reminder_sent_at,
              availability_reminder_notified_at,
              availability_auto_paused_at,
              created_at
            FROM listings
            WHERE status = 'APPROVED'
              AND (
                (
                  business_status IN ('AVAILABLE', 'UNKNOWN')
                  AND availability_reminder_sent_at IS NULL
                  AND (
                    availability_confirmed_at IS NULL
                    OR availability_confirmed_at <= $1::timestamptz - ($2::integer * INTERVAL '1 day')
                  )
                )
                OR (
                  business_status IN ('AVAILABLE', 'UNKNOWN')
                  AND availability_reminder_sent_at IS NOT NULL
                  AND availability_reminder_notified_at IS NULL
                )
                OR (
                  business_status IN ('AVAILABLE', 'UNKNOWN')
                  AND availability_reminder_sent_at IS NOT NULL
                  AND availability_auto_paused_at IS NULL
                  AND availability_reminder_sent_at <= $1::timestamptz - ($3::integer * INTERVAL '1 day')
                )
                OR (
                  business_status = 'PAUSED'
                  AND availability_auto_paused_at IS NOT NULL
                  AND availability_reminder_notified_at IS NULL
                )
              )
            ORDER BY
              COALESCE(availability_reminder_sent_at, availability_confirmed_at, created_at) ASC,
              id ASC
            LIMIT $4
            FOR UPDATE SKIP LOCKED
          `,
          values: [input.now, input.reminderDays, input.graceDays, input.limit]
        },
        mapDueListing
      );
      const jobs: ListingAvailabilityNotificationJob[] = [];
      const graceCutoff = input.now.getTime() - input.graceDays * 86_400_000;

      for (const listing of rows) {
        const reminderSentAt = listing.availabilityReminderSentAt;
        const autoPauseDue =
          reminderSentAt !== null &&
          listing.availabilityAutoPausedAt === null &&
          reminderSentAt.getTime() <= graceCutoff &&
          (listing.businessStatus === "AVAILABLE" || listing.businessStatus === "UNKNOWN");

        if (autoPauseDue) {
          const autoPausedRows = await executeCommand(executorForTransaction, {
            text: `
              UPDATE listings
              SET
                business_status = 'PAUSED',
                availability_auto_paused_at = $2,
                updated_at = $2
              WHERE id = $1
                AND status = 'APPROVED'
                AND business_status IN ('AVAILABLE', 'UNKNOWN')
                AND availability_reminder_sent_at IS NOT NULL
                AND availability_auto_paused_at IS NULL
            `,
            values: [listing.id, input.now]
          });
          if (autoPausedRows !== 1) {
            throw new RepositoryInvariantError("Listing auto-pause affected an invalid number of rows.");
          }
          jobs.push(notificationJob(listing, "AUTO_PAUSED", "AUTO_PAUSED", input.now));
          continue;
        }

        if (listing.businessStatus === "PAUSED" && listing.availabilityAutoPausedAt !== null) {
          jobs.push(notificationJob(listing, "AUTO_PAUSED", "AUTO_PAUSED", listing.availabilityAutoPausedAt));
          continue;
        }

        const deliveryAt = reminderSentAt ?? input.now;
        if (reminderSentAt === null) {
          const reminderRows = await executeCommand(executorForTransaction, {
            text: `
              UPDATE listings
              SET availability_reminder_sent_at = $2
              WHERE id = $1
                AND availability_reminder_sent_at IS NULL
            `,
            values: [listing.id, input.now]
          });
          if (reminderRows !== 1) {
            throw new RepositoryInvariantError("Listing availability reminder affected an invalid number of rows.");
          }
        }
        jobs.push(notificationJob(listing, "REMINDER_DUE", "REMINDER", deliveryAt));
      }

      return Object.freeze(jobs);
    },

    async markNotificationDelivered(
      executorForTransaction: SqlExecutor,
      job: ListingAvailabilityNotificationJob
    ) {
      const query =
        job.deliveryMarker === "REMINDER"
          ? {
              text: `
                UPDATE listings
                SET availability_reminder_notified_at = CURRENT_TIMESTAMP
                WHERE id = $1
                  AND availability_reminder_sent_at = $2
                  AND availability_reminder_notified_at IS NULL
              `,
              values: [job.listingId, job.deliveryAt]
            }
          : {
              text: `
                UPDATE listings
                SET availability_reminder_notified_at = CURRENT_TIMESTAMP
                WHERE id = $1
                  AND availability_auto_paused_at = $2
                  AND availability_reminder_notified_at IS NULL
              `,
              values: [job.listingId, job.deliveryAt]
            };
      await executeCommand(executorForTransaction, query);
    }
  });
}
