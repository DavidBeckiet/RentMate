"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "../../lib/api/client";
import {
  connectNotificationRealtime,
  type NotificationRealtimeConnectionStatus,
  type NotificationRealtimeEvent
} from "../../lib/api/notification-realtime";
import type { Notification } from "../../types/api";

export interface NotificationUnreadSnapshot {
  readonly userId: number | null;
  readonly unreadCount: number | null;
  readonly latestNotification: Notification | null;
  readonly latestNotificationVersion: number;
  readonly realtimeStatus: NotificationRealtimeConnectionStatus;
}

const serverSnapshot: NotificationUnreadSnapshot = Object.freeze({
  userId: null,
  unreadCount: null,
  latestNotification: null,
  latestNotificationVersion: 0,
  realtimeStatus: "connecting"
});
let snapshot: NotificationUnreadSnapshot = serverSnapshot;
const listeners = new Set<() => void>();
let inFlight: { readonly userId: number; readonly promise: Promise<void> } | null = null;
let mutationVersion = 0;
let optimisticDelta = 0;
let pollingUserId: number | null = null;
let pollingConsumers = 0;
let pollingIntervalId: number | null = null;
let realtimeUserId: number | null = null;
let realtimeConsumers = 0;
let realtimeConnection: Readonly<{ close: () => void }> | null = null;

function stopUnreadPolling(): void {
  if (pollingIntervalId !== null) {
    window.clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
  window.removeEventListener("focus", refreshActiveUnreadCount);
  document.removeEventListener("visibilitychange", refreshActiveUnreadCount);
  pollingUserId = null;
  pollingConsumers = 0;
}

function refreshActiveUnreadCount(): void {
  if (pollingUserId !== null && document.visibilityState === "visible") {
    void refreshNotificationUnreadCount(pollingUserId);
  }
}

function startUnreadPolling(userId: number): () => void {
  if (pollingUserId !== userId) {
    if (pollingUserId !== null) stopUnreadPolling();
    pollingUserId = userId;
  }
  pollingConsumers += 1;
  if (pollingConsumers === 1) {
    pollingIntervalId = window.setInterval(refreshActiveUnreadCount, 20_000);
    window.addEventListener("focus", refreshActiveUnreadCount);
    document.addEventListener("visibilitychange", refreshActiveUnreadCount);
  }

  return () => {
    pollingConsumers = Math.max(0, pollingConsumers - 1);
    if (pollingConsumers === 0) stopUnreadPolling();
  };
}

function emit(next: NotificationUnreadSnapshot): void {
  snapshot = Object.freeze(next);
  listeners.forEach((listener) => listener());
}

function activateUser(userId: number | null): void {
  if (snapshot.userId === userId) return;
  inFlight = null;
  mutationVersion = 0;
  optimisticDelta = 0;
  emit({
    userId,
    unreadCount: null,
    latestNotification: null,
    latestNotificationVersion: 0,
    realtimeStatus: "connecting"
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function loadUnreadCount(userId: number, force: boolean): Promise<void> {
  activateUser(userId);
  if (inFlight?.userId === userId) return inFlight.promise;
  if (!force && snapshot.userId === userId && snapshot.unreadCount !== null) return Promise.resolve();

  const requestMutationVersion = mutationVersion;
  const promise = Promise.resolve()
    .then(() => api.contact.getUnreadNotificationCount())
    .then((result) => {
      if (snapshot.userId === userId && (mutationVersion === requestMutationVersion || snapshot.unreadCount === null)) {
        const adjustedCount = Math.max(0, result.unreadCount + optimisticDelta);
        optimisticDelta = 0;
        emit({ ...snapshot, userId, unreadCount: adjustedCount });
      }
    })
    .catch(() => {
      // Keep the last known value. A null value stays null so the UI never presents a false zero.
    });
  inFlight = { userId, promise };
  void promise.then(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  return promise;
}

export function hydrateNotificationUnreadCount(userId: number | null): Promise<void> {
  if (userId === null) {
    activateUser(null);
    return Promise.resolve();
  }
  return loadUnreadCount(userId, false);
}

export function refreshNotificationUnreadCount(userId: number | null): Promise<void> {
  if (userId === null) {
    activateUser(null);
    return Promise.resolve();
  }
  return loadUnreadCount(userId, true);
}

export function setNotificationUnreadCount(userId: number, unreadCount: number): void {
  activateUser(userId);
  if (snapshot.userId === userId) {
    mutationVersion += 1;
    optimisticDelta = 0;
    emit({ ...snapshot, userId, unreadCount: Math.max(0, unreadCount) });
  }
}

export function decrementNotificationUnreadCount(userId: number): void {
  if (snapshot.userId !== userId) return;
  mutationVersion += 1;
  optimisticDelta -= 1;
  if (snapshot.unreadCount !== null) {
    emit({ ...snapshot, userId, unreadCount: Math.max(0, snapshot.unreadCount - 1) });
  }
}

export function incrementNotificationUnreadCount(userId: number): void {
  if (snapshot.userId !== userId) return;
  mutationVersion += 1;
  optimisticDelta += 1;
  if (snapshot.unreadCount !== null) {
    emit({ ...snapshot, userId, unreadCount: snapshot.unreadCount + 1 });
  }
}

function stopNotificationRealtime(): void {
  realtimeConnection?.close();
  realtimeConnection = null;
  realtimeUserId = null;
  realtimeConsumers = 0;
}

function applyNotificationRealtimeEvent(userId: number, event: NotificationRealtimeEvent): void {
  if (event.type !== "NOTIFICATION_CREATED" || snapshot.userId !== userId) return;

  const isRoommateMessage = event.notification.eventType === "ROOMMATE_MESSAGE_RECEIVED";
  if (!isRoommateMessage && snapshot.latestNotification?.id === event.notification.id) return;

  const unreadCount =
    isRoommateMessage || event.notification.isRead || snapshot.unreadCount === null
      ? snapshot.unreadCount
      : snapshot.unreadCount + 1;
  emit({
    ...snapshot,
    userId,
    unreadCount,
    latestNotification: event.notification,
    latestNotificationVersion: snapshot.latestNotificationVersion + 1
  });
  if (isRoommateMessage) {
    // A Roommate notification is reused for subsequent messages in one conversation.
    // Reconcile the unread-row count instead of counting each update as a new notification.
    const pendingCountRequest = inFlight?.userId === userId ? inFlight.promise : null;
    const refresh = refreshNotificationUnreadCount(userId);
    if (pendingCountRequest) void refresh.then(() => refreshNotificationUnreadCount(userId));
  } else if (unreadCount === null && !event.notification.isRead) {
    void refreshNotificationUnreadCount(userId);
  }
}

function startNotificationRealtime(userId: number): () => void {
  if (realtimeUserId !== userId) {
    if (realtimeUserId !== null) stopNotificationRealtime();
    realtimeUserId = userId;
  }
  realtimeConsumers += 1;
  if (realtimeConsumers === 1) {
    realtimeConnection = connectNotificationRealtime(userId, {
      onStatusChange: (status) => {
        if (snapshot.userId === userId) emit({ ...snapshot, realtimeStatus: status });
      },
      onEvent: (event) => applyNotificationRealtimeEvent(userId, event)
    });
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    realtimeConsumers = Math.max(0, realtimeConsumers - 1);
    if (realtimeConsumers === 0) stopNotificationRealtime();
  };
}

export function useNotificationUnreadCount(userId: number | null, hydrationKey?: string): number | null {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot
  );

  useEffect(() => {
    if (userId === null) {
      activateUser(null);
      return;
    }
    void hydrateNotificationUnreadCount(userId);

    return startUnreadPolling(userId);
  }, [hydrationKey, userId]);

  return current.userId === userId ? current.unreadCount : null;
}

export function useNotificationRealtime(userId: number | null): NotificationUnreadSnapshot {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot
  );

  useEffect(() => {
    if (userId === null) {
      activateUser(null);
      return;
    }
    activateUser(userId);
    return startNotificationRealtime(userId);
  }, [userId]);

  if (userId === null || current.userId !== userId) {
    return { ...serverSnapshot, userId };
  }
  return current;
}

export function useLatestNotification(userId: number | null): Notification | null {
  const current = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot
  );
  return current.userId === userId ? current.latestNotification : null;
}
