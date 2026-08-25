import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { OwnerListingDetailBase } from "../src/modules/listings/mappers/owner-listing-mapper.js";
import type {
  ListingLifecycleActionRepository,
  ListingLifecycleActionRepositoryFactory
} from "../src/modules/listings/repositories/listing-lifecycle-action-repository.js";
import type { OwnerListingReadRepository } from "../src/modules/listings/repositories/owner-listing-read-repository.js";
import { createListingLifecycleActionService } from "../src/modules/listings/services/listing-lifecycle-action-service.js";
import type { TransactionRunner } from "../src/modules/listings/services/listing-create-service.js";

const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 30, role: "LANDLORD" });
const executor: SqlExecutor = {
  query: async () => {
    throw new Error("SQL is not used by this test.");
  }
};

function setup(status: "APPROVED" | "INACTIVE") {
  let currentStatus = status;
  const transitions: unknown[] = [];
  const publishedListingIds: number[] = [];
  const base: OwnerListingDetailBase = Object.freeze({
    id: 42,
    status,
    businessStatus: "AVAILABLE",
    title: "Studio",
    description: "Description",
    monthlyRent: 7_500_000,
    roomAreaSqm: 28.5,
    addressText: "Private address",
    areaName: "District 1",
    latitude: 10.77,
    longitude: 106.7,
    propertyType: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z")
  });
  const repository: ListingLifecycleActionRepository = {
    lockOwnedListing: async () => ({ id: 42, status: currentStatus }),
    transitionStatus: async (_listingId, _landlordId, transition) => {
      transitions.push(transition);
      currentStatus = transition.nextStatus;
      return true;
    }
  };
  const ownerReadRepository: OwnerListingReadRepository = {
    findOwnerListingPage: async () => [],
    findOwnerListingDetailBase: async () => ({ ...base, status: currentStatus }),
    findAmenitiesForListing: async () => [],
    findImagesForListing: async () => [],
    findCurrentModerationReason: async () => null
  };
  const transactionRunner: TransactionRunner = (operation) => operation(executor);
  const repositoryFactory: ListingLifecycleActionRepositoryFactory = () => repository;
  const service = createListingLifecycleActionService({
    transactionRunner,
    repositoryFactory,
    ownerReadRepositoryFactory: () => ownerReadRepository,
    notificationClient: {
      notifyListingPublished: async ({ listingId }) => {
        publishedListingIds.push(listingId);
      }
    }
  });
  return { service, transitions, publishedListingIds };
}

test("notifies saved searches after a listing is reactivated", async () => {
  const fixture = setup("INACTIVE");

  const detail = await fixture.service.reactivateOwnedListing(landlord, 42);

  assert.equal(detail.status, "APPROVED");
  assert.deepEqual(fixture.transitions, [{ expectedStatus: "INACTIVE", nextStatus: "APPROVED" }]);
  assert.deepEqual(fixture.publishedListingIds, [42]);
});

test("does not notify saved searches when a listing is deactivated", async () => {
  const fixture = setup("APPROVED");

  const detail = await fixture.service.deactivateOwnedListing(landlord, 42);

  assert.equal(detail.status, "INACTIVE");
  assert.deepEqual(fixture.publishedListingIds, []);
});
