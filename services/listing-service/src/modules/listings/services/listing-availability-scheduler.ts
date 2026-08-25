import type { EngagementNotificationClient } from "../../../../../shared/engagement-notification-client.js";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { Logger } from "../../../../../shared/src/runtime/shared/logging/logger.js";
import type {
  ListingAvailabilityNotificationJob,
  ListingAvailabilityRepository
} from "../repositories/listing-availability-repository.js";

export interface ListingAvailabilitySchedulerTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

export interface ListingAvailabilityScheduler {
  readonly runOnce: () => Promise<number>;
  readonly start: () => void;
  readonly stop: () => void;
}

export function createListingAvailabilityScheduler(dependencies: {
  readonly repository: ListingAvailabilityRepository;
  readonly transactionRunner: ListingAvailabilitySchedulerTransactionRunner;
  readonly notificationClient?: Pick<EngagementNotificationClient, "notifyListingAvailabilityReminder">;
  readonly logger: Pick<Logger, "info" | "warn" | "error">;
  readonly reminderDays: number;
  readonly graceDays: number;
  readonly intervalMs: number;
  readonly batchSize: number;
  readonly now?: () => Date;
}): ListingAvailabilityScheduler {
  const { repository, transactionRunner, notificationClient, logger, now = () => new Date() } = dependencies;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<number> | undefined;

  const deliver = async (job: ListingAvailabilityNotificationJob): Promise<void> => {
    if (!notificationClient) {
      logger.warn("Listing availability notification client is unavailable", { listingId: job.listingId });
      return;
    }

    try {
      await notificationClient.notifyListingAvailabilityReminder({
        landlordId: job.landlordId,
        listingId: job.listingId,
        kind: job.kind,
        dedupeKey: job.dedupeKey
      });
      await transactionRunner.run((executor) => repository.markNotificationDelivered(executor, job));
    } catch (error) {
      logger.error("Listing availability notification delivery failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
        listingId: job.listingId,
        kind: job.kind
      });
    }
  };

  const runOnce = (): Promise<number> => {
    if (inFlight) return inFlight;

    inFlight = transactionRunner
      .run((executor) =>
        repository.processDueListings(executor, {
          now: now(),
          reminderDays: dependencies.reminderDays,
          graceDays: dependencies.graceDays,
          limit: dependencies.batchSize
        })
      )
      .then(async (jobs) => {
        for (const job of jobs) await deliver(job);
        if (jobs.length > 0) logger.info("Listing availability reminders processed", { count: jobs.length });
        return jobs.length;
      })
      .catch((error: unknown) => {
        logger.error("Listing availability scan failed", {
          errorType: error instanceof Error ? error.name : "UnknownError"
        });
        return 0;
      })
      .finally(() => {
        inFlight = undefined;
      });

    return inFlight;
  };

  return Object.freeze({
    runOnce,
    start() {
      if (timer) return;
      void runOnce();
      timer = setInterval(() => void runOnce(), dependencies.intervalMs);
      timer.unref();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    }
  });
}
