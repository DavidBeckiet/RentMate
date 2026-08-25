import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { Logger } from "../../../../../shared/src/runtime/shared/logging/logger.js";
import type { LeadReminderNotificationRepository } from "../repositories/lead-reminder-notification-repository.js";

export const leadReminderSchedulerPolicy = Object.freeze({
  intervalMs: 30_000,
  batchSize: 100
});

export interface LeadReminderSchedulerTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export interface LeadReminderScheduler {
  readonly runOnce: () => Promise<number>;
  readonly start: () => void;
  readonly stop: () => void;
}

export function createLeadReminderScheduler(dependencies: {
  readonly repository: LeadReminderNotificationRepository;
  readonly transactionRunner: LeadReminderSchedulerTransactionRunner;
  readonly logger: Pick<Logger, "info" | "error">;
  readonly now?: () => Date;
  readonly intervalMs?: number;
  readonly batchSize?: number;
}): LeadReminderScheduler {
  const {
    repository,
    transactionRunner,
    logger,
    now = () => new Date(),
    intervalMs = leadReminderSchedulerPolicy.intervalMs,
    batchSize = leadReminderSchedulerPolicy.batchSize
  } = dependencies;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<number> | undefined;

  const runOnce = (): Promise<number> => {
    if (inFlight) return inFlight;

    inFlight = transactionRunner
      .run((executor) => repository.createDueNotifications(executor, now(), batchSize))
      .then((createdCount) => {
        if (createdCount > 0) {
          logger.info("Lead reminder notifications created", { count: createdCount });
        }
        return createdCount;
      })
      .catch((error: unknown) => {
        logger.error("Lead reminder notification processing failed", {
          errorType: error instanceof Error ? error.name : "UnknownError"
        });
        return 0;
      })
      .finally(() => {
        inFlight = undefined;
      });

    return inFlight;
  };

  const scheduler: LeadReminderScheduler = {
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
