import type { QueryResultRow } from "pg";
import type { SqlExecutor } from "../../../../../shared/src/runtime/db/sql-executor.js";
import type {
  RoommateAiSafetyOutcome,
  RoommateAiSafetySignalCode,
  RoommateAiSafetySourceMessage
} from "../safety-analysis.js";
import { roommateAiSafetySignalCodes } from "../safety-analysis.js";

export type RoommateAiSafetyAnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface RoommateAiSafetyAnalysisClaim {
  readonly id: number;
  readonly messageId: number;
  readonly attemptCount: number;
}

export interface RoommateAiSafetyCompletedProjection {
  readonly messageId: number;
  readonly outcome: Exclude<RoommateAiSafetyOutcome, "NO_WARNING">;
  readonly signalCodes: readonly RoommateAiSafetySignalCode[];
  readonly analysisVersion: string;
  readonly promptVersion: string;
  readonly modelIdentifier: string;
  readonly analyzedAt: string;
}

interface ClaimRow extends QueryResultRow {
  id: unknown;
  message_id: unknown;
  attempt_count: unknown;
}
interface MessageRow extends QueryResultRow {
  id: unknown;
  interest_id: unknown;
  sender_tenant_id: unknown;
  body: unknown;
  created_at: unknown;
}
interface CompletedProjectionRow extends QueryResultRow {
  message_id: unknown;
  outcome: unknown;
  signal_codes: unknown;
  analysis_version: unknown;
  prompt_version: unknown;
  model_identifier: unknown;
  analyzed_at: unknown;
}

function positiveId(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) throw new Error(`${field} is invalid.`);
  return parsed;
}
function positiveAttempt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2) throw new Error("attempt_count is invalid.");
  return parsed;
}
function sourceMessage(row: MessageRow): RoommateAiSafetySourceMessage {
  if (typeof row.body !== "string") throw new Error("roommate message body is invalid.");
  const date = row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at));
  if (Number.isNaN(date.getTime())) throw new Error("roommate message created_at is invalid.");
  return Object.freeze({
    id: positiveId(row.id, "message id"),
    senderTenantId: positiveId(row.sender_tenant_id, "sender tenant id"),
    body: row.body,
    createdAt: date.toISOString()
  });
}

function completedProjection(row: CompletedProjectionRow): RoommateAiSafetyCompletedProjection {
  if (row.outcome !== "CAUTION" && row.outcome !== "HIGH_CAUTION") {
    throw new Error("safety analysis outcome is invalid.");
  }
  if (!Array.isArray(row.signal_codes) || row.signal_codes.length < 1 || row.signal_codes.length > 7) {
    throw new Error("safety analysis signal codes are invalid.");
  }
  const signalCodes = row.signal_codes.map((value) => {
    if (!roommateAiSafetySignalCodes.includes(value as RoommateAiSafetySignalCode)) {
      throw new Error("safety analysis signal code is invalid.");
    }
    return value as RoommateAiSafetySignalCode;
  });
  if (new Set(signalCodes).size !== signalCodes.length) throw new Error("safety analysis signal codes are duplicated.");
  if (
    typeof row.analysis_version !== "string" ||
    typeof row.prompt_version !== "string" ||
    typeof row.model_identifier !== "string"
  ) {
    throw new Error("safety analysis version data is invalid.");
  }
  const analyzedAt = row.analyzed_at instanceof Date ? row.analyzed_at : new Date(String(row.analyzed_at));
  if (Number.isNaN(analyzedAt.getTime())) throw new Error("safety analysis timestamp is invalid.");
  return Object.freeze({
    messageId: positiveId(row.message_id, "message id"),
    outcome: row.outcome,
    signalCodes: Object.freeze(signalCodes),
    analysisVersion: row.analysis_version,
    promptVersion: row.prompt_version,
    modelIdentifier: row.model_identifier,
    analyzedAt: analyzedAt.toISOString()
  });
}

export interface RoommateAiSafetyRepository {
  readonly discover: (executor: SqlExecutor, input: DiscoverInput) => Promise<number>;
  readonly terminalizeStale: (executor: SqlExecutor, now: Date, errorCode: string) => Promise<number>;
  readonly claim: (executor: SqlExecutor, input: ClaimInput) => Promise<readonly RoommateAiSafetyAnalysisClaim[]>;
  readonly loadContext: (
    executor: SqlExecutor,
    messageId: number,
    previousLimit: number
  ) => Promise<{
    readonly target: RoommateAiSafetySourceMessage;
    readonly previous: readonly RoommateAiSafetySourceMessage[];
  } | null>;
  readonly complete: (executor: SqlExecutor, input: CompleteInput) => Promise<boolean>;
  readonly fail: (executor: SqlExecutor, input: FailInput) => Promise<boolean>;
  readonly cleanup: (executor: SqlExecutor, cutoff: Date, batchSize: number) => Promise<number>;
  readonly listCompletedProjections: (
    executor: SqlExecutor,
    messageIds: readonly number[],
    analysisVersion: string,
    requestId?: number
  ) => Promise<ReadonlyMap<number, RoommateAiSafetyCompletedProjection>>;
}

export interface DiscoverInput {
  readonly analysisVersion: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly provider: string;
  readonly modelIdentifier: string;
  readonly now: Date;
  readonly batchSize: number;
}
export interface ClaimInput {
  readonly analysisVersion: string;
  readonly now: Date;
  readonly leaseExpiresAt: Date;
  readonly batchSize: number;
}
export interface CompleteInput {
  readonly id: number;
  readonly outcome: RoommateAiSafetyOutcome;
  readonly signalCodes: readonly RoommateAiSafetySignalCode[];
  readonly evidenceMessageIds: readonly number[];
  readonly now: Date;
}
export interface FailInput {
  readonly id: number;
  readonly errorCode: string;
  readonly retryAt: Date | null;
  readonly now: Date;
}

export function createRoommateAiSafetyRepository(): RoommateAiSafetyRepository {
  const repository: RoommateAiSafetyRepository = {
    async discover(executor: SqlExecutor, input: DiscoverInput) {
      const result = await executor.query({
        text: `
          INSERT INTO roommate_message_ai_safety_analyses (
            message_id, analysis_version, prompt_version, schema_version, provider, model_identifier, next_attempt_at
          )
          SELECT message.id, $1, $2, $3, $4, $5, $6
          FROM roommate_messages message
          LEFT JOIN roommate_message_ai_safety_analyses analysis
            ON analysis.message_id = message.id AND analysis.analysis_version = $1
          WHERE message.moderation_state = 'VISIBLE' AND analysis.id IS NULL
          ORDER BY message.created_at ASC, message.id ASC
          LIMIT $7
          ON CONFLICT (message_id, analysis_version) DO NOTHING`,
        values: [
          input.analysisVersion,
          input.promptVersion,
          input.schemaVersion,
          input.provider,
          input.modelIdentifier,
          input.now,
          input.batchSize
        ]
      });
      return result.rowCount ?? 0;
    },
    async terminalizeStale(executor: SqlExecutor, now: Date, errorCode: string) {
      const result = await executor.query({
        text: `
          UPDATE roommate_message_ai_safety_analyses
          SET status = 'FAILED', lease_expires_at = NULL, last_error_code = $2, updated_at = $1
          WHERE status IN ('PENDING', 'PROCESSING') AND created_at <= $1::timestamptz - INTERVAL '24 hours'`,
        values: [now, errorCode]
      });
      return result.rowCount ?? 0;
    },
    async claim(executor: SqlExecutor, input: ClaimInput) {
      const result = await executor.query<ClaimRow>({
        text: `
          WITH candidates AS (
            SELECT analysis.id
            FROM roommate_message_ai_safety_analyses analysis
            JOIN roommate_messages message ON message.id = analysis.message_id
            WHERE analysis.analysis_version = $1
              AND message.moderation_state = 'VISIBLE'
              AND analysis.attempt_count < 2
              AND (
                (analysis.status = 'PENDING' AND analysis.next_attempt_at <= $2)
                OR (analysis.status = 'PROCESSING' AND analysis.lease_expires_at <= $2)
              )
            ORDER BY message.created_at ASC, message.id ASC
            FOR UPDATE OF analysis SKIP LOCKED
            LIMIT $4
          )
          UPDATE roommate_message_ai_safety_analyses analysis
          SET status = 'PROCESSING', attempt_count = analysis.attempt_count + 1,
              lease_expires_at = $3, updated_at = $2
          FROM candidates
          WHERE analysis.id = candidates.id
          RETURNING analysis.id, analysis.message_id, analysis.attempt_count`,
        values: [input.analysisVersion, input.now, input.leaseExpiresAt, input.batchSize]
      });
      return Object.freeze(
        result.rows.map((row: ClaimRow) =>
          Object.freeze({
            id: positiveId(row.id, "analysis id"),
            messageId: positiveId(row.message_id, "message id"),
            attemptCount: positiveAttempt(row.attempt_count)
          })
        )
      );
    },
    async loadContext(executor: SqlExecutor, messageId: number, previousLimit: number) {
      const targetResult = await executor.query<MessageRow>({
        text: `SELECT id, interest_id, sender_tenant_id, body, created_at
               FROM roommate_messages WHERE id = $1 AND moderation_state = 'VISIBLE'`,
        values: [messageId]
      });
      const targetRow = targetResult.rows[0];
      if (!targetRow) return null;
      const target = sourceMessage(targetRow);
      const previousResult = await executor.query<MessageRow>({
        text: `
          SELECT id, interest_id, sender_tenant_id, body, created_at
          FROM (
            SELECT id, interest_id, sender_tenant_id, body, created_at
            FROM roommate_messages
            WHERE interest_id = $1 AND moderation_state = 'VISIBLE'
              AND (created_at < $2 OR (created_at = $2 AND id < $3))
            ORDER BY created_at DESC, id DESC
            LIMIT $4
          ) context
          ORDER BY created_at ASC, id ASC`,
        values: [targetRow.interest_id, targetRow.created_at, messageId, previousLimit]
      });
      return Object.freeze({ target, previous: Object.freeze(previousResult.rows.map(sourceMessage)) });
    },
    async complete(executor: SqlExecutor, input: CompleteInput) {
      const result = await executor.query({
        text: `
          UPDATE roommate_message_ai_safety_analyses
          SET status = 'COMPLETED', outcome = $2, signal_codes = $3::text[], evidence_message_ids = $4::integer[],
              analyzed_at = $5, lease_expires_at = NULL, last_error_code = NULL, updated_at = $5
          WHERE id = $1 AND status = 'PROCESSING'`,
        values: [input.id, input.outcome, input.signalCodes, input.evidenceMessageIds, input.now]
      });
      return (result.rowCount ?? 0) === 1;
    },
    async fail(executor: SqlExecutor, input: FailInput) {
      const retry = input.retryAt !== null;
      const result = await executor.query({
        text: `
          UPDATE roommate_message_ai_safety_analyses
          SET status = CASE WHEN $3::boolean THEN 'PENDING' ELSE 'FAILED' END,
              next_attempt_at = COALESCE($4, next_attempt_at), lease_expires_at = NULL,
              last_error_code = $2, updated_at = $5
          WHERE id = $1 AND status = 'PROCESSING'`,
        values: [input.id, input.errorCode, retry, input.retryAt, input.now]
      });
      return (result.rowCount ?? 0) === 1;
    },
    async cleanup(executor: SqlExecutor, cutoff: Date, batchSize: number) {
      const result = await executor.query({
        text: `
          WITH expired AS (
            SELECT id FROM roommate_message_ai_safety_analyses
            WHERE status IN ('COMPLETED', 'FAILED')
              AND COALESCE(analyzed_at, updated_at) <= $1
            ORDER BY COALESCE(analyzed_at, updated_at) ASC, id ASC
            LIMIT $2
          )
          DELETE FROM roommate_message_ai_safety_analyses analysis
          USING expired WHERE analysis.id = expired.id`,
        values: [cutoff, batchSize]
      });
      return result.rowCount ?? 0;
    },
    async listCompletedProjections(executor, messageIds, analysisVersion, requestId) {
      if (messageIds.length === 0) return new Map();
      const requestFilter = requestId === undefined ? "" : "AND interest.request_id = $3";
      const result = await executor.query<CompletedProjectionRow>({
        text: `
          SELECT analysis.message_id, analysis.outcome, analysis.signal_codes, analysis.analysis_version,
                 analysis.prompt_version, analysis.model_identifier, analysis.analyzed_at
          FROM roommate_message_ai_safety_analyses AS analysis
          JOIN roommate_messages AS message ON message.id = analysis.message_id
          JOIN roommate_interests AS interest ON interest.id = message.interest_id
          WHERE analysis.message_id = ANY($1::integer[])
            AND analysis.analysis_version = $2
            AND analysis.status = 'COMPLETED'
            AND analysis.outcome IN ('CAUTION', 'HIGH_CAUTION')
            ${requestFilter}`,
        values: requestId === undefined ? [messageIds, analysisVersion] : [messageIds, analysisVersion, requestId]
      });
      const projections = new Map<number, RoommateAiSafetyCompletedProjection>();
      for (const row of result.rows) {
        const projection = completedProjection(row);
        projections.set(projection.messageId, projection);
      }
      return projections;
    }
  };
  return Object.freeze(repository);
}
