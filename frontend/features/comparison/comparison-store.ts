"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const changeEvent = "rentmate:comparison-change";
const storageKey = "rentmate:comparison-selection";
const maximumSelections = 4;
let currentValue = "";
let storageHydrated = false;

function parse(value: string | null): readonly number[] {
  if (!value) return Object.freeze([]);
  const result: number[] = [];
  for (const part of value.split(",")) {
    const id = Number(part);
    if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647 || result.includes(id)) continue;
    result.push(id);
    if (result.length === maximumSelections) break;
  }
  return Object.freeze(result);
}

function serialize(ids: readonly number[]): string {
  return ids.join(",");
}

function snapshot(): string {
  return currentValue;
}

function hydrateFromStorage(): boolean {
  if (storageHydrated || typeof window === "undefined") return false;
  storageHydrated = true;
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    const normalized = serialize(parse(stored));
    if (normalized === currentValue) return false;
    currentValue = normalized;
    return true;
  } catch {
    return false;
  }
}

function write(ids: readonly number[]): void {
  currentValue = serialize(ids);
  if (typeof window !== "undefined") {
    try {
      if (currentValue) window.sessionStorage.setItem(storageKey, currentValue);
      else window.sessionStorage.removeItem(storageKey);
    } catch {
      // Private browsing or a blocked storage area should not break comparison.
    }
  }
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(notify: () => void): () => void {
  const changedByStorage = hydrateFromStorage();
  window.addEventListener(changeEvent, notify);
  if (changedByStorage) window.dispatchEvent(new Event(changeEvent));
  return () => {
    window.removeEventListener(changeEvent, notify);
  };
}

export type ComparisonToggleOutcome = "added" | "removed" | "limit";

export function useComparisonSelection() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "");
  const listingIds = useMemo(() => parse(value), [value]);

  const toggle = useCallback((listingId: number): ComparisonToggleOutcome => {
    const current = parse(snapshot());
    if (current.includes(listingId)) {
      write(current.filter((id) => id !== listingId));
      return "removed";
    }
    if (current.length >= maximumSelections) return "limit";
    write([...current, listingId]);
    return "added";
  }, []);

  const remove = useCallback((listingId: number) => write(parse(snapshot()).filter((id) => id !== listingId)), []);
  const clear = useCallback(() => write([]), []);

  return Object.freeze({
    listingIds,
    count: listingIds.length,
    maximumSelections,
    contains: (listingId: number) => listingIds.includes(listingId),
    toggle,
    remove,
    clear
  });
}
