import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecentListings,
  maximumRecentListings,
  readRecentListingIds,
  rememberRecentListing,
  removeRecentListing,
  recentListingsStorageKey,
  type RecentListingsStorage
} from "./recently-viewed-storage";

function storage(): RecentListingsStorage {
  let value: string | null = null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
    removeItem: vi.fn(() => {
      value = null;
    })
  };
}

describe("recently viewed storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores only valid listing ids, moves revisits to the front, and caps history", () => {
    const target = storage();
    for (let id = 1; id <= maximumRecentListings + 2; id += 1) {
      rememberRecentListing(id, target, id);
    }
    rememberRecentListing(3, target, 100);

    expect(readRecentListingIds(target)).toEqual([3, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
    expect(target.setItem).toHaveBeenCalledWith(recentListingsStorageKey, expect.any(String));
  });

  it("ignores malformed storage records and removes one item or the whole history safely", () => {
    const target = storage();
    target.setItem(
      recentListingsStorageKey,
      JSON.stringify([
        { id: 42, viewedAt: 10 },
        { id: 42, viewedAt: 20 },
        { id: 0, viewedAt: 30 },
        { id: "43", viewedAt: 40 },
        { id: 44, viewedAt: Number.NaN }
      ])
    );

    expect(readRecentListingIds(target)).toEqual([42]);
    removeRecentListing(42, target);
    expect(readRecentListingIds(target)).toEqual([]);
    rememberRecentListing(45, target, 50);
    clearRecentListings(target);
    expect(readRecentListingIds(target)).toEqual([]);
    expect(target.removeItem).toHaveBeenCalledWith(recentListingsStorageKey);
  });

  it("does not access browser storage during server rendering or for invalid ids", () => {
    const target = storage();
    rememberRecentListing(0, target, 1);
    rememberRecentListing(1, target, -1);
    expect(target.setItem).not.toHaveBeenCalled();
  });
});
