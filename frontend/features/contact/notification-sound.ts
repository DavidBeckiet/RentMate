"use client";

import { useEffect, useRef } from "react";
import type { NotificationUnreadSnapshot } from "./notification-unread-store";

const notificationSoundStorageKey = "rentmate.notification-sound";
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}

export function getNotificationSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(notificationSoundStorageKey) !== "off";
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(notificationSoundStorageKey, enabled ? "on" : "off");
  } catch {
    // Sound remains enabled for the current session when storage is unavailable.
  }
}

export function unlockNotificationSound(): void {
  const context = getAudioContext();
  if (context?.state === "suspended") void context.resume().catch(() => undefined);
}

export function playNotificationSound(): void {
  if (!getNotificationSoundEnabled()) return;
  const context = audioContext;
  if (!context || context.state !== "running") return;

  try {
    const now = context.currentTime;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
  } catch {
    // A blocked or unavailable audio device must not affect messaging.
  }
}

export function useNotificationSound(
  userId: number | null,
  realtime: Pick<NotificationUnreadSnapshot, "latestNotification" | "latestNotificationVersion">
): void {
  const previousUserId = useRef<number | null>(null);
  const previousVersion = useRef(0);

  useEffect(() => {
    previousUserId.current = userId;
    previousVersion.current = 0;
    if (userId === null) return;

    const unlock = () => unlockNotificationSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [userId]);

  useEffect(() => {
    if (userId === null || previousUserId.current !== userId) return;
    if (realtime.latestNotificationVersion <= previousVersion.current) return;
    previousVersion.current = realtime.latestNotificationVersion;
    if (realtime.latestNotification && !realtime.latestNotification.isRead) playNotificationSound();
  }, [realtime.latestNotification, realtime.latestNotificationVersion, userId]);
}
