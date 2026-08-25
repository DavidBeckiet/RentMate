import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { validateBodyFields } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { ListingModerationNotificationEvent } from "../repositories/contact-repository.js";

const maximumPostgresIntegerId = 2_147_483_647;
const listingModerationEvents: readonly ListingModerationNotificationEvent[] = [
  "LISTING_APPROVED",
  "LISTING_REJECTED",
  "LISTING_HIDDEN"
];

export interface ListingModerationNotificationInput {
  readonly landlordId: number;
  readonly listingId: number;
  readonly moderationHistoryId: number;
  readonly eventType: ListingModerationNotificationEvent;
}

export interface ListingPublishedNotificationInput {
  readonly listingId: number;
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
