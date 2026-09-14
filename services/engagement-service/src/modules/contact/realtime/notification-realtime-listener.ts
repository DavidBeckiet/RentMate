import type { Pool, PoolClient } from "pg";
import type { Logger } from "../../../../../shared/src/runtime/shared/logging/logger.js";
import type { Notification } from "../repositories/contact-repository.js";
import { notificationRealtimeChannel } from "./notification-realtime-channel.js";
import type { NotificationRealtimeHub } from "./notification-realtime-hub.js";

const notificationEventTypes: ReadonlySet<Notification["eventType"]> = new Set([
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

const reconnectDelayMs = 2_000;

interface JsonRecord {
  readonly [key: string]: unknown;
}

interface ActiveListenerClient {
  readonly client: PoolClient;
  readonly onNotification: (message: { readonly channel: string; readonly payload?: string }) => void;
  readonly onError: (error: Error) => void;
}

function isRecord(value: unknown): value is JsonRecord {
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
    !notificationEventTypes.has(value.eventType as Notification["eventType"]) ||
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
    eventType: value.eventType as Notification["eventType"],
    inquiryId,
    listingId,
    roommateRequestId,
    roommateInterestId,
    resourcePath: value.resourcePath,
    isRead: value.isRead,
    createdAt: value.createdAt
  });
}

export function parseNotificationRealtimeEvent(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const recipientId = positiveInteger(parsed.recipientId);
  const notification = parseNotification(parsed.notification);
  return recipientId === null || notification === null ? null : Object.freeze({ recipientId, notification });
}

export interface NotificationRealtimeListener {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export function createNotificationRealtimeListener(
  pool: Pick<Pool, "connect">,
  hub: NotificationRealtimeHub,
  logger: Pick<Logger, "error">
): NotificationRealtimeListener {
  let active: ActiveListenerClient | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingConnect: Promise<void> | null = null;
  let stopped = false;

  const scheduleReconnect = () => {
    if (stopped || active !== null || pendingConnect !== null || reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, reconnectDelayMs);
    reconnectTimer.unref?.();
  };

  const detach = (connection: ActiveListenerClient, discard: boolean) => {
    connection.client.removeListener("notification", connection.onNotification);
    connection.client.removeListener("error", connection.onError);
    connection.client.release(discard);
  };

  const connect = (): Promise<void> => {
    if (stopped || active !== null || pendingConnect !== null) return pendingConnect ?? Promise.resolve();

    const attempt = (async () => {
      let connection: ActiveListenerClient | null = null;
      try {
        const client = await pool.connect();
        const onNotification = (message: { readonly channel: string; readonly payload?: string }) => {
          if (message.channel !== notificationRealtimeChannel || !message.payload) return;
          const event = parseNotificationRealtimeEvent(message.payload);
          if (event) hub.publish(event);
        };
        const onError = (error: Error) => {
          if (!connection || active !== connection) return;
          active = null;
          detach(connection, true);
          logger.error("Notification realtime PostgreSQL listener failed", {
            errorType: error.name
          });
          scheduleReconnect();
        };
        connection = { client, onNotification, onError };
        client.on("notification", onNotification);
        client.on("error", onError);
        active = connection;
        await client.query({ text: `LISTEN ${notificationRealtimeChannel}`, values: [] });
      } catch (error) {
        if (connection && active === connection) {
          active = null;
          detach(connection, true);
        }
        if (!stopped) {
          logger.error("Notification realtime PostgreSQL listener could not connect", {
            errorType: error instanceof Error ? error.name : "UnknownError"
          });
          scheduleReconnect();
        }
      }
    })();

    pendingConnect = attempt;
    void attempt.finally(() => {
      if (pendingConnect === attempt) pendingConnect = null;
    });
    return attempt;
  };

  return {
    start: () => {
      stopped = false;
      return connect();
    },
    stop: async () => {
      stopped = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const pending = pendingConnect;
      if (pending) await pending;
      if (active) {
        const connection = active;
        active = null;
        detach(connection, false);
      }
    }
  };
}
