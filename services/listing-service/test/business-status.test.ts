import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import type { ListingBusinessStatus } from "../../shared/listing-business-status.js";
import type { OwnerListingDetailBase } from "../src/modules/listings/mappers/owner-listing-mapper.js";
import type {
  ListingBusinessStatusRepository,
  ListingBusinessStatusRepositoryFactory
} from "../src/modules/listings/repositories/listing-business-status-repository.js";
import type { OwnerListingReadRepository } from "../src/modules/listings/repositories/owner-listing-read-repository.js";
import { createListingBusinessStatusService } from "../src/modules/listings/services/listing-business-status-service.js";
import type { TransactionRunner } from "../src/modules/listings/services/listing-create-service.js";
import { validateListingBusinessStatusInput } from "../src/modules/listings/validations/business-status-validation.js";

const executor: SqlExecutor = {
  query: async () => {
    throw new Error("SQL is not used by this test.");
  }
};

const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 30, role: "LANDLORD" });
const tenant: AuthenticatedPrincipal = Object.freeze({ userId: 31, role: "TENANT" });

function setup(
  options: {
    readonly found?: boolean;
    readonly updateResult?: boolean;
    readonly currentStatus?: ListingBusinessStatus;
    readonly listingStatus?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "INACTIVE" | "HIDDEN";
  } = {}
) {
  let currentStatus: ListingBusinessStatus = options.currentStatus ?? "AVAILABLE";
  const listingStatus = options.listingStatus ?? "APPROVED";
  const updates: unknown[] = [];
  const publishedListingIds: number[] = [];
  const base: OwnerListingDetailBase = Object.freeze({
    id: 42,
    status: listingStatus,
    businessStatus: currentStatus,
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
  const repository: ListingBusinessStatusRepository = {
    lockOwnedListing: async () =>
      options.found === false ? null : { id: 42, status: listingStatus, businessStatus: currentStatus },
    updateBusinessStatus: async (record) => {
      updates.push(record);
      if (options.updateResult === false) return false;
      currentStatus = record.nextStatus;
      return true;
    }
  };
  const ownerReadRepository: OwnerListingReadRepository = {
    findOwnerListingPage: async () => [],
    findOwnerListingDetailBase: async () => ({ ...base, businessStatus: currentStatus }),
    findAmenitiesForListing: async () => [],
    findImagesForListing: async () => [],
    findCurrentModerationReason: async () => null
  };
  const transactionRunner: TransactionRunner = (operation) => operation(executor);
  const repositoryFactory: ListingBusinessStatusRepositoryFactory = () => repository;
  const service = createListingBusinessStatusService({
    transactionRunner,
    repositoryFactory,
    ownerReadRepositoryFactory: () => ownerReadRepository,
    notificationClient: {
      notifyListingPublished: async ({ listingId }) => {
        publishedListingIds.push(listingId);
      }
    }
  });
  return { service, updates, publishedListingIds };
}

test("normalizes business status and rejects malformed input", () => {
  assert.deepEqual(validateListingBusinessStatusInput({ businessStatus: "  rented " }), {
    businessStatus: "RENTED"
  });
  assert.throws(() => validateListingBusinessStatusInput({ businessStatus: "SOLD" }), /invalid data/i);
  assert.throws(
    () => validateListingBusinessStatusInput({ businessStatus: "AVAILABLE", extra: true }),
    /invalid data/i
  );
});

test("landlords can update business status and receive the canonical owner detail", async () => {
  const fixture = setup();

  const result = await fixture.service.updateOwnedBusinessStatus(landlord, 42, { businessStatus: "RENTED" });

  assert.equal(result.businessStatus, "RENTED");
  assert.deepEqual(fixture.updates, [
    {
      listingId: 42,
      landlordId: 30,
      expectedStatus: "AVAILABLE",
      nextStatus: "RENTED",
      resetAvailability: false,
      clearAutoPause: true
    }
  ]);
});

test("a no-op status update does not write", async () => {
  const fixture = setup();

  const result = await fixture.service.updateOwnedBusinessStatus(landlord, 42, { businessStatus: "AVAILABLE" });

  assert.equal(result.businessStatus, "AVAILABLE");
  assert.equal(fixture.updates.length, 0);
});

test("notifies saved searches when an approved listing becomes public again", async () => {
  const fixture = setup({ currentStatus: "PAUSED" });

  await fixture.service.updateOwnedBusinessStatus(landlord, 42, { businessStatus: "AVAILABLE" });

  assert.deepEqual(fixture.publishedListingIds, [42]);
});

test("enforces landlord ownership and reports concurrent changes", async () => {
  const missing = setup({ found: false });
  await assert.rejects(
    missing.service.updateOwnedBusinessStatus(landlord, 42, { businessStatus: "RENTED" }),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );

  const forbidden = setup();
  await assert.rejects(
    forbidden.service.updateOwnedBusinessStatus(tenant, 42, { businessStatus: "RENTED" }),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );

  const concurrent = setup({ updateResult: false });
  await assert.rejects(
    concurrent.service.updateOwnedBusinessStatus(landlord, 42, { businessStatus: "RENTED" }),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
});
