import assert from "node:assert/strict";
import test from "node:test";
import { validateListingModerationNotificationBody } from "../src/modules/contact/validations/internal-notification-validation.js";

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
