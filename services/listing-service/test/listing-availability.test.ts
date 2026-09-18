import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import {
  resolveListingAvailabilitySnapshot,
  type ListingAvailabilityFields
} from "../src/modules/listings/listing-availability.js";
import type { OwnerListingDetailBase } from "../src/modules/listings/mappers/owner-listing-mapper.js";
import type {
  ListingAvailabilityOwnerRepository,
  ListingAvailabilityOwnerRepositoryFactory
} from "../src/modules/listings/repositories/listing-availability-owner-repository.js";
import type {
  ListingAvailabilityNotificationJob,
  ListingAvailabilityRepository
} from "../src/modules/listings/repositories/listing-availability-repository.js";
import type { OwnerListingReadRepository } from "../src/modules/listings/repositories/owner-listing-read-repository.js";
import { createListingAvailabilityScheduler } from "../src/modules/listings/services/listing-availability-scheduler.js";
import { createListingAvailabilityService } from "../src/modules/listings/services/listing-availability-service.js";
import type { TransactionRunner } from "../src/modules/listings/services/listing-create-service.js";

const executor: SqlExecutor = {
  query: async () => {
    throw new Error("SQL is not used by this test.");
  }
};

const now = new Date("2026-08-25T00:00:00.000Z");
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 30, role: "LANDLORD" });

function fields(overrides: Partial<ListingAvailabilityFields> = {}): ListingAvailabilityFields {
  return {
    availabilityConfirmedAt: new Date("2026-07-01T00:00:00.000Z"),
    availabilityReminderSentAt: null,
    availabilityReminderNotifiedAt: null,
    availabilityAutoPausedAt: null,
    ...overrides
  };
}

test("resolves current, reminder due and auto-paused availability states from the confirmation clock", () => {
  assert.equal(
    resolveListingAvailabilitySnapshot(
      {
        status: "APPROVED",
        businessStatus: "AVAILABLE",
        ...fields({ availabilityConfirmedAt: new Date("2026-08-01T00:00:00.000Z") })
      },
      now
    ).availabilityStatus,
    "CURRENT"
  );
  assert.equal(
    resolveListingAvailabilitySnapshot({ status: "APPROVED", businessStatus: "AVAILABLE", ...fields() }, now)
      .availabilityStatus,
    "REMINDER_DUE"
  );
  assert.equal(
    resolveListingAvailabilitySnapshot(
      {
        status: "APPROVED",
        businessStatus: "PAUSED",
        ...fields({ availabilityAutoPausedAt: new Date("2026-08-10T00:00:00.000Z") })
      },
      now
    ).availabilityStatus,
    "AUTO_PAUSED"
  );
});

function ownerBase(overrides: Partial<OwnerListingDetailBase> = {}): OwnerListingDetailBase {
  return {
    id: 42,
    status: "APPROVED",
    businessStatus: "AVAILABLE",
    title: "Studio",
    description: "Description",
    monthlyRent: 7_500_000,
    roomAreaSqm: 28,
    maxOccupants: 2,
    addressText: "Private address",
    areaName: "District 1",
    latitude: 10.77,
    longitude: 106.7,
    ...fields({ availabilityConfirmedAt: new Date("2026-07-01T00:00:00.000Z") }),
    propertyType: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    ...overrides
  };
}

test("confirms an owned unknown or auto-paused listing and rejects a manual pause", async () => {
  const updates: number[] = [];
  const locked = {
    id: 42,
    status: "APPROVED" as const,
    businessStatus: "UNKNOWN" as const,
    availabilityConfirmedAt: new Date("2026-07-01T00:00:00.000Z"),
    availabilityReminderSentAt: new Date("2026-08-02T00:00:00.000Z"),
    availabilityReminderNotifiedAt: null,
    availabilityAutoPausedAt: null
  };
  const repository: ListingAvailabilityOwnerRepository = {
    lockOwnedListing: async () => locked,
    confirmAvailability: async (listingId) => {
      updates.push(listingId);
    }
  };
  const ownerReadRepository: OwnerListingReadRepository = {
    findOwnerListingPage: async () => [],
    hasEverApprovedListing: async () => false,
    findOwnerListingDetailBase: async () => ownerBase({ businessStatus: "AVAILABLE" }),
    findAmenitiesForListing: async () => [],
    findImagesForListing: async () => [],
    findCurrentModerationReason: async () => null
  };
  const factory: ListingAvailabilityOwnerRepositoryFactory = () => repository;
  const transactionRunner: TransactionRunner = (operation) => operation(executor);
  const service = createListingAvailabilityService({
    transactionRunner,
    repositoryFactory: factory,
    ownerReadRepositoryFactory: () => ownerReadRepository
  });

  const result = await service.confirmOwnedAvailability(landlord, 42);
  assert.equal(result.businessStatus, "AVAILABLE");
  assert.deepEqual(updates, [42]);

  const manualPauseService = createListingAvailabilityService({
    transactionRunner,
    repositoryFactory: () => ({
      ...repository,
      lockOwnedListing: async () => ({ ...locked, businessStatus: "PAUSED", availabilityAutoPausedAt: null })
    }),
    ownerReadRepositoryFactory: () => ownerReadRepository
  });
  await assert.rejects(
    manualPauseService.confirmOwnedAvailability(landlord, 42),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_LISTING_TRANSITION"
  );
});

test("delivers availability jobs and marks them after Engagement accepts the notification", async () => {
  const job: ListingAvailabilityNotificationJob = {
    listingId: 42,
    landlordId: 30,
    kind: "REMINDER_DUE",
    dedupeKey: "listing-availability:42:REMINDER_DUE:2026-08-25T00:00:00.000Z",
    deliveryMarker: "REMINDER",
    deliveryAt: now
  };
  let scanCount = 0;
  const delivered: ListingAvailabilityNotificationJob[] = [];
  const notified: unknown[] = [];
  const repository: ListingAvailabilityRepository = {
    processDueListings: async () => {
      scanCount += 1;
      return scanCount === 1 ? [job] : [];
    },
    markNotificationDelivered: async (_executor, value) => {
      delivered.push(value);
    }
  };
  const scheduler = createListingAvailabilityScheduler({
    repository,
    transactionRunner: { run: (operation) => operation(executor) },
    notificationClient: {
      notifyListingAvailabilityReminder: async (input) => {
        notified.push(input);
      }
    },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    reminderDays: 30,
    graceDays: 7,
    intervalMs: 60_000,
    batchSize: 100,
    now: () => now
  });

  assert.equal(await scheduler.runOnce(), 1);
  assert.equal(await scheduler.runOnce(), 0);
  assert.deepEqual(delivered, [job]);
  assert.deepEqual(notified, [{ landlordId: 30, listingId: 42, kind: "REMINDER_DUE", dedupeKey: job.dedupeKey }]);
});
