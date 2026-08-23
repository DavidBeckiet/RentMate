import assert from "node:assert/strict";
import test from "node:test";
import { createInquiryRealtimeHub } from "../src/modules/contact/realtime/inquiry-realtime-hub.js";

test("publishes inquiry events only to current subscribers of that conversation", () => {
  const hub = createInquiryRealtimeHub();
  const received: string[] = [];
  const unsubscribe = hub.subscribe(7, (event) => received.push(event.type));
  hub.subscribe(8, (event) => received.push(`other:${event.type}`));

  hub.publish({ type: "CONNECTED", inquiryId: 7 });
  assert.deepEqual(received, ["CONNECTED"]);
  assert.equal(hub.subscriberCount(7), 1);

  unsubscribe();
  hub.publish({
    type: "MESSAGE_CREATED",
    inquiryId: 7,
    message: {
      id: 11,
      senderRole: "TENANT",
      body: "Xin chào.",
      isRead: false,
      createdAt: "2026-08-24T00:00:00.000Z"
    }
  });
  assert.deepEqual(received, ["CONNECTED"]);
  assert.equal(hub.subscriberCount(7), 0);
});

test("isolates subscriber failures from committed message publication", () => {
  const hub = createInquiryRealtimeHub();
  const received: string[] = [];
  hub.subscribe(7, () => {
    throw new Error("disconnected client");
  });
  hub.subscribe(7, (event) => received.push(event.type));

  assert.doesNotThrow(() => hub.publish({ type: "CONNECTED", inquiryId: 7 }));
  assert.deepEqual(received, ["CONNECTED"]);
});
