import { afterEach, describe, expect, it, vi } from "vitest";
import { createTransport } from "./transport";
import { connectInquiryRealtime, parseInquiryRealtimeEvent } from "./inquiry-realtime";

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

describe("inquiry realtime client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    FakeEventSource.instances.length = 0;
  });

  it("parses only valid inquiry events", () => {
    expect(parseInquiryRealtimeEvent('{"type":"CONNECTED","inquiryId":7}')).toEqual({
      type: "CONNECTED",
      inquiryId: 7
    });
    expect(
      parseInquiryRealtimeEvent(
        '{"type":"MESSAGE_CREATED","inquiryId":7,"message":{"id":9,"senderRole":"TENANT","body":"Xin chào","isRead":false,"createdAt":"2026-08-24T01:00:00.000Z"}}'
      )
    ).toMatchObject({ type: "MESSAGE_CREATED", inquiryId: 7, message: { id: 9, body: "Xin chào" } });
    expect(
      parseInquiryRealtimeEvent(
        '{"type":"STATUS_CHANGED","inquiryId":7,"status":"CLOSED","updatedAt":"2026-08-24T01:01:00.000Z"}'
      )
    ).toEqual({
      type: "STATUS_CHANGED",
      inquiryId: 7,
      status: "CLOSED",
      updatedAt: "2026-08-24T01:01:00.000Z"
    });

    expect(parseInquiryRealtimeEvent("not json")).toBeNull();
    expect(parseInquiryRealtimeEvent('{"type":"CONNECTED","inquiryId":0}')).toBeNull();
    expect(
      parseInquiryRealtimeEvent(
        '{"type":"MESSAGE_CREATED","inquiryId":7,"message":{"id":9,"senderRole":"ADMIN","body":"x","isRead":false,"createdAt":"invalid"}}'
      )
    ).toBeNull();
  });

  it("uses a credentialed EventSource and reports connection changes", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const onEvent = vi.fn();
    const onStatusChange = vi.fn();
    const connection = connectInquiryRealtime(7, { onEvent, onStatusChange });
    const source = FakeEventSource.instances[0]!;

    expect(source.url).toBe("http://localhost:4001/api/v1/inquiries/7/events");
    expect(source.withCredentials).toBe(true);
    source.onopen?.();
    source.onmessage?.(new MessageEvent("message", { data: '{"type":"CONNECTED","inquiryId":7}' }));
    source.onerror?.();

    expect(onStatusChange.mock.calls).toEqual([["connected"], ["reconnecting"]]);
    expect(onEvent).toHaveBeenCalledWith({ type: "CONNECTED", inquiryId: 7 });

    connection.close();
    expect(source.closed).toBe(true);
    source.onerror?.();
    expect(onStatusChange).toHaveBeenCalledTimes(2);
  });

  it("uses the same configured Gateway origin for REST and SSE", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:4100/");
    vi.stubGlobal("EventSource", FakeEventSource);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 7 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await createTransport({ fetcher }).object("/api/v1/users/me");
    connectInquiryRealtime(7, { onEvent: vi.fn(), onStatusChange: vi.fn() });

    const restUrl = String(fetcher.mock.calls[0]?.[0]);
    const eventSource = FakeEventSource.instances[0]!;
    expect(new URL(restUrl).origin).toBe("http://localhost:4100");
    expect(new URL(eventSource.url).origin).toBe(new URL(restUrl).origin);
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
    expect(eventSource.withCredentials).toBe(true);
  });

  it("falls back without breaking messaging when EventSource is unavailable", () => {
    vi.stubGlobal("EventSource", undefined);
    const onStatusChange = vi.fn();
    const connection = connectInquiryRealtime(7, { onEvent: vi.fn(), onStatusChange });

    expect(onStatusChange).toHaveBeenCalledWith("unsupported");
    expect(() => connection.close()).not.toThrow();
  });
});
