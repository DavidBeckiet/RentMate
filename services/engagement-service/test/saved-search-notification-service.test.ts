import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { PublicListingSummary } from "../../shared/public-listing-summary.js";
import type {
  SavedSearchNotificationListing,
  SavedSearchNotificationRepository
} from "../src/modules/saved-searches/repositories/saved-search-notification-repository.js";
import { createSavedSearchNotificationService } from "../src/modules/saved-searches/services/saved-search-notification-service.js";

const listing: PublicListingSummary = Object.freeze({
  id: 42,
  businessStatus: "AVAILABLE",
  title: "Studio gần Quận 3",
  monthlyRent: 4_200_000,
  roomAreaSqm: 28,
  maxOccupants: 4,
  areaName: "Quận 3",
  latitude: 10.78,
  longitude: 106.69,
  propertyType: Object.freeze({ code: "ROOM", label: "Phòng trọ" }),
  amenities: Object.freeze([{ code: "WIFI", label: "Wi-Fi" }]),
  coverImage: Object.freeze({ url: "https://example.com/cover.webp", altText: null, displayOrder: 1 }),
  updatedAt: "2026-08-25T00:00:00.000Z"
});

test("maps a public listing into the saved-search matcher and returns created count", async () => {
  const calls: SavedSearchNotificationListing[] = [];
  const repository: SavedSearchNotificationRepository = {
    createMatchingNotifications: async (_executor, input) => {
      calls.push(input);
      return 2;
    }
  };
  const service = createSavedSearchNotificationService({
    repository,
    transactionRunner: {
      run: async (operation) => operation({} as SqlExecutor)
    }
  });

  const created = await service.notifyListingPublished(listing);

  assert.equal(created, 2);
  assert.deepEqual(calls, [
    {
      id: 42,
      title: "Studio gần Quận 3",
      monthlyRent: 4_200_000,
      roomAreaSqm: 28,
      maxOccupants: 4,
      areaName: "Quận 3",
      latitude: 10.78,
      longitude: 106.69,
      propertyTypeCode: "ROOM",
      amenityCodes: ["WIFI"]
    }
  ]);
});

test("does not match saved searches for a non-public business status", async () => {
  let transactionCount = 0;
  let repositoryCount = 0;
  const service = createSavedSearchNotificationService({
    repository: {
      createMatchingNotifications: async () => {
        repositoryCount += 1;
        return 1;
      }
    },
    transactionRunner: {
      run: async (operation) => {
        transactionCount += 1;
        return operation({} as SqlExecutor);
      }
    }
  });

  const created = await service.notifyListingPublished({ ...listing, businessStatus: "RENTED" });

  assert.equal(created, 0);
  assert.equal(transactionCount, 0);
  assert.equal(repositoryCount, 0);
});
