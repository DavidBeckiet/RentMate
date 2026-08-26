const storageKey = "rentmate_recent_listings_v1";
const maximumRecentListings = 12;

export interface RecentListingsStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

interface RecentListingRecord {
  readonly id: number;
  readonly viewedAt: number;
}

function browserStorage(): RecentListingsStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(storage: RecentListingsStorage | undefined): RecentListingsStorage | null {
  return storage ?? browserStorage();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readRecords(storage: RecentListingsStorage | null): RecentListingRecord[] {
  if (!storage) return [];

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const records = parsed.filter((value): value is RecentListingRecord => {
      if (!isRecord(value)) return false;
      return (
        typeof value.id === "number" &&
        Number.isSafeInteger(value.id) &&
        value.id >= 1 &&
        typeof value.viewedAt === "number" &&
        Number.isFinite(value.viewedAt) &&
        value.viewedAt >= 0
      );
    });
    const deduplicated = new Map<number, RecentListingRecord>();
    for (const record of records) {
      const previous = deduplicated.get(record.id);
      if (!previous || record.viewedAt > previous.viewedAt) deduplicated.set(record.id, record);
    }
    return [...deduplicated.values()]
      .sort((left, right) => right.viewedAt - left.viewedAt || right.id - left.id)
      .slice(0, maximumRecentListings);
  } catch {
    return [];
  }
}

function writeRecords(storage: RecentListingsStorage | null, records: readonly RecentListingRecord[]): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(records));
  } catch {
    // Private browsing and storage quotas must not block listing discovery.
  }
}

export function readRecentListingIds(storage?: RecentListingsStorage): readonly number[] {
  return readRecords(resolveStorage(storage)).map((record) => record.id);
}

export function rememberRecentListing(
  listingId: number,
  storage?: RecentListingsStorage,
  viewedAt = Date.now()
): void {
  if (!Number.isSafeInteger(listingId) || listingId < 1 || !Number.isFinite(viewedAt) || viewedAt < 0) return;
  const resolvedStorage = resolveStorage(storage);
  const records = readRecords(resolvedStorage).filter((record) => record.id !== listingId);
  records.unshift({ id: listingId, viewedAt });
  writeRecords(resolvedStorage, records.slice(0, maximumRecentListings));
}

export function removeRecentListing(listingId: number, storage?: RecentListingsStorage): void {
  const resolvedStorage = resolveStorage(storage);
  const records = readRecords(resolvedStorage).filter((record) => record.id !== listingId);
  writeRecords(resolvedStorage, records);
}

export function clearRecentListings(storage?: RecentListingsStorage): void {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return;
  try {
    resolvedStorage.removeItem(storageKey);
  } catch {
    // A storage access failure should not break the page.
  }
}

export { maximumRecentListings, storageKey as recentListingsStorageKey };
