import type { Notification, NotificationEventType } from "../../types/api";
import { resolveApiBaseUrl } from "../config/api-base";

export type NotificationRealtimeEvent =
  | Readonly<{ type: "CONNECTED"; userId: number }>
  | Readonly<{ type: "NOTIFICATION_CREATED"; notification: Notification }>;

export type NotificationRealtimeConnectionStatus = "connecting" | "connected" | "reconnecting" | "unsupported";

interface NotificationRealtimeHandlers {
  readonly onEvent: (event: NotificationRealtimeEvent) => void;
  readonly onStatusChange: (status: NotificationRealtimeConnectionStatus) => void;
}

const notificationEventTypes: ReadonlySet<NotificationEventType> = new Set([
  "INQUIRY_CREATED",
  "MESSAGE_CREATED",
  "INQUIRY_STATUS_CHANGED",
  "LEAD_REMINDER_DUE",
  "LISTING_APPROVED",
  "LISTING_REJECTED",
  "LISTING_HIDDEN",
  "SAVED_SEARCH_MATCHED",
  "LISTING_AVAILABILITY_REMINDER",
  "ROOMMATE_INTEREST_RECEIVED",
  "ROOMMATE_INTEREST_ACCEPTED",
  "ROOMMATE_INTEREST_REJECTED",
  "ROOMMATE_INTEREST_WITHDRAWN",
  "ROOMMATE_MESSAGE_RECEIVED",
  "ROOMMATE_CONNECTION_LEFT",
  "ROOMMATE_REQUEST_EXPIRING",
  "ROOMMATE_REQUEST_EXPIRED"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : null;
}

function nullablePositiveInteger(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return positiveInteger(value) ?? undefined;
}

function parseNotification(value: unknown): Notification | null {
  if (!isRecord(value)) return null;
  const id = positiveInteger(value.id);
  const inquiryId = nullablePositiveInteger(value.inquiryId);
  const listingId = nullablePositiveInteger(value.listingId);
  const roommateRequestId = nullablePositiveInteger(value.roommateRequestId);
  const roommateInterestId = nullablePositiveInteger(value.roommateInterestId);
  if (
    id === null ||
    typeof value.eventType !== "string" ||
    !notificationEventTypes.has(value.eventType as NotificationEventType) ||
    inquiryId === undefined ||
    listingId === undefined ||
    roommateRequestId === undefined ||
    roommateInterestId === undefined ||
    typeof value.resourcePath !== "string" ||
    typeof value.isRead !== "boolean" ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(new Date(value.createdAt).getTime())
  ) {
    return null;
  }
  return Object.freeze({
    id,
    eventType: value.eventType as NotificationEventType,
    inquiryId,
    listingId,
    roommateRequestId,
    roommateInterestId,
    resourcePath: value.resourcePath,
    isRead: value.isRead,
    createdAt: value.createdAt
  });
}

export function parseNotificationRealtimeEvent(value: string): NotificationRealtimeEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") return null;
  if (parsed.type === "CONNECTED") {
    const userId = positiveInteger(parsed.userId);
    return userId === null ? null : { type: "CONNECTED", userId };
  }
  if (parsed.type === "NOTIFICATION_CREATED") {
    const notification = parseNotification(parsed.notification);
    return notification === null ? null : { type: "NOTIFICATION_CREATED", notification };
  }
  return null;
}

export function connectNotificationRealtime(
  userId: number,
  handlers: NotificationRealtimeHandlers
): Readonly<{ close: () => void }> {
  if (typeof EventSource === "undefined") {
    handlers.onStatusChange("unsupported");
    return Object.freeze({ close: () => undefined });
  }

  const source = new EventSource(`${resolveApiBaseUrl()}/api/v1/notifications/events`, {
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
    const parsed = parseNotificationRealtimeEvent(event.data);
    if (!parsed) return;
    if (parsed.type === "CONNECTED" && parsed.userId !== userId) return;
    handlers.onEvent(parsed);
  };

  return Object.freeze({
    close() {
      if (closed) return;
      closed = true;
      source.close();
    }
  });
}
