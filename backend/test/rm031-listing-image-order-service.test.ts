import { describe, expect, it, vi } from "vitest";
import { RepositoryInvariantError } from "../src/db/repository-primitives.js";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import type {
  ListingImageOrderRepository,
  ListingImageOrderRepositoryFactory
} from "../src/modules/listings/listing-image-order-repository.js";
import { createListingImageOrderService } from "../src/modules/listings/listing-image-order-service.js";
import type { OwnerImage } from "../src/modules/listings/owner-image-mapper.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import type { AuthenticatedPrincipal } from "../src/shared/types/authentication.js";

const executor = Object.freeze({ query: vi.fn() }) as unknown as SqlExecutor;
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 9, role: "LANDLORD" });

function ownerImage(id: number, displayOrder: number): OwnerImage {
  return Object.freeze({
    id,
    url: `https://provider.test/${id}.jpg`,
    format: "jpg",
    width: 800,
    height: 600,
    byteSize: 1234,
    displayOrder,
    altText: null,
    createdAt: new Date("2026-01-01T00:00:00Z")
  });
}

interface FixtureOptions {
  readonly status?: ListingStatus;
  readonly listingExists?: boolean;
  readonly current?: readonly OwnerImage[];
  readonly reordered?: readonly OwnerImage[] | null;
  readonly touchResult?: boolean;
  readonly reorderFailure?: Error;
  readonly commitFailure?: Error;
}

function makeFixture(options: FixtureOptions = {}) {
  const current = options.current ?? [ownerImage(31, 1), ownerImage(32, 3), ownerImage(33, 5)];
  const events: string[] = [];
  const repository: ListingImageOrderRepository = {
    lockOwnedListing: vi.fn(async (listingId, landlordId) => {
      events.push(`lock:${listingId}:${landlordId}`);
      return options.listingExists === false ? null : { id: listingId, status: options.status ?? "APPROVED" };
    }),
    findCurrentImages: vi.fn(async (listingId) => {
      events.push(`images:${listingId}`);
      return current;
    }),
    deferImageOrderUniqueness: vi.fn(async () => {
      events.push("defer");
    }),
    reorderImages: vi.fn(async (listingId: number, imageIds: readonly number[]) => {
      events.push(`reorder:${listingId}:${imageIds.join(",")}`);
      if (options.reorderFailure) throw options.reorderFailure;
      return options.reordered === undefined
        ? imageIds.map((id, index) => ownerImage(id, index + 1))
        : options.reordered;
    }),
    touchListingAfterImageReorder: vi.fn(async (input) => {
      events.push(`touch:${input.listingId}:${input.landlordId}:${input.currentStatus}`);
      return options.touchResult ?? true;
    })
  };
  const repositoryFactory: ListingImageOrderRepositoryFactory = vi.fn(() => repository);
  const transactionRunner: TransactionRunner = vi.fn(async (operation) => {
    events.push("transaction-start");
    const value = await operation(executor);
    if (options.commitFailure) throw options.commitFailure;
    events.push("transaction-commit");
    return value;
  });
  const service = createListingImageOrderService({ transactionRunner, repositoryFactory });
  return { service, repository, transactionRunner, events };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("RM-031 listing image-order service", () => {
  it.each(["TENANT", "ADMIN"] as const)("defensively rejects %s without a transaction", async (role) => {
    const fixture = makeFixture();
    await expectCode(fixture.service.reorderOwnedImages({ userId: 9, role }, 7, [31, 32, 33]), "FORBIDDEN");
    expect(fixture.transactionRunner).not.toHaveBeenCalled();
  });

  it("uses principal.userId as the owner and touch predicate", async () => {
    const fixture = makeFixture();
    await fixture.service.reorderOwnedImages({ userId: 41, role: "LANDLORD" }, 7, [33, 31, 32]);
    expect(fixture.repository.lockOwnedListing).toHaveBeenCalledWith(7, 41);
    expect(fixture.repository.touchListingAfterImageReorder).toHaveBeenCalledWith({
      listingId: 7,
      landlordId: 41,
      currentStatus: "APPROVED"
    });
  });

  it("returns one generic 404 for a missing or non-owned listing", async () => {
    const fixture = makeFixture({ listingExists: false });
    await expect(fixture.service.reorderOwnedImages(landlord, 7, [])).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(fixture.repository.findCurrentImages).not.toHaveBeenCalled();
  });

  it.each([[[31, 32]], [[31, 32, 33, 34]], [[31, 32, 999]], [[31, 31, 33]]])(
    "maps structurally valid exact-set mismatch %j to 409 without writes",
    async (imageIds) => {
      const fixture = makeFixture();
      await expectCode(fixture.service.reorderOwnedImages(landlord, 7, imageIds), "CONCURRENT_MODIFICATION");
      expect(fixture.repository.deferImageOrderUniqueness).not.toHaveBeenCalled();
      expect(fixture.repository.reorderImages).not.toHaveBeenCalled();
      expect(fixture.repository.touchListingAfterImageReorder).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["empty", [], []],
    ["one gapped", [ownerImage(31, 6)], [31]],
    ["contiguous", [ownerImage(31, 1), ownerImage(32, 2)], [31, 32]],
    ["gapped", [ownerImage(31, 1), ownerImage(32, 3), ownerImage(33, 5)], [31, 32, 33]]
  ] as const)("treats %s same-relative-order request as a zero-write no-op", async (_name, current, imageIds) => {
    const fixture = makeFixture({ current });
    const result = await fixture.service.reorderOwnedImages(landlord, 7, imageIds);
    expect(result.map((image) => [image.id, image.displayOrder])).toStrictEqual(
      current.map((image) => [image.id, image.displayOrder])
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(fixture.repository.deferImageOrderUniqueness).not.toHaveBeenCalled();
    expect(fixture.repository.reorderImages).not.toHaveBeenCalled();
    expect(fixture.repository.touchListingAfterImageReorder).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "PENDING", "REJECTED", "APPROVED", "INACTIVE", "HIDDEN"] as const)(
    "keeps %s unchanged on no-op with no timestamp write",
    async (status) => {
      const fixture = makeFixture({ status });
      await fixture.service.reorderOwnedImages(landlord, 7, [31, 32, 33]);
      expect(fixture.repository.touchListingAfterImageReorder).not.toHaveBeenCalled();
    }
  );

  it.each(["DRAFT", "PENDING", "REJECTED", "APPROVED", "INACTIVE", "HIDDEN"] as const)(
    "performs one changed reorder without changing %s",
    async (status) => {
      const fixture = makeFixture({ status });
      const result = await fixture.service.reorderOwnedImages(landlord, 7, [33, 31, 32]);
      expect(result.map((image) => [image.id, image.displayOrder])).toStrictEqual([
        [33, 1],
        [31, 2],
        [32, 3]
      ]);
      expect(fixture.repository.deferImageOrderUniqueness).toHaveBeenCalledOnce();
      expect(fixture.repository.reorderImages).toHaveBeenCalledWith(7, [33, 31, 32]);
      expect(fixture.repository.touchListingAfterImageReorder).toHaveBeenCalledWith({
        listingId: 7,
        landlordId: 9,
        currentStatus: status
      });
    }
  );

  it.each([
    ["bulk short count", { reordered: null }, "CONCURRENT_MODIFICATION"],
    ["timestamp zero", { touchResult: false }, "CONCURRENT_MODIFICATION"]
  ] as const)("maps %s to 409", async (_name, options, code) => {
    const fixture = makeFixture(options);
    await expectCode(fixture.service.reorderOwnedImages(landlord, 7, [33, 31, 32]), code);
  });

  it.each([
    ["repository invariant", { reorderFailure: new RepositoryInvariantError("private") }],
    ["commit failure", { commitFailure: new Error("private commit") }]
  ] as const)("does not return partial success after %s", async (_name, options) => {
    const fixture = makeFixture(options);
    await expect(fixture.service.reorderOwnedImages(landlord, 7, [33, 31, 32])).rejects.toThrow();
  });

  it("becomes a no-op when the same requested order is repeated", async () => {
    const fixture = makeFixture();
    await fixture.service.reorderOwnedImages(landlord, 7, [33, 31, 32]);
    vi.mocked(fixture.repository.findCurrentImages).mockResolvedValueOnce([
      ownerImage(33, 1),
      ownerImage(31, 2),
      ownerImage(32, 3)
    ]);
    await fixture.service.reorderOwnedImages(landlord, 7, [33, 31, 32]);
    expect(fixture.repository.reorderImages).toHaveBeenCalledOnce();
    expect(fixture.repository.touchListingAfterImageReorder).toHaveBeenCalledOnce();
  });
});
