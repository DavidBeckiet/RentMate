import type { InquiryMessage, InquiryStatus } from "../../types/api";

export type InquiryRealtimeEvent =
  | Readonly<{ type: "CONNECTED"; inquiryId: number }>
  | Readonly<{ type: "MESSAGE_CREATED"; inquiryId: number; message: InquiryMessage }>
  | Readonly<{ type: "STATUS_CHANGED"; inquiryId: number; status: InquiryStatus; updatedAt: string }>;

export type InquiryRealtimeConnectionStatus = "connecting" | "connected" | "reconnecting" | "unsupported";

interface InquiryRealtimeHandlers {
  readonly onEvent: (event: InquiryRealtimeEvent) => void;
  readonly onStatusChange: (status: InquiryRealtimeConnectionStatus) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isInquiryStatus(value: unknown): value is InquiryStatus {
  return value === "NEW" || value === "CONTACTED" || value === "CLOSED";
}

function parseMessage(value: unknown): InquiryMessage | null {
  if (!isRecord(value)) return null;
  if (
    !isPositiveInteger(value.id) ||
    (value.senderRole !== "TENANT" && value.senderRole !== "LANDLORD") ||
    typeof value.body !== "string" ||
    typeof value.isRead !== "boolean" ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(new Date(value.createdAt).getTime())
  ) {
    return null;
  }
  return {
    id: value.id,
    senderRole: value.senderRole,
    body: value.body,
    isRead: value.isRead,
    createdAt: value.createdAt
  };
}

export function parseInquiryRealtimeEvent(value: string): InquiryRealtimeEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isPositiveInteger(parsed.inquiryId) || typeof parsed.type !== "string") return null;
  if (parsed.type === "CONNECTED") return { type: "CONNECTED", inquiryId: parsed.inquiryId };
  if (parsed.type === "MESSAGE_CREATED") {
    const message = parseMessage(parsed.message);
    return message === null ? null : { type: "MESSAGE_CREATED", inquiryId: parsed.inquiryId, message };
  }
  if (
    parsed.type === "STATUS_CHANGED" &&
    isInquiryStatus(parsed.status) &&
    typeof parsed.updatedAt === "string" &&
    !Number.isNaN(new Date(parsed.updatedAt).getTime())
  ) {
    return {
      type: "STATUS_CHANGED",
      inquiryId: parsed.inquiryId,
      status: parsed.status,
      updatedAt: parsed.updatedAt
    };
  }
  return null;
}

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/+$/, "");
}

export function connectInquiryRealtime(
  inquiryId: number,
  handlers: InquiryRealtimeHandlers
): Readonly<{ close: () => void }> {
  if (typeof EventSource === "undefined") {
    handlers.onStatusChange("unsupported");
    return Object.freeze({ close: () => undefined });
  }

  const source = new EventSource(`${apiBaseUrl()}/api/v1/inquiries/${inquiryId}/events`, {
    withCredentials: true
  });
  let closed = false;
  source.onopen = () => {
    if (!closed) handlers.onStatusChange("connected");
  };
  source.onerror = () => {
    if (!closed) handlers.onStatusChange("reconnecting");
  };
  source.onmessage = (event) => {
    if (closed) return;
    const parsed = parseInquiryRealtimeEvent(event.data);
    if (parsed) handlers.onEvent(parsed);
  };

  return Object.freeze({
    close() {
      if (closed) return;
      closed = true;
      source.close();
    }
  });
}
