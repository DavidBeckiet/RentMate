import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type { Logger } from "../../shared/src/runtime/shared/logging/logger.js";
import type { LeadReminderNotificationRepository } from "../src/modules/leads/repositories/lead-reminder-notification-repository.js";
import {
  createLeadReminderScheduler,
  leadReminderSchedulerPolicy
} from "../src/modules/leads/services/lead-reminder-scheduler.js";

const executor = {} as SqlExecutor;

function loggerHarness() {
  const entries: string[] = [];
  const logger: Pick<Logger, "info" | "error"> = {
    info: (message) => entries.push(`info:${message}`),
    error: (message) => entries.push(`error:${message}`)
  };
  return { logger, entries };
}

test("coalesces overlapping runs and reports the number of notifications created", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const repository: LeadReminderNotificationRepository = {
    createDueNotifications: async () => {
      calls += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return 2;
    }
  };
  const logs = loggerHarness();
  const scheduler = createLeadReminderScheduler({
    repository,
    transactionRunner: { run: (operation) => operation(executor) },
    logger: logs.logger
  });

  const first = scheduler.runOnce();
  const second = scheduler.runOnce();
  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  release?.();
  assert.equal(await first, 2);
  assert.deepEqual(logs.entries, ["info:Lead reminder notifications created"]);
});

test("logs processing failures without stopping the scheduler", async () => {
  let calls = 0;
  const repository: LeadReminderNotificationRepository = {
    createDueNotifications: async () => {
      calls += 1;
      throw new Error("database unavailable");
    }
  };
  const logs = loggerHarness();
  const scheduler = createLeadReminderScheduler({
    repository,
    transactionRunner: { run: (operation) => operation(executor) },
    logger: logs.logger,
    intervalMs: leadReminderSchedulerPolicy.intervalMs
  });

  assert.equal(await scheduler.runOnce(), 0);
  assert.equal(await scheduler.runOnce(), 0);
  assert.equal(calls, 2);
  assert.deepEqual(logs.entries, [
    "error:Lead reminder notification processing failed",
    "error:Lead reminder notification processing failed"
  ]);
});
