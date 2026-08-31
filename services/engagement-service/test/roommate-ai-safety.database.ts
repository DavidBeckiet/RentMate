import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresPool } from "../../shared/src/runtime/db/pool.js";
import {
  createMigrationRunner,
  type MigrationClient,
  type MigrationPool
} from "../../shared/src/runtime/migrations/migration-runner.js";
import { withTransaction } from "../../shared/src/runtime/db/transaction.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { createRoommateAiSafetyRepository } from "../src/modules/roommate-ai/repositories/roommate-ai-safety-repository.js";
import { createRoommateAiSafetyWorker } from "../src/modules/roommate-ai/services/roommate-ai-safety-worker.js";
import { FakeAiProvider } from "../src/modules/roommate-ai/providers/fake-ai-provider.js";
import { parseRoommateAiConfiguration } from "../src/modules/roommate-ai/config/roommate-ai-config.js";
import { roommateAiApplicationVersions } from "../src/modules/roommate-ai/prompts/versions.js";
import { roommateAiSafetyPrompt } from "../src/modules/roommate-ai/prompts/safety-prompt.js";
import { createRoommateRepository } from "../src/modules/roommate/repositories/roommate-repository.js";
import { createRoommateSafetyRepository } from "../src/modules/roommate/repositories/roommate-safety-repository.js";
import { createRoommateSafetyService } from "../src/modules/roommate/services/roommate-safety-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for disposable Engagement database tests.");

const parsed = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsed.pathname.slice(1));
const username = decodeURIComponent(parsed.username);
if (
  parsed.hostname !== "localhost" ||
  Number(parsed.port || 5432) !== 5432 ||
  databaseName !== "rentmate_test_identity_v2" ||
  username !== "rentmate"
) {
  throw new Error("V3-05 database tests require the verified disposable Identity test database.");
}

const pool = createPostgresPool(
  {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    database: databaseName,
    user: username,
    password: decodeURIComponent(parsed.password),
    max: 16,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  },
  { debug() {}, info() {}, warn() {}, error() {} }
);

const schemaName = `roommate_ai_safety_${process.pid}`;
if (!/^roommate_ai_safety_[0-9]+$/u.test(schemaName)) throw new Error("Invalid test schema name.");
const quotedSchema = `"${schemaName}"`;
const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrationRunner = createMigrationRunner("Engagement");
const repository = createRoommateAiSafetyRepository();
const analysisVersion = roommateAiApplicationVersions.safetyAnalysisVersion;
const promptVersion = roommateAiSafetyPrompt.version;
const schemaVersion = roommateAiSafetyPrompt.schemaVersion;
const logger = { debug() {}, info() {}, warn() {}, error() {} };

function migrationPool(): MigrationPool {
  return {
    async connect(): Promise<MigrationClient> {
      const client = await pool.connect();
      await client.query(`SET search_path TO ${quotedSchema}`);
      return client;
    }
  };
}

function transaction<Value>(operation: (executor: SqlExecutor) => Promise<Value>): Promise<Value> {
  return withTransaction(
    {
      connect: async () => {
        const client = await pool.connect();
        await client.query(`SET search_path TO ${quotedSchema}`);
        return client;
      }
    },
    { error() {} },
    operation
  );
}

async function rows<Row extends Record<string, unknown>>(
  text: string,
  values: readonly unknown[] = []
): Promise<readonly Row[]> {
  return transaction(async (executor) => (await executor.query<Row>({ text, values })).rows);
}

async function one<Row extends Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<Row> {
  const result = await rows<Row>(text, values);
  assert.equal(result.length, 1);
  return result[0]!;
}

async function resetAnalyses(): Promise<void> {
  await transaction((executor) =>
    executor.query({ text: "DELETE FROM roommate_message_ai_safety_analyses", values: [] })
  );
}

interface Conversation {
  readonly requestId: number;
  readonly interestId: number;
  readonly messageId: number;
}

async function createConversation(
  ownerTenantId: number,
  interestedTenantId: number,
  createdAt: string
): Promise<Conversation> {
  return transaction(async (executor) => {
    const request = await executor.query<{ id: number }>({
      text: `
        INSERT INTO roommate_requests (
          owner_tenant_id, preferred_area_keys, budget_min_per_person, budget_max_per_person,
          move_in_from, move_in_until, expires_at, created_at, updated_at
        ) VALUES ($1, ARRAY['Quan 1']::text[], 100, 200, DATE '2026-01-01', DATE '2026-01-30', $2, $3, $3)
        RETURNING id`,
      values: [ownerTenantId, new Date(`${createdAt.slice(0, 10)}T23:59:59.000Z`), new Date(createdAt)]
    });
    const interest = await executor.query<{ id: number }>({
      text: "INSERT INTO roommate_interests (request_id, interested_tenant_id, created_at, updated_at) VALUES ($1, $2, $3, $3) RETURNING id",
      values: [request.rows[0]!.id, interestedTenantId, new Date(createdAt)]
    });
    const message = await executor.query<{ id: number }>({
      text: "INSERT INTO roommate_messages (interest_id, sender_tenant_id, body, created_at) VALUES ($1, $2, $3, $4) RETURNING id",
      values: [interest.rows[0]!.id, interestedTenantId, "Synthetic roommate message.", new Date(createdAt)]
    });
    return { requestId: request.rows[0]!.id, interestId: interest.rows[0]!.id, messageId: message.rows[0]!.id };
  });
}

async function createMessage(
  interestId: number,
  senderTenantId: number,
  body: string,
  createdAt: string,
  moderationState = "VISIBLE"
): Promise<number> {
  return transaction(async (executor) => {
    const result = await executor.query<{ id: number }>({
      text: "INSERT INTO roommate_messages (interest_id, sender_tenant_id, body, moderation_state, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      values: [interestId, senderTenantId, body, moderationState, new Date(createdAt)]
    });
    return result.rows[0]!.id;
  });
}

async function createAnalysis(
  messageId: number,
  input: {
    readonly analysisVersion?: string;
    readonly status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    readonly attemptCount?: number;
    readonly nextAttemptAt?: string;
    readonly leaseExpiresAt?: string | null;
    readonly outcome?: "NO_WARNING" | "CAUTION" | "HIGH_CAUTION" | null;
    readonly signalCodes?: readonly string[];
    readonly evidenceMessageIds?: readonly number[];
    readonly lastErrorCode?: string | null;
    readonly analyzedAt?: string | null;
    readonly createdAt?: string;
    readonly updatedAt?: string;
  } = {}
): Promise<number> {
  const createdAt = input.createdAt ?? "2026-01-01T00:00:00.000Z";
  const updatedAt = input.updatedAt ?? createdAt;
  return transaction(async (executor) => {
    const result = await executor.query<{ id: number }>({
      text: `
        INSERT INTO roommate_message_ai_safety_analyses (
          message_id, analysis_version, prompt_version, schema_version, provider, model_identifier,
          status, attempt_count, next_attempt_at, lease_expires_at, outcome, signal_codes,
          evidence_message_ids, last_error_code, analyzed_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'GEMINI', 'gemini-safety', $5, $6, $7, $8, $9, $10::text[], $11::integer[], $12, $13, $14, $15)
        RETURNING id`,
      values: [
        messageId,
        input.analysisVersion ?? analysisVersion,
        promptVersion,
        schemaVersion,
        input.status ?? "PENDING",
        input.attemptCount ?? 0,
        new Date(input.nextAttemptAt ?? createdAt),
        input.leaseExpiresAt === undefined || input.leaseExpiresAt === null ? null : new Date(input.leaseExpiresAt),
        input.outcome ?? null,
        [...(input.signalCodes ?? [])],
        [...(input.evidenceMessageIds ?? [])],
        input.lastErrorCode ?? null,
        input.analyzedAt === undefined || input.analyzedAt === null ? null : new Date(input.analyzedAt),
        new Date(createdAt),
        new Date(updatedAt)
      ]
    });
    return result.rows[0]!.id;
  });
}

before(async () => {
  const identity = await pool.query<{ database: string; username: string }>(
    "SELECT current_database() AS database, current_user AS username"
  );
  assert.equal(identity.rows[0]?.database, "rentmate_test_identity_v2");
  assert.equal(identity.rows[0]?.username, "rentmate");
  await pool.query(`CREATE SCHEMA ${quotedSchema}`);
  const migrations = await migrationRunner.discover(migrationsDirectory);
  await migrationRunner.executePlan(migrationPool(), migrationRunner.createPlan("clean", migrations));
});

after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await pool.end();
});

test("V3-05 migration has exactly bounded metadata, constraints, defaults, and cascade", async () => {
  const columns = await rows<{ column_name: string; is_nullable: string; column_default: string | null }>(
    `SELECT column_name, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'roommate_message_ai_safety_analyses' ORDER BY ordinal_position`
  );
  assert.deepEqual(
    columns.map((column) => column.column_name),
    [
      "id",
      "message_id",
      "analysis_version",
      "prompt_version",
      "schema_version",
      "provider",
      "model_identifier",
      "status",
      "attempt_count",
      "next_attempt_at",
      "lease_expires_at",
      "outcome",
      "signal_codes",
      "evidence_message_ids",
      "last_error_code",
      "analyzed_at",
      "created_at",
      "updated_at"
    ]
  );
  assert.equal(
    columns.find((column) => column.column_name === "created_at")?.column_default?.includes("CURRENT_TIMESTAMP"),
    true
  );
  assert.equal(
    columns.find((column) => column.column_name === "updated_at")?.column_default?.includes("CURRENT_TIMESTAMP"),
    true
  );
  assert.equal(
    columns.some((column) =>
      ["raw_message", "redacted_message", "prompt_body", "provider_response", "tenant_id", "reason_prose"].includes(
        column.column_name
      )
    ),
    false
  );
  const constraints = await rows<{ constraint_name: string; definition: string }>(
    `SELECT con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS definition
     FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'roommate_message_ai_safety_analyses' AND rel.relnamespace = current_schema()::regnamespace`
  );
  assert.equal(
    constraints.some((constraint) => /UNIQUE \(message_id, analysis_version\)/iu.test(constraint.definition)),
    true
  );
  assert.equal(
    constraints.some((constraint) =>
      /FOREIGN KEY \(message_id\).*roommate_messages.*ON DELETE CASCADE/iu.test(constraint.definition)
    ),
    true
  );
  assert.equal(
    constraints.some(
      (constraint) => constraint.constraint_name === "ck_roommate_message_ai_safety_analyses_attempt_count"
    ),
    true
  );
  assert.equal(
    constraints.some((constraint) => /OTP_REQUEST/iu.test(constraint.definition)),
    true
  );
  const indexes = await rows<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'roommate_message_ai_safety_analyses'"
  );
  assert.deepEqual(
    new Set(indexes.map((index) => index.indexname)),
    new Set([
      "roommate_message_ai_safety_analyses_pkey",
      "uq_roommate_message_ai_safety_analyses_version",
      "idx_roommate_message_ai_safety_analyses_claim",
      "idx_roommate_message_ai_safety_analyses_retention"
    ])
  );
  const messageScanIndex = await one<{ count: string }>(
    "SELECT count(*)::text AS count FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'roommate_messages' AND indexname = 'idx_roommate_messages_ai_safety_scan'"
  );
  assert.equal(Number(messageScanIndex.count), 1);
});

test("discover is bounded at 100 and concurrent discovery is version-deduplicated", async () => {
  await resetAnalyses();
  const conversation = await createConversation(3001, 3002, "2026-01-02T00:00:00.000Z");
  await transaction((executor) =>
    executor.query({
      text: `INSERT INTO roommate_messages (interest_id, sender_tenant_id, body, created_at)
           SELECT $1, $2, 'bulk-' || series::text, $3::timestamptz + series * INTERVAL '1 second'
           FROM generate_series(1, 104) AS series`,
      values: [conversation.interestId, 3001, "2026-01-02T00:00:01.000Z"]
    })
  );
  const discovered = await transaction((executor) =>
    repository.discover(executor, {
      analysisVersion,
      promptVersion,
      schemaVersion,
      provider: "GEMINI",
      modelIdentifier: "gemini-safety",
      now: new Date("2027-01-03T00:00:00.000Z"),
      batchSize: 100
    })
  );
  assert.equal(discovered, 100);
  const second = await transaction((executor) =>
    repository.discover(executor, {
      analysisVersion,
      promptVersion,
      schemaVersion,
      provider: "GEMINI",
      modelIdentifier: "gemini-safety",
      now: new Date("2027-01-03T00:00:00.000Z"),
      batchSize: 100
    })
  );
  assert.equal(second, 5);
  const count = await one<{ count: string }>(
    "SELECT count(*)::text AS count FROM roommate_message_ai_safety_analyses WHERE analysis_version = $1",
    [analysisVersion]
  );
  assert.equal(Number(count.count), 105);

  const raceConversation = await createConversation(3003, 3004, "2026-01-04T00:00:00.000Z");
  const race = await Promise.all(
    [1, 2].map(() =>
      transaction((executor) =>
        repository.discover(executor, {
          analysisVersion: "ROOMMATE_AI_SAFETY_RACE",
          promptVersion,
          schemaVersion,
          provider: "GEMINI",
          modelIdentifier: "gemini-safety",
          now: new Date("2026-01-04T00:00:00.000Z"),
          batchSize: 100
        })
      )
    )
  );
  assert.equal(
    race.reduce((sum, value) => sum + value, 0),
    106
  );
  const raceCount = await one<{ count: string }>(
    "SELECT count(*)::text AS count FROM roommate_message_ai_safety_analyses WHERE message_id = $1",
    [raceConversation.messageId]
  );
  assert.equal(Number(raceCount.count), 1);
});

test("claim leases are concurrency-safe, ordered by created_at/id, and bounded", async () => {
  await resetAnalyses();
  const conversation = await createConversation(3011, 3012, "2026-01-05T00:00:00.000Z");
  const tiedFirst = await createMessage(conversation.interestId, 3011, "tied first", "2026-01-05T00:00:01.000Z");
  const tiedSecond = await createMessage(conversation.interestId, 3011, "tied second", "2026-01-05T00:00:01.000Z");
  await createAnalysis(tiedFirst, {
    analysisVersion: "ROOMMATE_AI_SAFETY_ORDERED",
    createdAt: "2026-01-05T00:00:01.000Z",
    updatedAt: "2026-01-05T00:00:01.000Z"
  });
  await createAnalysis(tiedSecond, {
    analysisVersion: "ROOMMATE_AI_SAFETY_ORDERED",
    createdAt: "2026-01-05T00:00:01.000Z",
    updatedAt: "2026-01-05T00:00:01.000Z"
  });
  const ordered = await transaction((executor) =>
    repository.claim(executor, {
      analysisVersion: "ROOMMATE_AI_SAFETY_ORDERED",
      now: new Date("2027-01-06T00:00:00.000Z"),
      leaseExpiresAt: new Date("2027-01-06T00:02:00.000Z"),
      batchSize: 100
    })
  );
  assert.deepEqual(
    ordered.slice(0, 2).map((claim) => claim.messageId),
    [tiedFirst, tiedSecond]
  );

  const raceConversation = await createConversation(3019, 3020, "2026-01-06T00:00:00.000Z");
  await createAnalysis(raceConversation.messageId, {
    analysisVersion: "ROOMMATE_AI_SAFETY_RACE_CLAIM",
    createdAt: "2026-01-06T00:00:00.000Z",
    updatedAt: "2026-01-06T00:00:00.000Z"
  });
  const claims = await Promise.all(
    [1, 2].map(() =>
      transaction((executor) =>
        repository.claim(executor, {
          analysisVersion: "ROOMMATE_AI_SAFETY_RACE_CLAIM",
          now: new Date("2027-01-06T00:01:00.000Z"),
          leaseExpiresAt: new Date("2027-01-06T00:03:00.000Z"),
          batchSize: 1
        })
      )
    )
  );
  assert.equal(claims.filter((claim) => claim.length > 0).length, 1);
  assert.equal(claims.flat()[0]?.messageId, raceConversation.messageId);

  const active = await createConversation(3013, 3014, "2026-01-07T00:00:00.000Z");
  await createAnalysis(active.messageId, {
    analysisVersion: "ROOMMATE_AI_SAFETY_ACTIVE",
    status: "PROCESSING",
    attemptCount: 1,
    leaseExpiresAt: "2026-01-07T00:02:00.000Z",
    createdAt: "2026-01-07T00:00:00.000Z",
    updatedAt: "2026-01-07T00:00:01.000Z"
  });
  const activeClaim = await transaction((executor) =>
    repository.claim(executor, {
      analysisVersion: "ROOMMATE_AI_SAFETY_ACTIVE",
      now: new Date("2026-01-07T00:01:00.000Z"),
      leaseExpiresAt: new Date("2026-01-07T00:03:00.000Z"),
      batchSize: 100
    })
  );
  assert.equal(activeClaim.length, 0);

  const expired = await createConversation(3015, 3016, "2026-01-08T00:00:00.000Z");
  await createAnalysis(expired.messageId, {
    analysisVersion: "ROOMMATE_AI_SAFETY_EXPIRED",
    status: "PROCESSING",
    attemptCount: 1,
    leaseExpiresAt: "2026-01-08T00:00:30.000Z",
    createdAt: "2026-01-08T00:00:00.000Z",
    updatedAt: "2026-01-08T00:00:01.000Z"
  });
  const reclaimed = await transaction((executor) =>
    repository.claim(executor, {
      analysisVersion: "ROOMMATE_AI_SAFETY_EXPIRED",
      now: new Date("2027-01-08T00:01:00.000Z"),
      leaseExpiresAt: new Date("2027-01-08T00:03:00.000Z"),
      batchSize: 100
    })
  );
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0]!.messageId, expired.messageId);
  assert.equal(reclaimed[0]!.attemptCount, 2);

  const completed = await createConversation(3017, 3018, "2026-01-09T00:00:00.000Z");
  await createAnalysis(completed.messageId, {
    analysisVersion: "ROOMMATE_AI_SAFETY_COMPLETED",
    status: "COMPLETED",
    attemptCount: 1,
    outcome: "NO_WARNING",
    analyzedAt: "2026-01-09T00:00:01.000Z",
    createdAt: "2026-01-09T00:00:00.000Z",
    updatedAt: "2026-01-09T00:00:01.000Z"
  });
  const completedClaim = await transaction((executor) =>
    repository.claim(executor, {
      analysisVersion: "ROOMMATE_AI_SAFETY_COMPLETED",
      now: new Date("2027-01-09T00:01:00.000Z"),
      leaseExpiresAt: new Date("2027-01-09T00:03:00.000Z"),
      batchSize: 100
    })
  );
  assert.equal(completedClaim.length, 0);

  const retryConversation = await createConversation(3035, 3036, "2026-01-09T00:00:00.000Z");
  await createAnalysis(retryConversation.messageId, {
    analysisVersion: "ROOMMATE_AI_SAFETY_RETRY",
    status: "PROCESSING",
    attemptCount: 1,
    leaseExpiresAt: "2026-01-09T00:00:30.000Z",
    createdAt: "2026-01-09T00:00:00.000Z",
    updatedAt: "2026-01-09T00:00:01.000Z"
  });
  const retryClaim = await transaction((executor) =>
    repository.claim(executor, {
      analysisVersion: "ROOMMATE_AI_SAFETY_RETRY",
      now: new Date("2027-01-09T00:01:00.000Z"),
      leaseExpiresAt: new Date("2027-01-09T00:03:00.000Z"),
      batchSize: 1
    })
  );
  assert.equal(retryClaim.length, 1);
  const retryAt = new Date("2027-01-09T00:01:20.000Z");
  const movedToRetry = await transaction((executor) =>
    repository.fail(executor, {
      id: retryClaim[0]!.id,
      errorCode: "RATE_LIMITED",
      retryAt,
      now: new Date("2027-01-09T00:01:00.000Z")
    })
  );
  assert.equal(movedToRetry, true);
  const pendingRetry = await one<{
    status: string;
    attempt_count: number;
    next_attempt_at: Date;
    lease_expires_at: Date | null;
    last_error_code: string;
  }>(
    "SELECT status, attempt_count, next_attempt_at, lease_expires_at, last_error_code FROM roommate_message_ai_safety_analyses WHERE message_id = $1",
    [retryConversation.messageId]
  );
  assert.equal(pendingRetry.status, "PENDING");
  assert.equal(pendingRetry.attempt_count, 2);
  assert.equal(pendingRetry.next_attempt_at.toISOString(), retryAt.toISOString());
  assert.equal(pendingRetry.lease_expires_at, null);
  assert.equal(pendingRetry.last_error_code, "RATE_LIMITED");
  const noThirdClaim = await transaction((executor) =>
    repository.claim(executor, {
      analysisVersion: "ROOMMATE_AI_SAFETY_RETRY",
      now: new Date("2027-01-09T00:02:00.000Z"),
      leaseExpiresAt: new Date("2027-01-09T00:04:00.000Z"),
      batchSize: 1
    })
  );
  assert.equal(noThirdClaim.length, 0);
});

test("stale work terminalizes at 24 hours and cleanup is bounded at 180 days", async () => {
  await resetAnalyses();
  const stalePending = await createConversation(3021, 3022, "2026-01-10T00:00:00.000Z");
  const staleProcessing = await createConversation(3023, 3024, "2026-01-10T00:00:00.000Z");
  const recentPending = await createConversation(3025, 3026, "2026-02-10T00:00:00.000Z");
  const recentProcessing = await createConversation(3027, 3028, "2026-02-10T00:00:00.000Z");
  await createAnalysis(stalePending.messageId, {
    status: "PENDING",
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z"
  });
  await createAnalysis(staleProcessing.messageId, {
    status: "PROCESSING",
    attemptCount: 1,
    leaseExpiresAt: "2026-01-10T00:01:00.000Z",
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:01.000Z"
  });
  await createAnalysis(recentPending.messageId, {
    status: "PENDING",
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:00.000Z"
  });
  await createAnalysis(recentProcessing.messageId, {
    status: "PROCESSING",
    attemptCount: 1,
    leaseExpiresAt: "2026-02-10T00:03:00.000Z",
    createdAt: "2026-02-10T00:00:00.000Z",
    updatedAt: "2026-02-10T00:00:01.000Z"
  });
  const terminalized = await transaction((executor) =>
    repository.terminalizeStale(executor, new Date("2026-01-11T00:00:01.000Z"), "STALE_WORK")
  );
  assert.equal(terminalized, 2);
  const states = await rows<{ message_id: number; status: string; last_error_code: string | null }>(
    "SELECT message_id, status, last_error_code FROM roommate_message_ai_safety_analyses WHERE message_id = ANY($1::integer[]) ORDER BY message_id",
    [[stalePending.messageId, staleProcessing.messageId, recentPending.messageId, recentProcessing.messageId]]
  );
  assert.deepEqual(
    states.map((state) => state.status),
    ["FAILED", "FAILED", "PENDING", "PROCESSING"]
  );
  assert.equal(states[0]!.last_error_code, "STALE_WORK");
  assert.equal(states[1]!.last_error_code, "STALE_WORK");

  const retention = await createConversation(3029, 3030, "2026-03-01T00:00:00.000Z");
  const keep = await createConversation(3031, 3032, "2026-03-01T00:00:00.000Z");
  const remove = await createConversation(3033, 3034, "2026-03-01T00:00:00.000Z");
  await createAnalysis(retention.messageId, {
    status: "FAILED",
    attemptCount: 2,
    lastErrorCode: "TIMEOUT",
    createdAt: "2025-06-01T00:00:00.000Z",
    updatedAt: "2025-06-01T00:00:00.000Z"
  });
  await createAnalysis(keep.messageId, {
    status: "COMPLETED",
    attemptCount: 1,
    outcome: "NO_WARNING",
    analyzedAt: "2025-07-05T00:00:00.000Z",
    createdAt: "2025-07-05T00:00:00.000Z",
    updatedAt: "2025-07-05T00:00:00.000Z"
  });
  await createAnalysis(remove.messageId, {
    status: "COMPLETED",
    attemptCount: 1,
    outcome: "NO_WARNING",
    analyzedAt: "2025-01-01T00:00:00.000Z",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  });
  const deleted = await transaction((executor) =>
    repository.cleanup(executor, new Date("2025-07-01T00:00:00.000Z"), 1)
  );
  assert.equal(deleted, 1);
  const sourceStillThere = await one<{ count: string }>(
    "SELECT count(*)::text AS count FROM roommate_messages WHERE id = ANY($1::integer[])",
    [[retention.messageId, keep.messageId, remove.messageId]]
  );
  assert.equal(Number(sourceStillThere.count), 3);
  const remaining = await one<{ count: string }>(
    "SELECT count(*)::text AS count FROM roommate_message_ai_safety_analyses WHERE message_id = ANY($1::integer[])",
    [[retention.messageId, keep.messageId, remove.messageId]]
  );
  assert.equal(Number(remaining.count), 2);
});

test("context is same-interest chronological and FK cascade removes only AI metadata", async () => {
  await resetAnalyses();
  const conversation = await createConversation(3041, 3042, "2026-04-01T00:00:00.000Z");
  const sameFirst = await createMessage(conversation.interestId, 3041, "same first", "2026-04-02T00:00:00.000Z");
  const sameSecond = await createMessage(conversation.interestId, 3042, "same second", "2026-04-02T00:00:00.000Z");
  const target = await createMessage(conversation.interestId, 3042, "target", "2026-04-02T00:00:01.000Z");
  const future = await createMessage(conversation.interestId, 3041, "future", "2026-04-02T00:00:02.000Z");
  const hidden = await createMessage(conversation.interestId, 3041, "hidden", "2026-04-01T23:00:00.000Z", "HIDDEN");
  const otherConversation = await createConversation(3043, 3044, "2026-04-02T00:00:00.000Z");
  await createMessage(otherConversation.interestId, 3043, "other interest", "2026-04-02T00:00:00.000Z");
  const context = await transaction((executor) => repository.loadContext(executor, target, 5));
  assert.ok(context);
  assert.equal(context.target.id, target);
  assert.deepEqual(
    context.previous.map((message) => message.id),
    [conversation.messageId, sameFirst, sameSecond]
  );
  assert.equal(
    context.previous.some(
      (message) => message.id === future || message.id === hidden || message.id === otherConversation.messageId
    ),
    false
  );

  const cascadeConversation = await createConversation(3045, 3046, "2026-04-03T00:00:00.000Z");
  const analysisId = await createAnalysis(cascadeConversation.messageId, {
    status: "COMPLETED",
    attemptCount: 1,
    outcome: "NO_WARNING",
    analyzedAt: "2026-04-03T00:00:01.000Z",
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:01.000Z"
  });
  await transaction((executor) =>
    executor.query({ text: "DELETE FROM roommate_messages WHERE id = $1", values: [cascadeConversation.messageId] })
  );
  const deletedAnalysis = await one<{ count: string }>(
    "SELECT count(*)::text AS count FROM roommate_message_ai_safety_analyses WHERE id = $1",
    [analysisId]
  );
  assert.equal(Number(deletedAnalysis.count), 0);
  const unrelated = await one<{ count: string }>(
    "SELECT count(*)::text AS count FROM roommate_messages WHERE id = $1",
    [conversation.messageId]
  );
  assert.equal(Number(unrelated.count), 1);
});

test("message send commits before asynchronous provider work and provider failure cannot roll it back", async () => {
  await resetAnalyses();
  const conversation = await createConversation(3051, 3052, "2027-05-01T00:00:00.000Z");
  const identityAccountClient = {
    async loadRoommateTenantProjectionsByIds(ids: readonly number[]) {
      return ids.map((tenantId) => ({
        tenantId,
        role: "TENANT" as const,
        isActive: true,
        displayName: null,
        memberSince: "2026-01",
        emailVerified: false,
        phoneVerified: false
      }));
    }
  };
  const safetyService = createRoommateSafetyService({
    roommateRepository: createRoommateRepository(),
    safetyRepository: createRoommateSafetyRepository(),
    identityAccountClient,
    transactionRunner: { run: transaction }
  });
  const provider = new FakeAiProvider({ scenario: "TRANSPORT_FAILURE" });
  const sendResult = await safetyService.sendMessage({ userId: 3051, role: "TENANT" }, conversation.interestId, {
    body: "A normal message that must be delivered."
  });
  assert.equal(sendResult.body, "A normal message that must be delivered.");
  assert.equal(provider.requests.length, 0);
  await resetAnalyses();
  const worker = createRoommateAiSafetyWorker({
    configuration: parseRoommateAiConfiguration({
      ROOMMATE_AI_PROVIDER: "GEMINI",
      ROOMMATE_AI_ENABLED: "true",
      ROOMMATE_AI_SAFETY_MODE: "SHADOW",
      GEMINI_API_KEY: "synthetic",
      ROOMMATE_AI_SAFETY_MODEL: "gemini-safety"
    }),
    provider,
    repository,
    transactionRunner: { run: transaction },
    logger
  });
  const run = await worker.runOnce();
  assert.equal(run.claimed > 0, true);
  assert.equal(provider.requests.length > 0, true);
  const persisted = await one<{ count: string }>(
    "SELECT count(*)::text AS count FROM roommate_messages WHERE id = $1",
    [sendResult.id]
  );
  assert.equal(Number(persisted.count), 1);
});

test("provider unavailable, timeout, and invalid output never change committed message delivery", async () => {
  const identityAccountClient = {
    async loadRoommateTenantProjectionsByIds(ids: readonly number[]) {
      return ids.map((tenantId) => ({
        tenantId,
        role: "TENANT" as const,
        isActive: true,
        displayName: null,
        memberSince: "2026-01",
        emailVerified: false,
        phoneVerified: false
      }));
    }
  };
  for (const [index, scenario] of (["TRANSPORT_FAILURE", "TIMEOUT", "SCHEMA_INVALID"] as const).entries()) {
    await resetAnalyses();
    await transaction((executor) => executor.query({ text: "DELETE FROM roommate_messages", values: [] }));
    const ownerTenantId = 3061 + index * 2;
    const conversation = await createConversation(
      ownerTenantId,
      ownerTenantId + 1,
      `2027-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
    );
    const safetyService = createRoommateSafetyService({
      roommateRepository: createRoommateRepository(),
      safetyRepository: createRoommateSafetyRepository(),
      identityAccountClient,
      transactionRunner: { run: transaction }
    });
    const sendResult = await safetyService.sendMessage(
      { userId: ownerTenantId, role: "TENANT" },
      conversation.interestId,
      { body: `Committed before ${scenario}.` }
    );
    const beforeWorker = await one<{ count: string }>(
      "SELECT count(*)::text AS count FROM roommate_message_ai_safety_analyses WHERE message_id = $1",
      [sendResult.id]
    );
    assert.equal(Number(beforeWorker.count), 0);
    const provider = new FakeAiProvider({ scenario });
    const worker = createRoommateAiSafetyWorker({
      configuration: parseRoommateAiConfiguration({
        ROOMMATE_AI_PROVIDER: "GEMINI",
        ROOMMATE_AI_ENABLED: "true",
        ROOMMATE_AI_SAFETY_MODE: "SHADOW",
        GEMINI_API_KEY: "synthetic",
        ROOMMATE_AI_SAFETY_MODEL: "gemini-safety"
      }),
      provider,
      repository,
      transactionRunner: { run: transaction },
      logger
    });
    await worker.runOnce();
    assert.equal(provider.requests.length > 0, true);
    const afterWorker = await one<{ count: string }>(
      "SELECT count(*)::text AS count FROM roommate_messages WHERE id = $1",
      [sendResult.id]
    );
    assert.equal(Number(afterWorker.count), 1);
  }
});
