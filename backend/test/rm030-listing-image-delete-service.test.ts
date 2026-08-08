import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import type { CloudinaryClient } from "../src/integrations/cloudinary.client.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import type {
  ListingImageDeleteRepository,
  ListingImageDeleteRepositoryFactory
} from "../src/modules/listings/listing-image-delete-repository.js";
import { createListingImageDeleteService } from "../src/modules/listings/listing-image-delete-service.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import type { AuthenticatedPrincipal } from "../src/shared/types/authentication.js";

const executor = Object.freeze({ query: vi.fn() }) as unknown as SqlExecutor;
const landlord: AuthenticatedPrincipal = Object.freeze({ userId: 9, role: "LANDLORD" });

interface ServiceFixtureOptions {
  readonly status?: ListingStatus;
  readonly imageCount?: number;
  readonly listingExists?: boolean;
  readonly targetExists?: boolean;
  readonly deleteResult?: boolean;
  readonly updateResult?: boolean;
  readonly transactionFailure?: Error;
  readonly commitFailure?: Error;
  readonly providerFailure?: Error;
}

function makeFixture(options: ServiceFixtureOptions = {}) {
  const status = options.status ?? "APPROVED";
  const imageCount = options.imageCount ?? 2;
  const events: string[] = [];
  const images = Array.from({ length: imageCount }, (_, index) => ({
    id: index === 0 ? 31 : 32 + index,
    cloudinaryPublicId: index === 0 ? "private/target" : `private/other-${index}`,
    displayOrder: index + 1
  }));
  if (options.targetExists === false && images.length > 0) images[0] = { ...images[0]!, id: 99 };

  const repository: ListingImageDeleteRepository = {
    lockOwnedListing: vi.fn(async (listingId, landlordId) => {
      events.push(`lock:${listingId}:${landlordId}`);
      return options.listingExists === false ? null : { id: listingId, status };
    }),
    findCurrentImages: vi.fn(async (listingId) => {
      events.push(`images:${listingId}`);
      return images;
    }),
    deleteListingImage: vi.fn(async (listingId, imageId) => {
      events.push(`delete:${listingId}:${imageId}`);
      if (options.transactionFailure) throw options.transactionFailure;
      return options.deleteResult ?? true;
    }),
    updateListingAfterImageDeletion: vi.fn(async (input) => {
      events.push(`update:${input.currentStatus}:${input.resultingStatus}:${input.landlordId}`);
      return options.updateResult ?? true;
    })
  };
  const repositoryFactory: ListingImageDeleteRepositoryFactory = vi.fn(() => repository);
  const transactionRunner: TransactionRunner = vi.fn(async (operation) => {
    events.push("transaction-start");
    const value = await operation(executor);
    if (options.commitFailure) throw options.commitFailure;
    events.push("transaction-commit");
    return value;
  });
  const cloudinaryClient: CloudinaryClient = {
    uploadImage: vi.fn(async () => {
      throw new Error("Upload is outside RM-030");
    }),
    removeImage: vi.fn(async (publicId) => {
      events.push(`provider-remove:${publicId}`);
      if (options.providerFailure) throw options.providerFailure;
    })
  };
  const logger = { warn: vi.fn() };
  const service = createListingImageDeleteService({
    transactionRunner,
    cloudinaryClient,
    logger,
    repositoryFactory
  });
  return { service, repository, transactionRunner, cloudinaryClient, logger, events };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("RM-030 listing image delete service", () => {
  it.each(["TENANT", "ADMIN"] as const)("defensively rejects %s without transaction or provider work", async (role) => {
    const fixture = makeFixture();
    await expectCode(fixture.service.deleteOwnedImage({ userId: 9, role }, 7, 31), "FORBIDDEN");
    expect(fixture.transactionRunner).not.toHaveBeenCalled();
    expect(fixture.cloudinaryClient.removeImage).not.toHaveBeenCalled();
  });

  it("uses principal.userId as the authoritative owner predicate", async () => {
    const fixture = makeFixture({ status: "DRAFT", imageCount: 1 });
    await fixture.service.deleteOwnedImage({ userId: 41, role: "LANDLORD" }, 7, 31);
    expect(fixture.repository.lockOwnedListing).toHaveBeenCalledWith(7, 41);
    expect(fixture.repository.updateListingAfterImageDeletion).toHaveBeenCalledWith(
      expect.objectContaining({ landlordId: 41 })
    );
  });

  it.each([
    ["missing listing", { listingExists: false }],
    ["missing or mismatched image", { targetExists: false }]
  ] as const)("maps %s to one generic 404 without provider work", async (_name, options) => {
    const fixture = makeFixture(options);
    await expect(fixture.service.deleteOwnedImage(landlord, 7, 31)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(fixture.repository.deleteListingImage).not.toHaveBeenCalled();
    expect(fixture.cloudinaryClient.removeImage).not.toHaveBeenCalled();
  });

  it("allows a DRAFT to delete its final image and updates its timestamp path", async () => {
    const fixture = makeFixture({ status: "DRAFT", imageCount: 1 });
    await fixture.service.deleteOwnedImage(landlord, 7, 31);
    expect(fixture.repository.deleteListingImage).toHaveBeenCalledOnce();
    expect(fixture.repository.updateListingAfterImageDeletion).toHaveBeenCalledWith({
      listingId: 7,
      landlordId: 9,
      currentStatus: "DRAFT",
      resultingStatus: "DRAFT"
    });
  });

  it.each(["PENDING", "REJECTED", "APPROVED", "INACTIVE", "HIDDEN"] as const)(
    "protects the final image while current state is %s",
    async (status) => {
      const fixture = makeFixture({ status, imageCount: 1 });
      await expect(fixture.service.deleteOwnedImage(landlord, 7, 31)).rejects.toMatchObject({
        code: "LAST_IMAGE_REQUIRED",
        message: "A non-draft listing must retain at least one image.",
        details: []
      });
      expect(fixture.repository.deleteListingImage).not.toHaveBeenCalled();
      expect(fixture.repository.updateListingAfterImageDeletion).not.toHaveBeenCalled();
      expect(fixture.cloudinaryClient.removeImage).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["DRAFT", "DRAFT"],
    ["PENDING", "PENDING"],
    ["REJECTED", "DRAFT"],
    ["APPROVED", "PENDING"],
    ["INACTIVE", "PENDING"],
    ["HIDDEN", "HIDDEN"]
  ] as const)("applies significant deletion lifecycle %s -> %s", async (status, resultingStatus) => {
    const fixture = makeFixture({ status, imageCount: 2 });
    await fixture.service.deleteOwnedImage(landlord, 7, 31);
    expect(fixture.repository.updateListingAfterImageDeletion).toHaveBeenCalledWith({
      listingId: 7,
      landlordId: 9,
      currentStatus: status,
      resultingStatus
    });
  });

  it.each([
    ["metadata deletion", { deleteResult: false }],
    ["listing update", { updateResult: false }]
  ] as const)("maps stale %s to 409 and never calls provider", async (_name, options) => {
    const fixture = makeFixture(options);
    await expectCode(fixture.service.deleteOwnedImage(landlord, 7, 31), "CONCURRENT_MODIFICATION");
    expect(fixture.cloudinaryClient.removeImage).not.toHaveBeenCalled();
  });

  it.each([
    ["repository failure", { transactionFailure: new Error("private repository failure") }],
    ["commit failure", { commitFailure: new Error("private commit failure") }]
  ] as const)("propagates %s without provider cleanup", async (_name, options) => {
    const fixture = makeFixture(options);
    await expect(fixture.service.deleteOwnedImage(landlord, 7, 31)).rejects.toThrow();
    expect(fixture.cloudinaryClient.removeImage).not.toHaveBeenCalled();
  });

  it("captures the provider ID internally and removes exactly once only after transaction commit", async () => {
    const fixture = makeFixture();
    await fixture.service.deleteOwnedImage(landlord, 7, 31);
    expect(fixture.cloudinaryClient.removeImage).toHaveBeenCalledOnce();
    expect(fixture.cloudinaryClient.removeImage).toHaveBeenCalledWith("private/target");
    expect(fixture.events).toStrictEqual([
      "transaction-start",
      "lock:7:9",
      "images:7",
      "delete:7:31",
      "update:APPROVED:PENDING:9",
      "transaction-commit",
      "provider-remove:private/target"
    ]);
  });

  it("logs one safe warning and preserves success when post-commit cleanup fails", async () => {
    const fixture = makeFixture({ providerFailure: new Error("private provider message") });
    await expect(fixture.service.deleteOwnedImage(landlord, 7, 31)).resolves.toBeUndefined();
    expect(fixture.cloudinaryClient.removeImage).toHaveBeenCalledOnce();
    expect(fixture.logger.warn).toHaveBeenCalledWith("Listing image delete cleanup failed after database commit.", {
      operation: "listing-image-delete-cleanup",
      listingId: 7,
      imageId: 31,
      assetCount: 1,
      errorType: "Error"
    });
    expect(JSON.stringify(vi.mocked(fixture.logger.warn).mock.calls)).not.toMatch(
      /private\/target|private provider message|secureUrl|cookie|token/i
    );
  });

  it("returns generic 404 on a repeated deletion without a second provider call", async () => {
    const fixture = makeFixture({ status: "DRAFT", imageCount: 1 });
    await fixture.service.deleteOwnedImage(landlord, 7, 31);
    vi.mocked(fixture.repository.findCurrentImages).mockResolvedValueOnce([]);
    await expectCode(fixture.service.deleteOwnedImage(landlord, 7, 31), "RESOURCE_NOT_FOUND");
    expect(fixture.cloudinaryClient.removeImage).toHaveBeenCalledOnce();
  });
});
