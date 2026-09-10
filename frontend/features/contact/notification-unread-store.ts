"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "../../lib/api/client";

export interface NotificationUnreadSnapshot {
  readonly userId: number | null;
  readonly unreadCount: number | null;
}

const serverSnapshot: NotificationUnreadSnapshot = Object.freeze({ userId: null, unreadCount: null });
let snapshot: NotificationUnreadSnapshot = serverSnapshot;
const listeners = new Set<() => void>();
let inFlight: { readonly userId: number; readonly promise: Promise<void> } | null = null;
let mutationVersion = 0;
let optimisticDelta = 0;

function emit(next: NotificationUnreadSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function activateUser(userId: number | null): void {
  if (snapshot.userId === userId) return;
  inFlight = null;
  mutationVersion = 0;
  optimisticDelta = 0;
  emit({ userId, unreadCount: null });
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
        emit({ userId, unreadCount: adjustedCount });
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
    emit({ userId, unreadCount: Math.max(0, unreadCount) });
  }
}

export function decrementNotificationUnreadCount(userId: number): void {
  if (snapshot.userId !== userId) return;
  mutationVersion += 1;
  optimisticDelta -= 1;
  if (snapshot.unreadCount !== null) emit({ userId, unreadCount: Math.max(0, snapshot.unreadCount - 1) });
}

export function incrementNotificationUnreadCount(userId: number): void {
  if (snapshot.userId !== userId) return;
  mutationVersion += 1;
  optimisticDelta += 1;
  if (snapshot.unreadCount !== null) emit({ userId, unreadCount: snapshot.unreadCount + 1 });
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
  }, [hydrationKey, userId]);

  return current.userId === userId ? current.unreadCount : null;
}
