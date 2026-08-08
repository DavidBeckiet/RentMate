import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import type { CloudinaryClient } from "../src/integrations/cloudinary.client.js";
import { createListingDeleteCloudinaryCleanup } from "../src/modules/listings/listing-delete-cloudinary-cleanup.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import type { ListingImageUploadRepository } from "../src/modules/listings/listing-image-upload-repository.js";
import { createListingImageUploadService } from "../src/modules/listings/listing-image-upload-service.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import type { Logger } from "../src/shared/logging/logger.js";

const principal = Object.freeze({ userId: 9, role: "LANDLORD" as const });
const uploaded = Object.freeze({
  publicId: "private/provider-id",
  secureUrl: "https://provider.test/image.jpg",
  format: "jpg" as const,
  width: 1200,
  height: 800,
  byteSize: 100_000
});
const ownerImage = Object.freeze({
  id: 31,
  url: uploaded.secureUrl,
  format: "jpg",
  width: 1200,
  height: 800,
  byteSize: 100_000,
  displayOrder: 3,
  altText: "Room",
  createdAt: new Date("2026-08-08T00:00:00Z")
});
const validatedUpload = Object.freeze({
  buffer: Buffer.from([0xff, 0xd8, 0xff]),
  mimeType: "image/jpeg" as const,
  altText: "Room"
});

interface SetupOptions {
  readonly preflightCount?: number;
  readonly preflightMissing?: boolean;
  readonly lockedStatus?: ListingStatus | null;
  readonly slots?: readonly number[];
  readonly updateResult?: boolean;
  readonly uploadFailure?: unknown;
  readonly insertFailure?: unknown;
  readonly commitFailure?: unknown;
  readonly compensationFailure?: unknown;
}

function setup(options: SetupOptions = {}) {
  const calls: string[] = [];
  const executor = {} as SqlExecutor;
  const preflightRepository: ListingImageUploadRepository = {
    findOwnedImageCount: vi.fn(async (_listingId, landlordId) => {
      calls.push(`preflight:${landlordId}`);
      return options.preflightMissing ? null : { listingId: 7, imageCount: options.preflightCount ?? 0 };
    }),
    lockOwnedListing: vi.fn(),
    findCurrentImageSlots: vi.fn(),
    insertImageMetadata: vi.fn(),
    updateListingAfterImageAddition: vi.fn()
  };
  const transactionRepository: ListingImageUploadRepository = {
    findOwnedImageCount: vi.fn(),
    lockOwnedListing: vi.fn(async () => {
      calls.push("lock");
      const status = options.lockedStatus === undefined ? "APPROVED" : options.lockedStatus;
      return status === null ? null : { id: 7, status };
    }),
    findCurrentImageSlots: vi.fn(async () => {
      calls.push("slots");
      return (options.slots ?? [1, 2, 4]).map((displayOrder, index) => ({ id: index + 1, displayOrder }));
    }),
    insertImageMetadata: vi.fn(async (input) => {
      calls.push(`insert:${input.displayOrder}`);
      if (options.insertFailure !== undefined) throw options.insertFailure;
      return { ...ownerImage, displayOrder: input.displayOrder };
    }),
    updateListingAfterImageAddition: vi.fn(async (input) => {
      calls.push(`update:${input.currentStatus}:${input.resultingStatus}`);
      return options.updateResult ?? true;
    })
  };
  const cloudinaryClient: CloudinaryClient = {
    uploadImage: vi.fn(async () => {
      calls.push("upload");
      if (options.uploadFailure !== undefined) throw options.uploadFailure;
      return uploaded;
    }),
    removeImage: vi.fn(async () => {
      calls.push("compensate");
      if (options.compensationFailure !== undefined) throw options.compensationFailure;
    })
  };
  const transactionRunner: TransactionRunner = async (operation) => {
    calls.push("transaction");
    const value = await operation(executor);
    calls.push("commit");
    if (options.commitFailure !== undefined) throw options.commitFailure;
    return value;
  };
  const logger: Pick<Logger, "warn"> = { warn: vi.fn() };
  const service = createListingImageUploadService({
    preflightRepository,
    transactionRunner,
    cloudinaryClient,
    logger,
    repositoryFactory: (received) => {
      expect(received).toBe(executor);
      return transactionRepository;
    }
  });
  return { calls, cloudinaryClient, logger, preflightRepository, service, transactionRepository };
}

async function complete(fixture: ReturnType<typeof setup>) {
  const preflight = await fixture.service.preflightOwnedUpload(principal, 7);
  return fixture.service.completeOwnedUpload(preflight, validatedUpload);
}

describe("RM-029 listing image upload service", () => {
  it.each(["TENANT", "ADMIN"] as const)("defensively rejects %s before owner SQL", async (role) => {
    const fixture = setup();
    await expect(fixture.service.preflightOwnedUpload({ userId: 99, role }, 7)).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    expect(fixture.preflightRepository.findOwnedImageCount).not.toHaveBeenCalled();
  });

  it("uses principal.userId authoritatively and returns an immutable server-created preflight", async () => {
    const fixture = setup();
    const preflight = await fixture.service.preflightOwnedUpload(principal, 7);
    expect(fixture.preflightRepository.findOwnedImageCount).toHaveBeenCalledWith(7, 9);
    expect(preflight).toMatchObject({ listingId: 7, landlordId: 9 });
    expect(Object.isFrozen(preflight)).toBe(true);
  });

  it.each([
    [{ preflightMissing: true }, "RESOURCE_NOT_FOUND"],
    [{ preflightCount: 8 }, "IMAGE_LIMIT_EXCEEDED"]
  ] as const)("stops preflight failures before provider upload", async (options, code) => {
    const fixture = setup(options);
    await expect(fixture.service.preflightOwnedUpload(principal, 7)).rejects.toMatchObject({ code });
    expect(fixture.cloudinaryClient.uploadImage).not.toHaveBeenCalled();
  });

  it("maps provider failure to a sanitized 502 and never opens a transaction", async () => {
    const fixture = setup({ uploadFailure: new Error("private provider credential") });
    const preflight = await fixture.service.preflightOwnedUpload(principal, 7);
    await expect(fixture.service.completeOwnedUpload(preflight, validatedUpload)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      message: "The image provider is unavailable."
    });
    expect(fixture.calls).toStrictEqual(["preflight:9", "upload"]);
  });

  it.each([
    ["DRAFT", "DRAFT"],
    ["PENDING", "PENDING"],
    ["REJECTED", "DRAFT"],
    ["APPROVED", "PENDING"],
    ["INACTIVE", "PENDING"],
    ["HIDDEN", "HIDDEN"]
  ] as const)("applies significant image lifecycle %s to %s and updates even when equal", async (source, result) => {
    const fixture = setup({ lockedStatus: source });
    const image = await complete(fixture);
    expect(fixture.calls).toStrictEqual([
      "preflight:9",
      "upload",
      "transaction",
      "lock",
      "slots",
      "insert:3",
      `update:${source}:${result}`,
      "commit"
    ]);
    expect(fixture.transactionRepository.updateListingAfterImageAddition).toHaveBeenCalledOnce();
    expect(image).toMatchObject({ id: 31, displayOrder: 3 });
    expect(image).not.toHaveProperty("publicId");
    expect(JSON.stringify(image)).not.toContain(uploaded.publicId);
    expect(fixture.cloudinaryClient.uploadImage).toHaveBeenCalledOnce();
  });

  it("compensates exactly once when the locked owner disappears or the locked count reaches eight", async () => {
    for (const [options, code] of [
      [{ lockedStatus: null }, "RESOURCE_NOT_FOUND"],
      [{ slots: [1, 2, 3, 4, 5, 6, 7, 8] }, "IMAGE_LIMIT_EXCEEDED"]
    ] as const) {
      const fixture = setup(options);
      await expect(complete(fixture)).rejects.toMatchObject({ code });
      expect(fixture.cloudinaryClient.removeImage).toHaveBeenCalledOnce();
      expect(fixture.cloudinaryClient.removeImage).toHaveBeenCalledWith(uploaded.publicId);
      expect(fixture.transactionRepository.insertImageMetadata).not.toHaveBeenCalled();
    }
  });

  it.each([
    [{ updateResult: false }, "CONCURRENT_MODIFICATION"],
    [{ insertFailure: new Error("mapping failure") }, "mapping failure"],
    [{ commitFailure: new Error("commit failure") }, "commit failure"]
  ] as const)("preserves %s failure and compensates after transaction rejection", async (options, expected) => {
    const fixture = setup(options);
    const operation = complete(fixture);
    if (expected === "CONCURRENT_MODIFICATION") await expect(operation).rejects.toMatchObject({ code: expected });
    else await expect(operation).rejects.toThrow(expected);
    expect(fixture.cloudinaryClient.removeImage).toHaveBeenCalledOnce();
    expect(fixture.calls.at(-1)).toBe("compensate");
  });

  it("preserves the original error when compensation fails and logs only safe structure", async () => {
    const fixture = setup({
      insertFailure: new Error("original database failure"),
      compensationFailure: new Error("private/provider-id https://provider.test secret")
    });
    await expect(complete(fixture)).rejects.toThrow("original database failure");
    expect(fixture.logger.warn).toHaveBeenCalledOnce();
    expect(fixture.logger.warn).toHaveBeenCalledWith("Listing image upload compensation failed.", {
      operation: "listing-image-upload-compensation",
      listingId: 7,
      assetCount: 1,
      errorType: "Error"
    });
    expect(JSON.stringify(vi.mocked(fixture.logger.warn).mock.calls)).not.toMatch(
      /private\/provider-id|provider\.test|secret/i
    );
  });
});

describe("RM-029 Cloudinary-backed hard-delete cleanup", () => {
  it("makes no provider call for an empty collection", async () => {
    const client: CloudinaryClient = { uploadImage: vi.fn(), removeImage: vi.fn(async () => undefined) };
    await createListingDeleteCloudinaryCleanup(client).afterCommittedDelete([]);
    expect(client.removeImage).not.toHaveBeenCalled();
  });

  it("awaits every removal before aggregate rejection and does not expose IDs", async () => {
    const attempted: string[] = [];
    const client: CloudinaryClient = {
      uploadImage: vi.fn(),
      removeImage: vi.fn(async (publicId) => {
        attempted.push(publicId);
        if (publicId === "private/b") throw new Error("raw provider failure");
      })
    };
    const operation = createListingDeleteCloudinaryCleanup(client).afterCommittedDelete([
      "private/a",
      "private/b",
      "private/c"
    ]);
    await expect(operation).rejects.toMatchObject({ name: "ListingDeleteCloudinaryCleanupError", failureCount: 1 });
    await expect(operation).rejects.not.toThrow(/private\/[abc]|raw provider/i);
    expect(attempted).toStrictEqual(["private/a", "private/b", "private/c"]);
    expect(client.removeImage).toHaveBeenCalledTimes(3);
  });
});
