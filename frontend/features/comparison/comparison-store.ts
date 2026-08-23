"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const changeEvent = "rentmate:comparison-change";
const maximumSelections = 4;
let currentValue = "";

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

function write(ids: readonly number[]): void {
  currentValue = serialize(ids);
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(notify: () => void): () => void {
  window.addEventListener(changeEvent, notify);
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
