import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import type { ListingLifecycleActionRepository } from "../src/modules/listings/listing-lifecycle-action-repository.js";
import { createListingLifecycleActionService } from "../src/modules/listings/listing-lifecycle-action-service.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import type { OwnerListingReadRepository } from "../src/modules/listings/owner-listing-read-repository.js";

const now = new Date("2026-08-01T00:00:00.000Z");
const principal = Object.freeze({ userId: 9, role: "LANDLORD" as const });

function setup(currentStatus: ListingStatus | null, resultStatus: "APPROVED" | "INACTIVE", updated = true) {
  const calls: string[] = [];
  const executor = {} as SqlExecutor;
  const repository: ListingLifecycleActionRepository = {
    lockOwnedListing: vi.fn(async () => {
      calls.push("lock");
      return currentStatus === null ? null : Object.freeze({ id: 7, status: currentStatus });
    }),
    transitionStatus: vi.fn(async () => {
      calls.push("update");
      return updated;
    })
  };
  const readRepository: OwnerListingReadRepository = {
    findOwnerListingPage: vi.fn(async () => []),
    findOwnerListingDetailBase: vi.fn(async () => {
      calls.push("detail");
      return {
        id: 7,
        status: resultStatus,
        title: "Title",
        description: "Description",
        monthlyRent: 5_000_000,
        roomAreaSqm: 25,
        addressText: "Private address",
        areaName: "District",
        latitude: 10.75,
        longitude: 106.67,
        propertyType: { code: "STUDIO", label: "Studio" },
        createdAt: now,
        updatedAt: now
      };
    }),
    findAmenitiesForListing: vi.fn(async () => {
      calls.push("amenities");
      return [{ code: "WIFI", label: "Wi-Fi" }];
    }),
    findImagesForListing: vi.fn(async () => {
      calls.push("images");
      return [];
    }),
    findCurrentModerationReason: vi.fn(async () => {
      calls.push("reason");
      return "must not load";
    })
  };
  let runnerCalls = 0;
  const transactionRunner: TransactionRunner = async <Value>(operation: (value: SqlExecutor) => Promise<Value>) => {
    runnerCalls += 1;
    return operation(executor);
  };
  const service = createListingLifecycleActionService({
    transactionRunner,
    repositoryFactory: (received) => {
      expect(received).toBe(executor);
      return repository;
    },
    ownerReadRepositoryFactory: (received) => {
      expect(received).toBe(executor);
      return readRepository;
    }
  });
  return { service, repository, readRepository, calls, runnerCalls: () => runnerCalls };
}

describe("RM-026 listing lifecycle action service", () => {
  it("deactivates APPROVED using principal ownership and a transaction-bound final detail", async () => {
    const fixture = setup("APPROVED", "INACTIVE");
    const result = await fixture.service.deactivateOwnedListing(principal, 7);
    expect(result).toMatchObject({ status: "INACTIVE", currentModerationReason: null });
    expect(fixture.repository.lockOwnedListing).toHaveBeenCalledWith(7, 9);
    expect(fixture.repository.transitionStatus).toHaveBeenCalledWith(7, 9, {
      expectedStatus: "APPROVED",
      nextStatus: "INACTIVE"
    });
    expect(fixture.readRepository.findCurrentModerationReason).not.toHaveBeenCalled();
    expect(fixture.calls).toStrictEqual(["lock", "update", "detail", "amenities", "images"]);
    expect(fixture.runnerCalls()).toBe(1);
  });

  it("reactivates unchanged INACTIVE without eligibility or revision proof", async () => {
    const fixture = setup("INACTIVE", "APPROVED");
    const result = await fixture.service.reactivateOwnedListing(principal, 7);
    expect(result).toMatchObject({ status: "APPROVED", currentModerationReason: null });
    expect(fixture.repository.transitionStatus).toHaveBeenCalledWith(7, 9, {
      expectedStatus: "INACTIVE",
      nextStatus: "APPROVED"
    });
    expect(fixture.calls).toStrictEqual(["lock", "update", "detail", "amenities", "images"]);
  });

  it.each(["DRAFT", "PENDING", "REJECTED", "INACTIVE", "HIDDEN"] as const)(
    "rejects deactivate source %s immediately after lock",
    async (status) => {
      const fixture = setup(status, "INACTIVE");
      await expect(fixture.service.deactivateOwnedListing(principal, 7)).rejects.toMatchObject({
        code: "INVALID_LISTING_TRANSITION"
      });
      expect(fixture.calls).toStrictEqual(["lock"]);
    }
  );

  it.each(["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN"] as const)(
    "rejects reactivate source %s immediately after lock",
    async (status) => {
      const fixture = setup(status, "APPROVED");
      await expect(fixture.service.reactivateOwnedListing(principal, 7)).rejects.toMatchObject({
        code: "INVALID_LISTING_TRANSITION"
      });
      expect(fixture.calls).toStrictEqual(["lock"]);
    }
  );

  it("rejects wrong roles before a transaction and missing ownership with a generic 404", async () => {
    const wrongRole = setup("APPROVED", "INACTIVE");
    await expect(wrongRole.service.deactivateOwnedListing({ userId: 9, role: "TENANT" }, 7)).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    expect(wrongRole.runnerCalls()).toBe(0);
    const missing = setup(null, "INACTIVE");
    await expect(missing.service.deactivateOwnedListing(principal, 7)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(missing.calls).toStrictEqual(["lock"]);
  });

  it("maps a legal zero-row transition to concurrent modification", async () => {
    const fixture = setup("APPROVED", "INACTIVE", false);
    await expect(fixture.service.deactivateOwnedListing(principal, 7)).rejects.toMatchObject({
      code: "CONCURRENT_MODIFICATION"
    });
    expect(fixture.calls).toStrictEqual(["lock", "update"]);
  });

  it("propagates final-detail failure from inside the transaction callback", async () => {
    const fixture = setup("INACTIVE", "APPROVED");
    vi.mocked(fixture.readRepository.findOwnerListingDetailBase).mockRejectedValueOnce(
      new Error("synthetic final detail failure")
    );
    await expect(fixture.service.reactivateOwnedListing(principal, 7)).rejects.toThrow(
      "synthetic final detail failure"
    );
    expect(fixture.calls).toStrictEqual(["lock", "update"]);
  });
});
