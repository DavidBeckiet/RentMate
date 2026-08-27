import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "../../shared/src/runtime/shared/logging/logger.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { RoommateRepository } from "../src/modules/roommate/repositories/roommate-repository.js";
import {
  createRoommateExpirationScheduler,
  roommateExpirationPolicy
} from "../src/modules/roommate/services/roommate-expiration-scheduler.js";

const executor = {} as SqlExecutor;

function loggerHarness(): { readonly logger: Pick<Logger, "info" | "error">; readonly entries: string[] } {
  const entries: string[] = [];
  return {
    entries,
    logger: {
      info: (message) => entries.push(`info:${message}`),
      error: (message) => entries.push(`error:${message}`)
    }
  };
}

test("coalesces roommate expiry runs and reports expiration/reminder counts", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const repository = {
    sweepExpired: async () => {
      calls += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return 2;
    },
    createDueExpiryReminders: async () => 1
  } as unknown as RoommateRepository;
  const logs = loggerHarness();
  const scheduler = createRoommateExpirationScheduler({
    repository,
    transactionRunner: { run: (operation) => operation(executor) },
    logger: logs.logger
  });
  const first = scheduler.runOnce();
  const second = scheduler.runOnce();
  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  release?.();
  assert.deepEqual(await first, { expired: 2, reminders: 1 });
  assert.deepEqual(logs.entries, ["info:Roommate expiration processing completed"]);
});

test("logs failures and keeps scheduler retryable", async () => {
  let calls = 0;
  const repository = {
    sweepExpired: async () => {
      calls += 1;
      throw new Error("database unavailable");
    },
    createDueExpiryReminders: async () => 0
  } as unknown as RoommateRepository;
  const logs = loggerHarness();
  const scheduler = createRoommateExpirationScheduler({
    repository,
    transactionRunner: { run: (operation) => operation(executor) },
    logger: logs.logger,
    intervalMs: roommateExpirationPolicy.intervalMs
  });
  assert.deepEqual(await scheduler.runOnce(), { expired: 0, reminders: 0 });
  assert.deepEqual(await scheduler.runOnce(), { expired: 0, reminders: 0 });
  assert.equal(calls, 2);
  assert.deepEqual(logs.entries, [
    "error:Roommate expiration processing failed",
    "error:Roommate expiration processing failed"
  ]);
});
