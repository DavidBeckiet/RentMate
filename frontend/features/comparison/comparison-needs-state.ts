"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavedSearch } from "../../types/api";
import { normalizeComparisonNeeds, type ComparisonNeeds } from "./comparison-needs-evaluator";

const storageKey = "rentmate:comparison-needs";

export type ComparisonNeedsSource = "saved" | "manual";

export interface ComparisonNeedsSnapshot {
  readonly source: ComparisonNeedsSource;
  readonly sourceId?: number;
  readonly sourceLabel?: string;
  readonly criteria: ComparisonNeeds;
}

function parseStored(value: string | null): ComparisonNeedsSnapshot | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as {
      source?: unknown;
      sourceId?: unknown;
      sourceLabel?: unknown;
      criteria?: Partial<ComparisonNeeds>;
    };
    if (raw.source !== "saved" && raw.source !== "manual") return null;
    if (!raw.criteria || typeof raw.criteria !== "object") return null;
    return Object.freeze({
      source: raw.source,
      ...(Number.isSafeInteger(raw.sourceId) && (raw.sourceId as number) > 0
        ? { sourceId: raw.sourceId as number }
        : {}),
      ...(typeof raw.sourceLabel === "string" && raw.sourceLabel.trim() ? { sourceLabel: raw.sourceLabel.trim() } : {}),
      criteria: normalizeComparisonNeeds(raw.criteria)
    });
  } catch {
    return null;
  }
}

function persist(snapshot: ComparisonNeedsSnapshot | null): void {
  if (typeof window === "undefined") return;
  try {
    if (snapshot) window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    // Blocked session storage must not prevent factual comparison.
  }
}

function needsFromSavedSearch(search: SavedSearch): ComparisonNeeds {
  const query = search.query;
  return normalizeComparisonNeeds({
    q: query.q ?? undefined,
    areaName: query.areaName ?? undefined,
    minMonthlyRent: query.minMonthlyRent ?? undefined,
    maxMonthlyRent: query.maxMonthlyRent ?? undefined,
    minRoomAreaSqm: query.minRoomAreaSqm ?? undefined,
    maxRoomAreaSqm: query.maxRoomAreaSqm ?? undefined,
    minOccupants: query.minOccupants ?? undefined,
    propertyType: query.propertyType ?? undefined,
    amenities: query.amenities
  });
}

export function useComparisonNeeds() {
  const [snapshot, setSnapshot] = useState<ComparisonNeedsSnapshot | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        setSnapshot(parseStored(window.sessionStorage.getItem(storageKey)));
      } catch {
        setSnapshot(null);
      }
    }
    setHydrated(true);
  }, []);

  const clear = useCallback(() => {
    setSnapshot(null);
    persist(null);
  }, []);

  const applyManual = useCallback((criteria: ComparisonNeeds) => {
    const next = Object.freeze({ source: "manual" as const, criteria: normalizeComparisonNeeds(criteria) });
    setSnapshot(next);
    persist(next);
  }, []);

  const applySaved = useCallback((search: SavedSearch) => {
    const next = Object.freeze({
      source: "saved" as const,
      sourceId: search.id,
      sourceLabel: search.name?.trim() || undefined,
      criteria: needsFromSavedSearch(search)
    });
    setSnapshot(next);
    persist(next);
  }, []);

  return Object.freeze({ snapshot, hydrated, applyManual, applySaved, clear });
}

export function comparisonNeedsFromSavedSearch(search: SavedSearch): ComparisonNeeds {
  return needsFromSavedSearch(search);
}
