import assert from "node:assert/strict";
import test from "node:test";
import { parseNotificationRealtimeEvent } from "../src/modules/contact/realtime/notification-realtime-listener.js";
import { createNotificationRealtimeHub } from "../src/modules/contact/realtime/notification-realtime-hub.js";

const notification = {
  id: 12,
  eventType: "MESSAGE_CREATED" as const,
  inquiryId: 7,
  listingId: 31,
  roommateRequestId: null,
  roommateInterestId: null,
  resourcePath: "/inquiries/7",
  isRead: false,
  createdAt: "2026-09-11T08:00:00.000Z"
};

test("publishes notification events only to subscribers of the recipient", () => {
  const hub = createNotificationRealtimeHub();
  const received: number[] = [];
  const unsubscribe = hub.subscribe(7, (event) => received.push(event.notification.id));
  hub.subscribe(8, (event) => received.push(event.notification.id + 100));

  hub.publish({ recipientId: 7, notification });
  assert.deepEqual(received, [12]);
  assert.equal(hub.subscriberCount(7), 1);

  unsubscribe();
  hub.publish({ recipientId: 7, notification: { ...notification, id: 13 } });
  assert.deepEqual(received, [12]);
  assert.equal(hub.subscriberCount(7), 0);
});

test("parses the committed notification projection and ignores malformed payloads", () => {
  assert.deepEqual(parseNotificationRealtimeEvent(JSON.stringify({ recipientId: 7, notification })), {
    recipientId: 7,
    notification
  });
  assert.equal(parseNotificationRealtimeEvent("not json"), null);
  assert.equal(parseNotificationRealtimeEvent(JSON.stringify({ recipientId: 0, notification })), null);
  assert.equal(
    parseNotificationRealtimeEvent(
      JSON.stringify({ recipientId: 7, notification: { ...notification, eventType: "UNKNOWN" } })
    ),
    null
  );
});

test("isolates subscriber failures from committed notification publication", () => {
  const hub = createNotificationRealtimeHub();
  const received: number[] = [];
  hub.subscribe(7, () => {
    throw new Error("disconnected client");
  });
  hub.subscribe(7, (event) => received.push(event.notification.id));

  assert.doesNotThrow(() => hub.publish({ recipientId: 7, notification }));
  assert.deepEqual(received, [12]);
});
