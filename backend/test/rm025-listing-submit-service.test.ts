import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import type {
  ListingSubmitRepository,
  LockedSubmissionListing
} from "../src/modules/listings/listing-submit-repository.js";
import { createListingSubmitService } from "../src/modules/listings/listing-submit-service.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import type { OwnerListingReadRepository } from "../src/modules/listings/owner-listing-read-repository.js";

const now = new Date("2026-08-01T00:00:00.000Z");
const principal = Object.freeze({ userId: 9, role: "LANDLORD" as const });

function locked(status: ListingStatus = "DRAFT"): LockedSubmissionListing {
  return Object.freeze({
    id: 7,
    status,
    propertyTypePresent: true,
    propertyTypeKnown: true,
    propertyType: Object.freeze({ code: "STUDIO", label: "Studio" }),
    title: "Title",
    description: "Description",
    monthlyRent: 5_000_000,
    roomAreaSqm: 25,
    addressText: "Private address",
    areaName: "District",
    latitude: 10.75,
    longitude: 106.67,
    createdAt: now,
    updatedAt: now
  });
}

function setup(current: LockedSubmissionListing | null = locked(), updated = true) {
  const calls: string[] = [];
  const executor = {} as SqlExecutor;
  const repository: ListingSubmitRepository = {
    lockOwnedListing: vi.fn(async () => {
      calls.push("lock");
      return current;
    }),
    areAmenityReferencesKnown: vi.fn(async () => {
      calls.push("amenities-known");
      return true;
    }),
    hasPersistedImage: vi.fn(async () => {
      calls.push("image");
      return true;
    }),
    transitionToPending: vi.fn(async () => {
      calls.push("update");
      return updated;
    })
  };
  const readRepository: OwnerListingReadRepository = {
    findOwnerListingPage: vi.fn(async () => []),
    findOwnerListingDetailBase: vi.fn(async () => {
      calls.push("detail");
      return { ...locked("PENDING"), propertyType: { code: "STUDIO", label: "Studio" } };
    }),
    findAmenitiesForListing: vi.fn(async () => {
      calls.push("detail-amenities");
      return [{ code: "RETIRED", label: "Retired" }];
    }),
    findImagesForListing: vi.fn(async () => {
      calls.push("detail-images");
      return [
        {
          id: 3,
          url: "https://example.test/image.webp",
          format: "webp",
          width: 800,
          height: 600,
          byteSize: 1234,
          displayOrder: 1,
          altText: null,
          createdAt: now
        }
      ];
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
  const service = createListingSubmitService({
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

describe("RM-025 listing submit service", () => {
  it.each(["DRAFT", "HIDDEN"] as const)(
    "submits %s using principal ownership and reads final detail in order",
    async (status) => {
      const fixture = setup(locked(status));
      const result = await fixture.service.submitOwnedListing(principal, 7);
      expect(result).toMatchObject({ status: "PENDING", currentModerationReason: null });
      expect(fixture.repository.lockOwnedListing).toHaveBeenCalledWith(7, 9);
      expect(fixture.repository.transitionToPending).toHaveBeenCalledWith(7, 9, status);
      expect(fixture.readRepository.findOwnerListingDetailBase).toHaveBeenCalledWith(7, 9);
      expect(fixture.readRepository.findCurrentModerationReason).not.toHaveBeenCalled();
      expect(fixture.calls).toStrictEqual([
        "lock",
        "amenities-known",
        "image",
        "update",
        "detail",
        "detail-amenities",
        "detail-images"
      ]);
      expect(fixture.runnerCalls()).toBe(1);
    }
  );

  it.each(["PENDING", "APPROVED", "REJECTED", "INACTIVE"] as const)(
    "rejects source %s before eligibility reads",
    async (status) => {
      const fixture = setup(locked(status));
      await expect(fixture.service.submitOwnedListing(principal, 7)).rejects.toMatchObject({
        code: "INVALID_LISTING_TRANSITION"
      });
      expect(fixture.calls).toStrictEqual(["lock"]);
    }
  );

  it("rejects the wrong role before a transaction and preserves owner-safe missing behavior", async () => {
    const wrongRole = setup();
    await expect(wrongRole.service.submitOwnedListing({ userId: 9, role: "TENANT" }, 7)).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    expect(wrongRole.runnerCalls()).toBe(0);
    const missing = setup(null);
    await expect(missing.service.submitOwnedListing(principal, 7)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(missing.calls).toStrictEqual(["lock"]);
  });

  it("returns deterministic completeness details before reference/amenity/image checks", async () => {
    const fixture = setup({
      ...locked(),
      propertyTypePresent: false,
      propertyTypeKnown: false,
      propertyType: null,
      title: null
    });
    await expect(fixture.service.submitOwnedListing(principal, 7)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: [
        { field: "propertyType", code: "REQUIRED" },
        { field: "title", code: "REQUIRED" }
      ]
    });
    expect(fixture.calls).toStrictEqual(["lock"]);
  });

  it("distinguishes broken property, amenities, and missing images in validation order", async () => {
    const property = setup({ ...locked(), propertyTypeKnown: false, propertyType: null });
    await expect(property.service.submitOwnedListing(principal, 7)).rejects.toMatchObject({
      details: [{ field: "propertyType", code: "INVALID_VALUE" }]
    });
    expect(property.calls).toStrictEqual(["lock"]);

    const amenities = setup();
    vi.mocked(amenities.repository.areAmenityReferencesKnown).mockImplementationOnce(async () => {
      amenities.calls.push("amenities-known");
      return false;
    });
    await expect(amenities.service.submitOwnedListing(principal, 7)).rejects.toMatchObject({
      details: [{ field: "amenities", code: "INVALID_VALUE" }]
    });
    expect(amenities.calls).toStrictEqual(["lock", "amenities-known"]);

    const image = setup();
    vi.mocked(image.repository.hasPersistedImage).mockImplementationOnce(async () => {
      image.calls.push("image");
      return false;
    });
    await expect(image.service.submitOwnedListing(principal, 7)).rejects.toMatchObject({
      details: [{ field: "images", code: "REQUIRED" }]
    });
    expect(image.calls).toStrictEqual(["lock", "amenities-known", "image"]);
  });

  it("maps only a post-lock zero-row update to concurrent modification", async () => {
    const fixture = setup(locked(), false);
    await expect(fixture.service.submitOwnedListing(principal, 7)).rejects.toMatchObject({
      code: "CONCURRENT_MODIFICATION"
    });
    expect(fixture.calls).toStrictEqual(["lock", "amenities-known", "image", "update"]);
  });

  it("propagates a final detail failure from inside the transaction callback", async () => {
    const fixture = setup();
    vi.mocked(fixture.readRepository.findOwnerListingDetailBase).mockRejectedValueOnce(
      new Error("synthetic final detail failure")
    );
    await expect(fixture.service.submitOwnedListing(principal, 7)).rejects.toThrow("synthetic final detail failure");
    expect(fixture.calls).toStrictEqual(["lock", "amenities-known", "image", "update"]);
  });
});
