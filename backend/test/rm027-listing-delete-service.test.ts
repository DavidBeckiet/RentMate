import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import type { ListingDeleteCleanupHandoff } from "../src/modules/listings/listing-delete-cleanup.js";
import type { ListingDeleteRepository } from "../src/modules/listings/listing-delete-repository.js";
import { createListingDeleteService } from "../src/modules/listings/listing-delete-service.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import type { Logger } from "../src/shared/logging/logger.js";

const principal = Object.freeze({ userId: 9, role: "LANDLORD" as const });

interface SetupOptions {
  readonly status?: ListingStatus | null;
  readonly hasHistory?: boolean;
  readonly publicIds?: readonly string[];
  readonly deleted?: boolean;
  readonly commitFailure?: boolean;
  readonly cleanupFailure?: unknown;
}

function setup(options: SetupOptions = {}) {
  const calls: string[] = [];
  const executor = {} as SqlExecutor;
  const returnedFromTransaction: unknown[] = [];
  const repository: ListingDeleteRepository = {
    lockOwnedListing: vi.fn(async () => {
      calls.push("lock");
      const status = options.status === undefined ? "DRAFT" : options.status;
      return status === null ? null : Object.freeze({ id: 7, status });
    }),
    hasModerationHistory: vi.fn(async () => {
      calls.push("history");
      return options.hasHistory ?? false;
    }),
    findCloudinaryPublicIds: vi.fn(async () => {
      calls.push("ids");
      return options.publicIds ?? ["rentmate/a", "rentmate/b"];
    }),
    deleteOwnedDraft: vi.fn(async () => {
      calls.push("delete");
      return options.deleted ?? true;
    })
  };
  let runnerCalls = 0;
  const transactionRunner: TransactionRunner = async <Value>(operation: (value: SqlExecutor) => Promise<Value>) => {
    runnerCalls += 1;
    calls.push("transaction");
    const value = await operation(executor);
    returnedFromTransaction.push(value);
    calls.push("commit");
    if (options.commitFailure) throw new Error("synthetic commit failure");
    return value;
  };
  const cleanupHandoff: ListingDeleteCleanupHandoff = {
    afterCommittedDelete: vi.fn(async () => {
      calls.push("cleanup");
      if (options.cleanupFailure !== undefined) throw options.cleanupFailure;
    })
  };
  const logger: Pick<Logger, "warn"> = { warn: vi.fn() };
  const service = createListingDeleteService({
    transactionRunner,
    cleanupHandoff,
    logger,
    repositoryFactory: (received) => {
      expect(received).toBe(executor);
      return repository;
    }
  });
  return {
    calls,
    cleanupHandoff,
    logger,
    repository,
    returnedFromTransaction,
    runnerCalls: () => runnerCalls,
    service
  };
}

describe("RM-027 listing delete service", () => {
  it("deletes an eligible owned DRAFT and hands off exact frozen IDs after commit", async () => {
    const fixture = setup();
    await fixture.service.deleteOwnedListing(principal, 7);
    expect(fixture.repository.lockOwnedListing).toHaveBeenCalledWith(7, 9);
    expect(fixture.repository.deleteOwnedDraft).toHaveBeenCalledWith(7, 9);
    expect(fixture.runnerCalls()).toBe(1);
    expect(fixture.calls).toStrictEqual(["transaction", "lock", "history", "ids", "delete", "commit", "cleanup"]);
    expect(fixture.returnedFromTransaction).toHaveLength(1);
    expect(fixture.returnedFromTransaction[0]).toStrictEqual(["rentmate/a", "rentmate/b"]);
    expect(Object.isFrozen(fixture.returnedFromTransaction[0])).toBe(true);
    expect(fixture.cleanupHandoff.afterCommittedDelete).toHaveBeenCalledOnce();
    expect(fixture.cleanupHandoff.afterCommittedDelete).toHaveBeenCalledWith(["rentmate/a", "rentmate/b"]);
  });

  it("hands off one frozen empty collection for a draft without images", async () => {
    const fixture = setup({ publicIds: [] });
    await fixture.service.deleteOwnedListing(principal, 7);
    const ids = vi.mocked(fixture.cleanupHandoff.afterCommittedDelete).mock.calls[0]![0];
    expect(ids).toStrictEqual([]);
    expect(Object.isFrozen(ids)).toBe(true);
    expect(fixture.cleanupHandoff.afterCommittedDelete).toHaveBeenCalledOnce();
  });

  it.each(["TENANT", "ADMIN"] as const)("rejects %s before opening a transaction", async (role) => {
    const fixture = setup();
    await expect(fixture.service.deleteOwnedListing({ userId: 9, role }, 7)).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    expect(fixture.runnerCalls()).toBe(0);
    expect(fixture.calls).toStrictEqual([]);
  });

  it("uses a generic owner-safe 404 and stops after lock", async () => {
    const fixture = setup({ status: null });
    await expect(fixture.service.deleteOwnedListing(principal, 7)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(fixture.calls).toStrictEqual(["transaction", "lock"]);
    expect(fixture.cleanupHandoff.afterCommittedDelete).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const)(
    "rejects non-DRAFT %s immediately after lock",
    async (status) => {
      const fixture = setup({ status });
      await expect(fixture.service.deleteOwnedListing(principal, 7)).rejects.toMatchObject({
        code: "LISTING_DELETE_NOT_ALLOWED",
        message: "The listing cannot be deleted.",
        details: []
      });
      expect(fixture.calls).toStrictEqual(["transaction", "lock"]);
      expect(fixture.cleanupHandoff.afterCommittedDelete).not.toHaveBeenCalled();
    }
  );

  it("rejects a DRAFT with any moderation history before ID capture", async () => {
    const fixture = setup({ hasHistory: true });
    await expect(fixture.service.deleteOwnedListing(principal, 7)).rejects.toMatchObject({
      code: "LISTING_DELETE_NOT_ALLOWED",
      message: "The listing cannot be deleted."
    });
    expect(fixture.calls).toStrictEqual(["transaction", "lock", "history"]);
    expect(fixture.cleanupHandoff.afterCommittedDelete).not.toHaveBeenCalled();
  });

  it("maps a legal zero-row delete to concurrent modification without cleanup", async () => {
    const fixture = setup({ deleted: false });
    await expect(fixture.service.deleteOwnedListing(principal, 7)).rejects.toMatchObject({
      code: "CONCURRENT_MODIFICATION",
      message: "The listing changed during this request."
    });
    expect(fixture.calls).toStrictEqual(["transaction", "lock", "history", "ids", "delete"]);
    expect(fixture.cleanupHandoff.afterCommittedDelete).not.toHaveBeenCalled();
  });

  it("does not hand off after a repository or commit failure", async () => {
    const repositoryFailure = setup();
    vi.mocked(repositoryFailure.repository.findCloudinaryPublicIds).mockRejectedValueOnce(
      new Error("synthetic ID failure")
    );
    await expect(repositoryFailure.service.deleteOwnedListing(principal, 7)).rejects.toThrow("synthetic ID failure");
    expect(repositoryFailure.cleanupHandoff.afterCommittedDelete).not.toHaveBeenCalled();

    const commitFailure = setup({ commitFailure: true });
    await expect(commitFailure.service.deleteOwnedListing(principal, 7)).rejects.toThrow("synthetic commit failure");
    expect(commitFailure.calls.at(-1)).toBe("commit");
    expect(commitFailure.cleanupHandoff.afterCommittedDelete).not.toHaveBeenCalled();
  });

  it("awaits the cleanup handoff", async () => {
    const fixture = setup();
    let releaseCleanup!: () => void;
    const cleanupPending = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    vi.mocked(fixture.cleanupHandoff.afterCommittedDelete).mockImplementationOnce(async () => {
      fixture.calls.push("cleanup-pending");
      await cleanupPending;
      fixture.calls.push("cleanup-resolved");
    });
    let resolved = false;
    const deletion = fixture.service.deleteOwnedListing(principal, 7).then(() => {
      resolved = true;
    });
    await vi.waitFor(() => expect(fixture.calls).toContain("cleanup-pending"));
    expect(resolved).toBe(false);
    releaseCleanup();
    await deletion;
    expect(resolved).toBe(true);
  });

  it("swallows cleanup rejection and emits one safe structured warning", async () => {
    const fixture = setup({
      publicIds: ["private/provider-id"],
      cleanupFailure: new Error("private URL https://provider.test and credential detail")
    });
    await expect(fixture.service.deleteOwnedListing(principal, 7)).resolves.toBeUndefined();
    expect(fixture.logger.warn).toHaveBeenCalledOnce();
    expect(fixture.logger.warn).toHaveBeenCalledWith("Listing delete cleanup handoff failed after database commit.", {
      listingId: 7,
      assetCount: 1,
      errorType: "Error"
    });
    expect(JSON.stringify(vi.mocked(fixture.logger.warn).mock.calls)).not.toMatch(
      /private\/provider-id|provider\.test|credential detail|stack/i
    );
  });
});
