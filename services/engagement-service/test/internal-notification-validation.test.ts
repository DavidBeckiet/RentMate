import assert from "node:assert/strict";
import test from "node:test";
import {
  validateListingAvailabilityNotificationBody,
  validateListingModerationNotificationBody,
  validateListingPublishedNotificationBody
} from "../src/modules/contact/validations/internal-notification-validation.js";

test("normalizes a valid listing moderation notification payload", () => {
  assert.deepEqual(
    validateListingModerationNotificationBody({
      landlordId: 30,
      listingId: 42,
      moderationHistoryId: 301,
      eventType: "LISTING_APPROVED"
    }),
    {
      landlordId: 30,
      listingId: 42,
      moderationHistoryId: 301,
      eventType: "LISTING_APPROVED"
    }
  );
});

test("rejects unsupported events, invalid ids, and unknown fields", () => {
  assert.throws(
    () =>
      validateListingModerationNotificationBody({
        landlordId: 30,
        listingId: 42,
        moderationHistoryId: 301,
        eventType: "INQUIRY_CREATED"
      }),
    /invalid data/i
  );
  assert.throws(
    () =>
      validateListingModerationNotificationBody({
        landlordId: 0,
        listingId: 42,
        moderationHistoryId: 301,
        eventType: "LISTING_HIDDEN"
      }),
    /invalid data/i
  );
  assert.throws(
    () =>
      validateListingModerationNotificationBody({
        landlordId: 30,
        listingId: 42,
        moderationHistoryId: 301,
        eventType: "LISTING_REJECTED",
        extra: true
      }),
    /invalid data/i
  );
});

test("validates a listing-published notification payload", () => {
  assert.deepEqual(validateListingPublishedNotificationBody({ listingId: 42 }), { listingId: 42 });
  assert.throws(() => validateListingPublishedNotificationBody({ listingId: 0 }), /invalid data/i);
  assert.throws(() => validateListingPublishedNotificationBody({ listingId: 42, extra: true }), /invalid data/i);
});

test("validates a listing availability notification payload", () => {
  assert.deepEqual(
    validateListingAvailabilityNotificationBody({
      landlordId: 30,
      listingId: 42,
      kind: "AUTO_PAUSED",
      dedupeKey: " listing-availability:42:AUTO_PAUSED:2026-08-25T00:00:00.000Z "
    }),
    {
      landlordId: 30,
      listingId: 42,
      kind: "AUTO_PAUSED",
      dedupeKey: "listing-availability:42:AUTO_PAUSED:2026-08-25T00:00:00.000Z"
    }
  );
  assert.throws(
    () => validateListingAvailabilityNotificationBody({ landlordId: 30, listingId: 42, kind: "UNKNOWN", dedupeKey: "x" }),
    /invalid data/i
  );
  assert.throws(
    () => validateListingAvailabilityNotificationBody({ landlordId: 30, listingId: 42, kind: "REMINDER_DUE", dedupeKey: " " }),
    /invalid data/i
  );
});
