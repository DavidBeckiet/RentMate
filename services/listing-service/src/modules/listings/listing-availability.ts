import type { ListingBusinessStatus } from "../../../../shared/listing-business-status.js";
import type { ListingStatus } from "./mappers/owner-listing-mapper.js";

export const listingAvailabilityPolicy = Object.freeze({
  reminderDays: 30,
  graceDays: 7
});

export const listingAvailabilityStatuses = Object.freeze([
  "NOT_APPLICABLE",
  "CURRENT",
  "REMINDER_DUE",
  "AUTO_PAUSED"
] as const);

export type ListingAvailabilityStatus = (typeof listingAvailabilityStatuses)[number];

export interface ListingAvailabilityFields {
  readonly availabilityConfirmedAt: Date | null;
  readonly availabilityReminderSentAt: Date | null;
  readonly availabilityReminderNotifiedAt: Date | null;
  readonly availabilityAutoPausedAt: Date | null;
}

export interface ListingAvailabilitySnapshot {
  readonly availabilityStatus: ListingAvailabilityStatus;
  readonly availabilityConfirmedAt: Date | null;
  readonly availabilityExpiresAt: Date | null;
}

function validDate(value: Date | null, field: string): Date | null {
  if (value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(field + " is invalid.");
  }
  return new Date(value.getTime());
}

export function addDays(value: Date, days: number): Date {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isTrackedAvailability(
  status: ListingStatus,
  businessStatus: ListingBusinessStatus,
  fields: Pick<ListingAvailabilityFields, "availabilityAutoPausedAt">
): boolean {
  return (
    status === "APPROVED" &&
    (businessStatus === "AVAILABLE" ||
      businessStatus === "UNKNOWN" ||
      (businessStatus === "PAUSED" && fields.availabilityAutoPausedAt !== null))
  );
}

export function resolveListingAvailabilitySnapshot(
  input: {
    readonly status: ListingStatus;
    readonly businessStatus: ListingBusinessStatus;
  } & ListingAvailabilityFields,
  now = new Date(),
  reminderDays = listingAvailabilityPolicy.reminderDays
): ListingAvailabilitySnapshot {
  const confirmedAt = validDate(input.availabilityConfirmedAt, "availabilityConfirmedAt");
  const reminderSentAt = validDate(input.availabilityReminderSentAt, "availabilityReminderSentAt");
  const reminderNotifiedAt = validDate(
    input.availabilityReminderNotifiedAt,
    "availabilityReminderNotifiedAt"
  );
  const autoPausedAt = validDate(input.availabilityAutoPausedAt, "availabilityAutoPausedAt");
  if (!(now instanceof Date) || Number.isNaN(now.getTime()) || !Number.isInteger(reminderDays) || reminderDays < 1) {
    throw new Error("Listing availability policy is invalid.");
  }
  if (reminderNotifiedAt !== null && reminderSentAt === null) {
    throw new Error("availabilityReminderNotifiedAt requires availabilityReminderSentAt.");
  }

  if (!isTrackedAvailability(input.status, input.businessStatus, { availabilityAutoPausedAt: autoPausedAt })) {
    return Object.freeze({
      availabilityStatus: "NOT_APPLICABLE",
      availabilityConfirmedAt: null,
      availabilityExpiresAt: null
    });
  }

  if (input.businessStatus === "PAUSED" && autoPausedAt !== null) {
    return Object.freeze({
      availabilityStatus: "AUTO_PAUSED",
      availabilityConfirmedAt: confirmedAt,
      availabilityExpiresAt: confirmedAt === null ? null : addDays(confirmedAt, reminderDays)
    });
  }

  const expiresAt = confirmedAt === null ? null : addDays(confirmedAt, reminderDays);
  const reminderDue = confirmedAt === null || expiresAt === null || expiresAt.getTime() <= now.getTime();
  return Object.freeze({
    availabilityStatus: reminderSentAt !== null || reminderDue ? "REMINDER_DUE" : "CURRENT",
    availabilityConfirmedAt: confirmedAt,
    availabilityExpiresAt: expiresAt
  });
}
