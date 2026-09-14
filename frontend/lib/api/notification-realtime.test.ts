import { afterEach, describe, expect, it, vi } from "vitest";
import { connectNotificationRealtime, parseNotificationRealtimeEvent } from "./notification-realtime";

class FakeEventSource {
  static readonly instances: FakeEventSource[] = [];

  readonly url: string;
  readonly withCredentials: boolean;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  closed = false;

  constructor(url: string | URL, options?: EventSourceInit) {
    this.url = String(url);
    this.withCredentials = options?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

const notificationJson = JSON.stringify({
  type: "NOTIFICATION_CREATED",
  notification: {
    id: 12,
    eventType: "MESSAGE_CREATED",
    inquiryId: 7,
    listingId: 31,
    roommateRequestId: null,
    roommateInterestId: null,
    resourcePath: "/inquiries/7",
    isRead: false,
    createdAt: "2026-09-11T08:00:00.000Z"
  }
});

describe("notification realtime client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    FakeEventSource.instances.length = 0;
  });

  it("accepts valid notification events and rejects malformed payloads", () => {
    expect(parseNotificationRealtimeEvent('{"type":"CONNECTED","userId":7}')).toEqual({
      type: "CONNECTED",
      userId: 7
    });
    expect(parseNotificationRealtimeEvent(notificationJson)).toMatchObject({
      type: "NOTIFICATION_CREATED",
      notification: { id: 12, eventType: "MESSAGE_CREATED" }
    });
    expect(parseNotificationRealtimeEvent("not json")).toBeNull();
    expect(parseNotificationRealtimeEvent('{"type":"CONNECTED","userId":0}')).toBeNull();
    expect(
      parseNotificationRealtimeEvent(
        '{"type":"NOTIFICATION_CREATED","notification":{"id":12,"eventType":"UNKNOWN","isRead":false}}'
      )
    ).toBeNull();
  });

  it("uses a credentialed EventSource and reports connection changes", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const onEvent = vi.fn();
    const onStatusChange = vi.fn();
    const connection = connectNotificationRealtime(7, { onEvent, onStatusChange });
    const source = FakeEventSource.instances[0]!;

    expect(source.url).toBe("http://localhost:4001/api/v1/notifications/events");
    expect(source.withCredentials).toBe(true);
    source.onopen?.();
    source.onmessage?.(new MessageEvent("message", { data: '{"type":"CONNECTED","userId":7}' }));
    source.onmessage?.(new MessageEvent("message", { data: notificationJson }));
    source.onerror?.();

    expect(onStatusChange.mock.calls).toEqual([["connected"], ["reconnecting"]]);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "NOTIFICATION_CREATED", notification: expect.objectContaining({ id: 12 }) })
    );

    connection.close();
    expect(source.closed).toBe(true);
    source.onerror?.();
    expect(onStatusChange).toHaveBeenCalledTimes(2);
  });

  it("fails safely when EventSource is unavailable", () => {
    vi.stubGlobal("EventSource", undefined);
    const onStatusChange = vi.fn();
    const connection = connectNotificationRealtime(7, { onEvent: vi.fn(), onStatusChange });

    expect(onStatusChange).toHaveBeenCalledWith("unsupported");
    expect(() => connection.close()).not.toThrow();
  });
});
