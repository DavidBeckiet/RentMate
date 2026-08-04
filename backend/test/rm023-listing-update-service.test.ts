import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import type { ListingUpdateRepository } from "../src/modules/listings/listing-update-repository.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createListingUpdateService } from "../src/modules/listings/listing-update-service.js";
import { validateListingUpdateInput } from "../src/modules/listings/listing-update-validation.js";
import type { OwnerListingReadRepository } from "../src/modules/listings/owner-listing-read-repository.js";

const now = new Date("2026-08-01T00:00:00.000Z");
const locked = Object.freeze({
  id: 42,
  status: "DRAFT" as const,
  propertyType: null,
  title: null,
  description: null,
  monthlyRent: null,
  roomAreaSqm: null,
  addressText: null,
  areaName: null,
  latitude: null,
  longitude: null,
  createdAt: now,
  updatedAt: now
});
const controlled = (id: number, code: string, isActive = true) => Object.freeze({ id, code, label: code, isActive });

function setup(updateResult = true) {
  const repository: ListingUpdateRepository = {
    lockOwnedListing: vi.fn(async () => locked),
    findCurrentAmenities: vi.fn(async () => [controlled(1, "OLD", false)]),
    findActivePropertyTypeByCode: vi.fn(async (code) => controlled(2, code)),
    findAmenitiesByCodes: vi.fn(async (codes: readonly string[]) =>
      codes.map((code: string, index: number) => controlled(index + 2, code))
    ),
    updateListingContent: vi.fn(async () => updateResult),
    replaceAmenities: vi.fn(async () => undefined)
  };
  const readRepository: OwnerListingReadRepository = {
    findOwnerListingPage: vi.fn(async () => []),
    findOwnerListingDetailBase: vi.fn(async () => ({ ...locked, propertyType: null })),
    findAmenitiesForListing: vi.fn(async () => [{ code: "OLD", label: "OLD" }]),
    findImagesForListing: vi.fn(async () => []),
    findCurrentModerationReason: vi.fn(async () => null)
  };
  const executor = {} as SqlExecutor;
  let runnerCalls = 0;
  const runner: TransactionRunner = async <Value>(operation: (value: SqlExecutor) => Promise<Value>) => {
    runnerCalls += 1;
    return operation(executor);
  };
  const service = createListingUpdateService({
    transactionRunner: runner,
    repositoryFactory: () => repository,
    ownerReadRepositoryFactory: () => readRepository
  });
  return { service, repository, readRepository, runnerCalls: () => runnerCalls };
}

describe("RM-023 listing update service", () => {
  it("uses the principal identity and performs zero writes for a no-op", async () => {
    const fixture = setup();
    await fixture.service.updateOwnedListing({ userId: 8, role: "LANDLORD" }, 42, validateListingUpdateInput({}));
    expect(fixture.repository.lockOwnedListing).toHaveBeenCalledWith(42, 8);
    expect(fixture.repository.updateListingContent).not.toHaveBeenCalled();
    expect(fixture.repository.replaceAmenities).not.toHaveBeenCalled();
    expect(fixture.readRepository.findOwnerListingDetailBase).toHaveBeenCalledWith(42, 8);
    expect(fixture.runnerCalls()).toBe(1);
  });

  it("retains retired associations and replaces changed amenities atomically", async () => {
    const fixture = setup();
    await fixture.service.updateOwnedListing(
      { userId: 8, role: "LANDLORD" },
      42,
      validateListingUpdateInput({ amenityCodes: ["OLD", "NEW"] })
    );
    expect(fixture.repository.updateListingContent).toHaveBeenCalledOnce();
    expect(fixture.repository.replaceAmenities).toHaveBeenCalledWith(42, [2, 3]);
  });

  it("rejects wrong roles, absent ownership, inactive additions, and stale writes", async () => {
    const wrong = setup();
    await expect(
      wrong.service.updateOwnedListing({ userId: 8, role: "TENANT" }, 42, validateListingUpdateInput({}))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const missing = setup();
    vi.mocked(missing.repository.lockOwnedListing).mockResolvedValueOnce(null);
    await expect(
      missing.service.updateOwnedListing({ userId: 8, role: "LANDLORD" }, 42, validateListingUpdateInput({}))
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    const stale = setup(false);
    await expect(
      stale.service.updateOwnedListing(
        { userId: 8, role: "LANDLORD" },
        42,
        validateListingUpdateInput({ title: "new" })
      )
    ).rejects.toMatchObject({ code: "CONCURRENT_MODIFICATION" });
  });
});
