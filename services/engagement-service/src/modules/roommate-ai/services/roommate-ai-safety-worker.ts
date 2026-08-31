import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type { Logger } from "../../../../../shared/src/runtime/shared/logging/logger.js";
import { isRoommateAiFeatureEnabled, type RoommateAiConfiguration } from "../config/roommate-ai-config.js";
import { roommateAiSafetyPrompt } from "../prompts/safety-prompt.js";
import { roommateAiApplicationVersions } from "../prompts/versions.js";
import type { AiProvider } from "../providers/ai-provider.js";
import { AiProviderError } from "../providers/ai-provider-error.js";
import {
  buildRoommateAiSafetyContext,
  deriveRoommateAiSafetyOutcome,
  roommateAiSafetyJsonSchema,
  type RoommateAiSafetySignalCode,
  validateRoommateAiSafetyOutput
} from "../safety-analysis.js";
import type { RoommateAiSafetyRepository } from "../repositories/roommate-ai-safety-repository.js";

export const roommateAiSafetyWorkerPolicy = Object.freeze({
  scanBatchSize: 100,
  processingBatchSize: 20,
  intervalMs: 2_000,
  leaseMs: 120_000,
  maximumAttempts: 2,
  retryDelaysMs: [20_000, 60_000] as const,
  staleMs: 24 * 60 * 60 * 1_000,
  retentionMs: 180 * 24 * 60 * 60 * 1_000,
  cleanupBatchSize: 100,
  maxOutputTokens: 300
});

export interface RoommateAiSafetyWorker {
  readonly runOnce: () => Promise<Readonly<{ discovered: number; claimed: number; completed: number; failed: number }>>;
  readonly start: () => void;
  readonly stop: () => void;
}
export interface RoommateAiSafetyWorkerTransactionRunner {
  readonly run: <Value>(operation: (executor: SqlExecutor) => Promise<Value>) => Promise<Value>;
}

function sanitizedFailure(error: unknown): { readonly code: string; readonly retryable: boolean } {
  if (error instanceof AiProviderError) {
    return Object.freeze({
      code: error.category,
      retryable: ["TIMEOUT", "RATE_LIMITED", "TRANSPORT", "SERVER_ERROR"].includes(error.category)
    });
  }
  return Object.freeze({ code: "INTERNAL_ERROR", retryable: false });
}

export function createRoommateAiSafetyWorker(dependencies: {
  readonly configuration: RoommateAiConfiguration;
  readonly provider: AiProvider | null;
  readonly repository: RoommateAiSafetyRepository;
  readonly transactionRunner: RoommateAiSafetyWorkerTransactionRunner;
  readonly logger: Pick<Logger, "info" | "error">;
  readonly now?: () => Date;
  readonly intervalMs?: number;
}): RoommateAiSafetyWorker {
  const {
    configuration,
    provider,
    repository,
    transactionRunner,
    logger,
    now = () => new Date(),
    intervalMs = roommateAiSafetyWorkerPolicy.intervalMs
  } = dependencies;
  let timer: NodeJS.Timeout | undefined;
  let inFlight:
    | Promise<Readonly<{ discovered: number; claimed: number; completed: number; failed: number }>>
    | undefined;

  const runOnce = (): Promise<Readonly<{ discovered: number; claimed: number; completed: number; failed: number }>> => {
    if (inFlight) return inFlight;
    if (!isRoommateAiFeatureEnabled(configuration, "SAFETY") || !provider) {
      return Promise.resolve(Object.freeze({ discovered: 0, claimed: 0, completed: 0, failed: 0 }));
    }
    inFlight = (async () => {
      const startedAt = now();
      const discovered = await transactionRunner.run(async (executor) => {
        await repository.terminalizeStale(executor, startedAt, "STALE_WORK");
        return repository.discover(executor, {
          analysisVersion: roommateAiApplicationVersions.safetyAnalysisVersion,
          promptVersion: roommateAiSafetyPrompt.version,
          schemaVersion: roommateAiSafetyPrompt.schemaVersion,
          provider: configuration.provider,
          modelIdentifier: configuration.models.safety,
          now: startedAt,
          batchSize: roommateAiSafetyWorkerPolicy.scanBatchSize
        });
      });
      const claims = await transactionRunner.run((executor) =>
        repository.claim(executor, {
          analysisVersion: roommateAiApplicationVersions.safetyAnalysisVersion,
          now: startedAt,
          leaseExpiresAt: new Date(startedAt.getTime() + roommateAiSafetyWorkerPolicy.leaseMs),
          batchSize: Math.min(roommateAiSafetyWorkerPolicy.processingBatchSize, configuration.maximumConcurrency)
        })
      );
      let completed = 0;
      let failed = 0;
      for (const claim of claims) {
        try {
          const source = await transactionRunner.run((executor) =>
            repository.loadContext(executor, claim.messageId, 5)
          );
          if (!source) {
            await transactionRunner.run((executor) =>
              repository.fail(executor, { id: claim.id, errorCode: "SOURCE_NOT_ELIGIBLE", retryAt: null, now: now() })
            );
            failed += 1;
            continue;
          }
          const messages = buildRoommateAiSafetyContext(source);
          const sourceIds = [...source.previous.slice(-(messages.length - 1)), source.target].map(
            (message) => message.id
          );
          const result = await provider.generate({
            task: "ROOMMATE_AI_MESSAGE_SAFETY",
            instructions: roommateAiSafetyPrompt.instructions,
            input: Object.freeze({
              analysisVersion: roommateAiApplicationVersions.safetyAnalysisVersion,
              promptVersion: roommateAiSafetyPrompt.version,
              schemaVersion: roommateAiSafetyPrompt.schemaVersion,
              messages
            }),
            responseJsonSchema: roommateAiSafetyJsonSchema,
            model: configuration.models.safety,
            maxOutputTokens: roommateAiSafetyWorkerPolicy.maxOutputTokens,
            timeoutMs: configuration.timeoutsMs.safety,
            versions: Object.freeze({
              promptVersion: roommateAiSafetyPrompt.version,
              schemaVersion: roommateAiSafetyPrompt.schemaVersion
            }),
            validateOutput: (value) => validateRoommateAiSafetyOutput(value, messages)
          });
          const signalCodes = result.output.signals.map((signal) => signal.code);
          const evidenceMessageIds = [
            ...new Set(
              result.output.signals.flatMap((signal) =>
                signal.evidenceMessageTokens.map((token) => sourceIds[Number(token.slice(1))]!)
              )
            )
          ];
          const saved = await transactionRunner.run((executor) =>
            repository.complete(executor, {
              id: claim.id,
              outcome: deriveRoommateAiSafetyOutcome(signalCodes),
              signalCodes: signalCodes as readonly RoommateAiSafetySignalCode[],
              evidenceMessageIds,
              now: now()
            })
          );
          if (saved) completed += 1;
        } catch (error) {
          const failure = sanitizedFailure(error);
          const retryAt =
            failure.retryable && claim.attemptCount < roommateAiSafetyWorkerPolicy.maximumAttempts
              ? new Date(now().getTime() + roommateAiSafetyWorkerPolicy.retryDelaysMs[claim.attemptCount - 1]!)
              : null;
          try {
            const saved = await transactionRunner.run((executor) =>
              repository.fail(executor, { id: claim.id, errorCode: failure.code, retryAt, now: now() })
            );
            if (saved && retryAt === null) failed += 1;
          } catch (failurePersistenceError) {
            logger.error("Roommate AI safety failure persistence failed", {
              errorType: failurePersistenceError instanceof Error ? failurePersistenceError.name : "UnknownError"
            });
          }
        }
      }
      await transactionRunner.run((executor) =>
        repository.cleanup(
          executor,
          new Date(now().getTime() - roommateAiSafetyWorkerPolicy.retentionMs),
          roommateAiSafetyWorkerPolicy.cleanupBatchSize
        )
      );
      const result = Object.freeze({ discovered, claimed: claims.length, completed, failed });
      if (claims.length > 0) logger.info("Roommate AI safety worker completed", result);
      return result;
    })()
      .catch((error: unknown) => {
        logger.error("Roommate AI safety worker failed", {
          errorType: error instanceof Error ? error.name : "UnknownError"
        });
        return Object.freeze({ discovered: 0, claimed: 0, completed: 0, failed: 0 });
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
  return Object.freeze({
    runOnce,
    start() {
      if (timer || !isRoommateAiFeatureEnabled(configuration, "SAFETY") || !provider) return;
      void runOnce();
      timer = setInterval(() => void runOnce(), intervalMs);
      timer.unref();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    }
  });
}
