import { describe, expect, it, vi } from "vitest";
import type { SqlExecutor } from "../src/db/sql-executor.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import type { ModerationActionRepository } from "../src/modules/listings/moderation-action-repository.js";
import { createModerationActionService } from "../src/modules/listings/moderation-action-service.js";
import type { ModerationActionInput } from "../src/modules/listings/moderation-action-validation.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";

const createdAt = new Date("2026-08-10T00:00:00.000Z");
const admin = Object.freeze({ userId: 3, role: "ADMIN" as const });

function setup(status: ListingStatus | null, updated = true) {
  const calls: string[] = [];
  const executor = {} as SqlExecutor;
  const repository: ModerationActionRepository = {
    lockListing: vi.fn(async () => {
      calls.push("lock");
      return status === null ? null : { id: 42, status };
    }),
    transitionStatus: vi.fn(async () => {
      calls.push("update");
      return updated;
    }),
    insertHistory: vi.fn(async (input) => {
      calls.push("insert-map");
      return { id: 301, ...input, createdAt };
    })
  };
  let runnerCalls = 0;
  const transactionRunner: TransactionRunner = async <Value>(operation: (value: SqlExecutor) => Promise<Value>) => {
    runnerCalls += 1;
    return operation(executor);
  };
  const service = createModerationActionService({
    transactionRunner,
    repositoryFactory: (received) => {
      expect(received).toBe(executor);
      return repository;
    }
  });
  return { service, repository, calls, runnerCalls: () => runnerCalls };
}

const cases = [
  ["APPROVE", "PENDING", "APPROVED", null],
  ["REJECT", "PENDING", "REJECTED", "bad"],
  ["HIDE", "APPROVED", "HIDDEN", "policy"],
  ["RESTORE", "HIDDEN", "APPROVED", "note"]
] as const;

describe("RM-042 moderation action service", () => {
  it.each(cases)("runs %s atomically from %s to %s", async (action, source, target, reason) => {
    const fixture = setup(source);
    await expect(fixture.service.moderateListing(admin, 42, { action, reason })).resolves.toMatchObject({
      listingId: 42,
      adminId: 3,
      previousStatus: source,
      newStatus: target,
      reason
    });
    expect(fixture.repository.transitionStatus).toHaveBeenCalledWith(42, {
      expectedStatus: source,
      nextStatus: target
    });
    expect(fixture.repository.insertHistory).toHaveBeenCalledWith({
      listingId: 42,
      adminId: 3,
      previousStatus: source,
      newStatus: target,
      reason
    });
    expect(fixture.calls).toStrictEqual(["lock", "update", "insert-map"]);
    expect(fixture.runnerCalls()).toBe(1);
  });

  it("rejects a non-admin before opening a transaction", async () => {
    const fixture = setup("PENDING");
    await expect(
      fixture.service.moderateListing({ userId: 3, role: "LANDLORD" }, 42, { action: "APPROVE", reason: null })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fixture.runnerCalls()).toBe(0);
  });

  it("maps missing listing to generic 404", async () => {
    const fixture = setup(null);
    await expect(fixture.service.moderateListing(admin, 42, { action: "APPROVE", reason: null })).rejects.toMatchObject(
      {
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found."
      }
    );
    expect(fixture.calls).toStrictEqual(["lock"]);
  });

  it.each(cases)(
    "rejects every wrong locked source for %s without writes",
    async (action, expected, _target, reason) => {
      const wrong = expected === "PENDING" ? "APPROVED" : "PENDING";
      const fixture = setup(wrong);
      await expect(
        fixture.service.moderateListing(admin, 42, { action, reason } as ModerationActionInput)
      ).rejects.toMatchObject({ code: "INVALID_LISTING_TRANSITION" });
      expect(fixture.calls).toStrictEqual(["lock"]);
    }
  );

  it("distinguishes a conditional zero-row update and never inserts history", async () => {
    const fixture = setup("PENDING", false);
    await expect(fixture.service.moderateListing(admin, 42, { action: "APPROVE", reason: null })).rejects.toMatchObject(
      {
        code: "CONCURRENT_MODIFICATION"
      }
    );
    expect(fixture.calls).toStrictEqual(["lock", "update"]);
    expect(fixture.repository.insertHistory).not.toHaveBeenCalled();
  });

  it("propagates insert/mapping failure from inside the transaction callback", async () => {
    const fixture = setup("PENDING");
    vi.mocked(fixture.repository.insertHistory).mockRejectedValueOnce(new Error("synthetic mapping failure"));
    await expect(fixture.service.moderateListing(admin, 42, { action: "APPROVE", reason: null })).rejects.toThrow(
      "synthetic mapping failure"
    );
    expect(fixture.calls).toStrictEqual(["lock", "update"]);
  });
});
