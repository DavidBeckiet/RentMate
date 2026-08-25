import assert from "node:assert/strict";
import test from "node:test";
import {
  createEngagementNotificationClient,
  type ListingModerationNotificationInput,
  type ListingPublishedNotificationInput
} from "../../shared/engagement-notification-client.js";

test("sends a listing moderation notification with the internal token", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(null, { status: 204 });
  };
  const input: ListingModerationNotificationInput = {
    landlordId: 30,
    listingId: 42,
    moderationHistoryId: 301,
    eventType: "LISTING_APPROVED"
  };

  await createEngagementNotificationClient({
    baseUrl: "http://engagement:4300/",
    internalToken: "internal-secret",
    fetcher
  }).notifyListingModerationResult(input);

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "http://engagement:4300/internal/v1/notifications/listing-moderation");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(
    requests[0]?.init?.headers && new Headers(requests[0].init.headers).get("x-rentmate-internal-token"),
    "internal-secret"
  );
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), input);
});

test("turns a non-success response into a safe delivery error", async () => {
  const client = createEngagementNotificationClient({
    baseUrl: "http://engagement:4300",
    internalToken: "internal-secret",
    fetcher: async () => new Response(null, { status: 503 })
  });

  await assert.rejects(
    () =>
      client.notifyListingModerationResult({
        landlordId: 30,
        listingId: 42,
        moderationHistoryId: 301,
        eventType: "LISTING_REJECTED"
      }),
    { message: "Engagement service notification request failed." }
  );
});

test("sends a listing-published notification request", async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const input: ListingPublishedNotificationInput = { listingId: 42 };
  const client = createEngagementNotificationClient({
    baseUrl: "http://engagement:4300",
    internalToken: "internal-secret",
    fetcher: async (request, init) => {
      requests.push({ url: String(request), init });
      return new Response(null, { status: 204 });
    }
  });

  await client.notifyListingPublished(input);

  assert.equal(requests[0]?.url, "http://engagement:4300/internal/v1/notifications/listing-published");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), input);
});
