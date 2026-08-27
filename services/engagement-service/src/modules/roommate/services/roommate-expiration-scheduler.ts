import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { Logger } from "../../../../../shared/src/runtime/shared/logging/logger.js";
import type { RoommateRepository } from "../repositories/roommate-repository.js";

export const roommateExpirationPolicy = Object.freeze({
  requestLifetimeDays: 30,
  reminderLeadDays: 3,
  intervalMs: 30_000,
  batchSize: 100
});

export interface RoommateExpirationScheduler {
  readonly runOnce: () => Promise<Readonly<{ expired: number; reminders: number }>>;
  readonly start: () => void;
  readonly stop: () => void;
}

export interface RoommateExpirationTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export function createRoommateExpirationScheduler(dependencies: {
  readonly repository: RoommateRepository;
  readonly transactionRunner: RoommateExpirationTransactionRunner;
  readonly logger: Pick<Logger, "info" | "error">;
  readonly now?: () => Date;
  readonly intervalMs?: number;
  readonly batchSize?: number;
  readonly reminderLeadDays?: number;
}): RoommateExpirationScheduler {
  const {
    repository,
    transactionRunner,
    logger,
    now = () => new Date(),
    intervalMs = roommateExpirationPolicy.intervalMs,
    batchSize = roommateExpirationPolicy.batchSize,
    reminderLeadDays = roommateExpirationPolicy.reminderLeadDays
  } = dependencies;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<Readonly<{ expired: number; reminders: number }>> | undefined;

  const runOnce = (): Promise<Readonly<{ expired: number; reminders: number }>> => {
    if (inFlight) return inFlight;
    inFlight = transactionRunner
      .run(async (executor) => {
        const currentTime = now();
        const expired = await repository.sweepExpired(executor, currentTime, batchSize);
        const reminders = await repository.createDueExpiryReminders(executor, currentTime, reminderLeadDays, batchSize);
        return Object.freeze({ expired, reminders });
      })
      .then((result) => {
        if (result.expired > 0 || result.reminders > 0) {
          logger.info("Roommate expiration processing completed", result);
        }
        return result;
      })
      .catch((error: unknown) => {
        logger.error("Roommate expiration processing failed", {
          errorType: error instanceof Error ? error.name : "UnknownError"
        });
        return Object.freeze({ expired: 0, reminders: 0 });
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };

  const scheduler: RoommateExpirationScheduler = {
    runOnce,
    start() {
      if (timer) return;
      void runOnce();
      timer = setInterval(() => void runOnce(), intervalMs);
      timer.unref();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    }
  };
  return Object.freeze(scheduler);
}
