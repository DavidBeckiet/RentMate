import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { validateBodyFields } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { ListingModerationNotificationEvent } from "../repositories/contact-repository.js";

const maximumPostgresIntegerId = 2_147_483_647;
const listingModerationEvents: readonly ListingModerationNotificationEvent[] = [
  "LISTING_APPROVED",
  "LISTING_REJECTED",
  "LISTING_HIDDEN"
];
const listingAvailabilityKinds = ["REMINDER_DUE", "AUTO_PAUSED"] as const;
type ListingAvailabilityNotificationKind = (typeof listingAvailabilityKinds)[number];

export interface ListingModerationNotificationInput {
  readonly landlordId: number;
  readonly listingId: number;
  readonly moderationHistoryId: number;
  readonly eventType: ListingModerationNotificationEvent;
}

export interface ListingPublishedNotificationInput {
  readonly listingId: number;
}

export interface ListingAvailabilityNotificationInput {
  readonly landlordId: number;
  readonly listingId: number;
  readonly kind: ListingAvailabilityNotificationKind;
  readonly dedupeKey: string;
}

function parsePositiveId(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a positive integer.`);
  }
  if ((value as number) < 1 || (value as number) > maximumPostgresIntegerId) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} is outside the allowed range.`);
  }
  return value as number;
}

export function validateListingModerationNotificationBody(value: unknown): ListingModerationNotificationInput {
  const body = validateBodyFields(value, ["landlordId", "listingId", "moderationHistoryId", "eventType"]);
  if (!("landlordId" in body)) throwValidationIssue("landlordId", "REQUIRED", "landlordId is required.");
  if (!("listingId" in body)) throwValidationIssue("listingId", "REQUIRED", "listingId is required.");
  if (!("moderationHistoryId" in body)) {
    throwValidationIssue("moderationHistoryId", "REQUIRED", "moderationHistoryId is required.");
  }
  if (!("eventType" in body)) throwValidationIssue("eventType", "REQUIRED", "eventType is required.");
  if (
    typeof body.eventType !== "string" ||
    !listingModerationEvents.includes(body.eventType as ListingModerationNotificationEvent)
  ) {
    throwValidationIssue("eventType", "INVALID_VALUE", "eventType is not supported.");
  }

  return Object.freeze({
    landlordId: parsePositiveId(body.landlordId, "landlordId"),
    listingId: parsePositiveId(body.listingId, "listingId"),
    moderationHistoryId: parsePositiveId(body.moderationHistoryId, "moderationHistoryId"),
    eventType: body.eventType as ListingModerationNotificationEvent
  });
}

export function validateListingPublishedNotificationBody(value: unknown): ListingPublishedNotificationInput {
  const body = validateBodyFields(value, ["listingId"]);
  if (!("listingId" in body)) throwValidationIssue("listingId", "REQUIRED", "listingId is required.");
  return Object.freeze({ listingId: parsePositiveId(body.listingId, "listingId") });
}

export function validateListingAvailabilityNotificationBody(value: unknown): ListingAvailabilityNotificationInput {
  const body = validateBodyFields(value, ["landlordId", "listingId", "kind", "dedupeKey"]);
  if (!("landlordId" in body)) throwValidationIssue("landlordId", "REQUIRED", "landlordId is required.");
  if (!("listingId" in body)) throwValidationIssue("listingId", "REQUIRED", "listingId is required.");
  if (!("kind" in body)) throwValidationIssue("kind", "REQUIRED", "kind is required.");
  if (!("dedupeKey" in body)) throwValidationIssue("dedupeKey", "REQUIRED", "dedupeKey is required.");
  if (
    typeof body.kind !== "string" ||
    !listingAvailabilityKinds.includes(body.kind as ListingAvailabilityNotificationKind)
  ) {
    throwValidationIssue("kind", "INVALID_VALUE", "kind is not supported.");
  }
  if (typeof body.dedupeKey !== "string") {
    throwValidationIssue("dedupeKey", "INVALID_TYPE", "dedupeKey must be a string.");
  }
  const dedupeKey = body.dedupeKey.trim();
  if (dedupeKey.length === 0) throwValidationIssue("dedupeKey", "INVALID_VALUE", "dedupeKey must not be blank.");
  if (dedupeKey.length > 200) throwValidationIssue("dedupeKey", "TOO_LONG", "dedupeKey is too long.");

  return Object.freeze({
    landlordId: parsePositiveId(body.landlordId, "landlordId"),
    listingId: parsePositiveId(body.listingId, "listingId"),
    kind: body.kind as ListingAvailabilityNotificationKind,
    dedupeKey
  });
}
