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
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { AuthenticatedPrincipal } from "../../shared/src/runtime/shared/types/authentication.js";
import { roommateAiApplicationVersions } from "../src/modules/roommate-ai/prompts/versions.js";
import { roommateAiSafetyPrompt } from "../src/modules/roommate-ai/prompts/safety-prompt.js";
import { createRoommateAiSafetyRepository } from "../src/modules/roommate-ai/repositories/roommate-ai-safety-repository.js";
import { parseRoommateAiConfiguration } from "../src/modules/roommate-ai/config/roommate-ai-config.js";
import { RoommateAiCapabilityService } from "../src/modules/roommate-ai/services/roommate-ai-capability-service.js";
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
  throw new Error("V3-06 database tests require the verified disposable Identity test database.");
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

const schemaName = `roommate_ai_safety_projection_${process.pid}`;
if (!/^roommate_ai_safety_projection_[0-9]+$/u.test(schemaName)) throw new Error("Invalid test schema name.");
const quotedSchema = `"${schemaName}"`;
const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrationRunner = createMigrationRunner("Engagement");
const aiSafetyRepository = createRoommateAiSafetyRepository();
const safetyRepository = createRoommateSafetyRepository();
const analysisVersion = roommateAiApplicationVersions.safetyAnalysisVersion;
const promptVersion = roommateAiSafetyPrompt.version;
const schemaVersion = roommateAiSafetyPrompt.schemaVersion;

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

interface Conversation {
  readonly requestId: number;
  readonly interestId: number;
}

async function createConversation(ownerTenantId: number, interestedTenantId: number): Promise<Conversation> {
  return transaction(async (executor) => {
    const request = await executor.query<{ id: number }>({
      text: `
        INSERT INTO roommate_requests (
          owner_tenant_id, preferred_area_keys, budget_min_per_person, budget_max_per_person,
          move_in_from, move_in_until, expires_at, created_at, updated_at
        ) VALUES ($1, ARRAY['Quan 1']::text[], 100, 200, DATE '2028-01-01', DATE '2028-01-30',
                  TIMESTAMPTZ '2028-01-31T00:00:00.000Z', TIMESTAMPTZ '2028-01-01T00:00:00.000Z',
                  TIMESTAMPTZ '2028-01-01T00:00:00.000Z')
        RETURNING id`,
      values: [ownerTenantId]
    });
    const interest = await executor.query<{ id: number }>({
      text: `
        INSERT INTO roommate_interests (request_id, interested_tenant_id, created_at, updated_at)
        VALUES ($1, $2, TIMESTAMPTZ '2028-01-01T00:00:00.000Z', TIMESTAMPTZ '2028-01-01T00:00:00.000Z')
        RETURNING id`,
      values: [request.rows[0]!.id, interestedTenantId]
    });
    await executor.query({
      text: `
        INSERT INTO roommate_messages (interest_id, sender_tenant_id, body, created_at)
        VALUES ($1, $2, 'Initial conversation message.', TIMESTAMPTZ '2028-01-01T00:00:01.000Z')`,
      values: [interest.rows[0]!.id, interestedTenantId]
    });
    return { requestId: request.rows[0]!.id, interestId: interest.rows[0]!.id };
  });
}

async function createMessage(interestId: number, senderTenantId: number, body: string): Promise<number> {
  return transaction(async (executor) => {
    const result = await executor.query<{ id: number }>({
      text: `
        INSERT INTO roommate_messages (interest_id, sender_tenant_id, body, created_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        RETURNING id`,
      values: [interestId, senderTenantId, body]
    });
    return result.rows[0]!.id;
  });
}

async function createAnalysis(
  messageId: number,
  input: {
    readonly status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    readonly outcome?: "NO_WARNING" | "CAUTION" | "HIGH_CAUTION" | null;
    readonly signalCodes?: readonly string[];
    readonly analyzedAt?: string | null;
    readonly lastErrorCode?: string | null;
    readonly leaseExpiresAt?: string | null;
  } = {}
): Promise<void> {
  const status = input.status ?? "PENDING";
  await transaction((executor) =>
    executor.query({
      text: `
        INSERT INTO roommate_message_ai_safety_analyses (
          message_id, analysis_version, prompt_version, schema_version, provider, model_identifier,
          status, attempt_count, next_attempt_at, lease_expires_at, outcome, signal_codes,
          evidence_message_ids, last_error_code, analyzed_at
        ) VALUES ($1, $2, $3, $4, 'GEMINI', 'gemini-safety', $5, 0, CURRENT_TIMESTAMP, $6, $7, $8::text[],
                  ARRAY[]::integer[], $9, $10)`,
      values: [
        messageId,
        analysisVersion,
        promptVersion,
        schemaVersion,
        status,
        input.leaseExpiresAt === undefined || input.leaseExpiresAt === null ? null : new Date(input.leaseExpiresAt),
        input.outcome ?? null,
        [...(input.signalCodes ?? [])],
        input.lastErrorCode ?? null,
        input.analyzedAt === undefined || input.analyzedAt === null ? null : new Date(input.analyzedAt)
      ]
    })
  );
}

function identityClient() {
  return {
    async loadRoommateTenantProjectionsByIds(ids: readonly number[]) {
      return ids.map((tenantId) => ({
        tenantId,
        role: "TENANT" as const,
        displayName: `Tenant ${tenantId}`,
        isActive: true,
        memberSince: "2026-01",
        emailVerified: true,
        phoneVerified: true
      }));
    }
  };
}

function serviceFor(safetyMode: "OFF" | "SHADOW" | "TENANT", rolloutPercentage: number) {
  const configuration = parseRoommateAiConfiguration({
    ROOMMATE_AI_PROVIDER: "GEMINI",
    ROOMMATE_AI_ENABLED: "true",
    ROOMMATE_AI_SAFETY_MODE: safetyMode,
    ROOMMATE_AI_SAFETY_MODEL: "gemini-safety",
    GEMINI_API_KEY: "synthetic",
    ROOMMATE_AI_ROLLOUT_PERCENTAGE: String(rolloutPercentage)
  });
  return createRoommateSafetyService({
    roommateRepository: createRoommateRepository(),
    safetyRepository,
    aiSafetyRepository,
    aiCapabilityService: new RoommateAiCapabilityService(configuration),
    identityAccountClient: identityClient(),
    transactionRunner: { run: transaction }
  });
}

const tenant = (userId: number): AuthenticatedPrincipal => Object.freeze({ userId, role: "TENANT" });
const admin: AuthenticatedPrincipal = Object.freeze({ userId: 9901, role: "ADMIN" });

function stableRiskFlags(
  flags: readonly { readonly code: string; readonly observedCount: number | null; readonly evidenceSummary: unknown }[]
) {
  return flags.map((flag) => ({
    code: flag.code,
    observedCount: flag.observedCount,
    evidenceSummary: flag.evidenceSummary
  }));
}

async function readMessages(
  service: ReturnType<typeof createRoommateSafetyService>,
  principal: AuthenticatedPrincipal,
  interestId: number
) {
  return service.listMessages(principal, interestId, { page: 1, pageSize: 100, offset: 0 });
}

async function createRoommateReport(input: {
  readonly reporterTenantId: number;
  readonly requestId: number;
  readonly targetType: "ROOMMATE_PROFILE" | "ROOMMATE_REQUEST" | "ROOMMATE_MESSAGE";
  readonly subjectTenantId: number | null;
  readonly messageId: number | null;
}) {
  return transaction((executor) =>
    safetyRepository.createReport(executor, {
      ...input,
      category: "SPAM",
      details: "Synthetic V3-06 report.",
      evidenceSnapshot: { kind: input.targetType }
    })
  );
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

test("V3-06 PostgreSQL projects recipient-only warnings across outcome, lifecycle, mode, and rollout", async () => {
  const conversation = await createConversation(4101, 4102);
  const caution = await createMessage(conversation.interestId, 4101, "Please send the OTP now.");
  const highCaution = await createMessage(conversation.interestId, 4101, "Please pay this advance today.");
  const noWarning = await createMessage(conversation.interestId, 4101, "Let us compare schedules.");
  const pending = await createMessage(conversation.interestId, 4101, "Pending safety check.");
  const processing = await createMessage(conversation.interestId, 4101, "Processing safety check.");
  const failed = await createMessage(conversation.interestId, 4101, "Failed safety check.");
  const reverse = await createMessage(conversation.interestId, 4102, "A message back to the owner.");
  await createAnalysis(caution, {
    status: "COMPLETED",
    outcome: "CAUTION",
    signalCodes: ["OTP_REQUEST"],
    analyzedAt: "2028-01-01T00:01:00.000Z"
  });
  await createAnalysis(highCaution, {
    status: "COMPLETED",
    outcome: "HIGH_CAUTION",
    signalCodes: ["ADVANCE_PAYMENT_REQUEST"],
    analyzedAt: "2028-01-01T00:01:01.000Z"
  });
  await createAnalysis(noWarning, {
    status: "COMPLETED",
    outcome: "NO_WARNING",
    analyzedAt: "2028-01-01T00:01:02.000Z"
  });
  await createAnalysis(pending, { status: "PENDING" });
  await createAnalysis(processing, { status: "PROCESSING", leaseExpiresAt: "2028-01-01T00:05:00.000Z" });
  await createAnalysis(failed, { status: "FAILED", lastErrorCode: "TIMEOUT" });
  await createAnalysis(reverse, {
    status: "COMPLETED",
    outcome: "HIGH_CAUTION",
    signalCodes: ["OTP_REQUEST"],
    analyzedAt: "2028-01-01T00:01:03.000Z"
  });

  const enabled = await readMessages(serviceFor("TENANT", 100), tenant(4102), conversation.interestId);
  const enabledById = new Map(enabled.data.map((message) => [message.id, message]));
  assert.equal(enabledById.get(caution)?.safetyWarning?.outcome, "CAUTION");
  assert.equal(enabledById.get(highCaution)?.safetyWarning?.outcome, "HIGH_CAUTION");
  assert.equal(enabledById.get(noWarning)?.safetyWarning, null);
  assert.equal(enabledById.get(pending)?.safetyWarning, null);
  assert.equal(enabledById.get(processing)?.safetyWarning, null);
  assert.equal(enabledById.get(failed)?.safetyWarning, null);
  assert.equal(enabledById.get(reverse)?.safetyWarning, null);

  const senderView = await readMessages(serviceFor("TENANT", 100), tenant(4101), conversation.interestId);
  assert.equal(senderView.data.find((message) => message.id === caution)?.safetyWarning, null);
  assert.equal(senderView.data.find((message) => message.id === highCaution)?.safetyWarning, null);
  assert.equal(senderView.data.find((message) => message.id === reverse)?.safetyWarning?.outcome, "HIGH_CAUTION");

  for (const mode of ["OFF", "SHADOW"] as const) {
    const page = await readMessages(serviceFor(mode, 100), tenant(4102), conversation.interestId);
    assert.equal(page.data.find((message) => message.id === caution)?.safetyWarning, null);
  }
  const outsideRollout = await readMessages(serviceFor("TENANT", 0), tenant(4102), conversation.interestId);
  assert.equal(outsideRollout.data.find((message) => message.id === caution)?.safetyWarning, null);

  const statesBefore = await rows<{
    message_id: number;
    status: string;
    attempt_count: number;
    last_error_code: string | null;
  }>(
    `SELECT message_id, status, attempt_count, last_error_code
     FROM roommate_message_ai_safety_analyses WHERE message_id = ANY($1::integer[]) ORDER BY message_id`,
    [[caution, highCaution, noWarning, pending, processing, failed, reverse]]
  );
  const unrelated = await assert.rejects(
    () => readMessages(serviceFor("TENANT", 100), tenant(4999), conversation.interestId),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
  assert.equal(unrelated, undefined);
  await transaction((executor) =>
    executor.query({
      text: "INSERT INTO contact_blocks (blocker_id, blocked_id, inquiry_id, roommate_request_id) VALUES ($1, $2, NULL, $3)",
      values: [4102, 4101, conversation.requestId]
    })
  );
  await assert.rejects(
    () => readMessages(serviceFor("TENANT", 100), tenant(4102), conversation.interestId),
    (error: unknown) => error instanceof ApplicationError && error.code === "RESOURCE_NOT_FOUND"
  );
  await transaction((executor) =>
    executor.query({
      text: "DELETE FROM contact_blocks WHERE roommate_request_id = $1",
      values: [conversation.requestId]
    })
  );
  await assert.rejects(
    () => readMessages(serviceFor("TENANT", 100), { userId: 4102, role: "LANDLORD" }, conversation.interestId),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );
  await assert.rejects(
    () => readMessages(serviceFor("TENANT", 100), { userId: 4102, role: "ADMIN" }, conversation.interestId),
    (error: unknown) => error instanceof ApplicationError && error.code === "FORBIDDEN"
  );
  const statesAfter = await rows<{
    message_id: number;
    status: string;
    attempt_count: number;
    last_error_code: string | null;
  }>(
    `SELECT message_id, status, attempt_count, last_error_code
     FROM roommate_message_ai_safety_analyses WHERE message_id = ANY($1::integer[]) ORDER BY message_id`,
    [[caution, highCaution, noWarning, pending, processing, failed, reverse]]
  );
  assert.deepEqual(statesAfter, statesBefore);
});

test("V3-06 PostgreSQL admin summary is exact-message-only and leaves V2 risk ordering untouched", async () => {
  const conversation = await createConversation(4201, 4202);
  const message = await createMessage(conversation.interestId, 4201, "Reported message.");
  const neighboring = await createMessage(conversation.interestId, 4201, "Neighboring high caution message.");
  const highReportedMessage = await createMessage(conversation.interestId, 4201, "High caution reported message.");
  const missingMessage = await createMessage(conversation.interestId, 4201, "Missing analysis message.");
  const otherConversation = await createConversation(4203, 4204);
  const otherMessage = await createMessage(otherConversation.interestId, 4203, "Other conversation message.");
  await createAnalysis(neighboring, {
    status: "COMPLETED",
    outcome: "HIGH_CAUTION",
    signalCodes: ["OTP_REQUEST"],
    analyzedAt: "2028-02-01T00:01:00.000Z"
  });
  await createAnalysis(highReportedMessage, {
    status: "COMPLETED",
    outcome: "HIGH_CAUTION",
    signalCodes: ["ADVANCE_PAYMENT_REQUEST"],
    analyzedAt: "2028-02-01T00:01:03.000Z"
  });
  await createAnalysis(otherMessage, {
    status: "COMPLETED",
    outcome: "HIGH_CAUTION",
    signalCodes: ["OTP_REQUEST"],
    analyzedAt: "2028-02-01T00:01:01.000Z"
  });
  const report = await createRoommateReport({
    reporterTenantId: 4202,
    requestId: conversation.requestId,
    targetType: "ROOMMATE_MESSAGE",
    subjectTenantId: null,
    messageId: message
  });
  const highReport = await createRoommateReport({
    reporterTenantId: 4201,
    requestId: conversation.requestId,
    targetType: "ROOMMATE_MESSAGE",
    subjectTenantId: null,
    messageId: highReportedMessage
  });
  const missingReport = await createRoommateReport({
    reporterTenantId: 4201,
    requestId: conversation.requestId,
    targetType: "ROOMMATE_MESSAGE",
    subjectTenantId: null,
    messageId: missingMessage
  });
  const profileReport = await createRoommateReport({
    reporterTenantId: 4203,
    requestId: otherConversation.requestId,
    targetType: "ROOMMATE_PROFILE",
    subjectTenantId: 4203,
    messageId: null
  });
  const requestReport = await createRoommateReport({
    reporterTenantId: 4204,
    requestId: otherConversation.requestId,
    targetType: "ROOMMATE_REQUEST",
    subjectTenantId: null,
    messageId: null
  });
  const crossContextReport = await createRoommateReport({
    reporterTenantId: 4202,
    requestId: conversation.requestId,
    targetType: "ROOMMATE_MESSAGE",
    subjectTenantId: null,
    messageId: otherMessage
  });
  const service = serviceFor("OFF", 0);
  const beforeAnalysis = await service.listAdminReports(admin, {
    source: "ROOMMATE",
    status: "OPEN",
    category: null,
    page: 1,
    pageSize: 100,
    offset: 0,
    reviewPriority: null
  });
  const before = beforeAnalysis.data.find((item) => item.id === report.report.id);
  assert.ok(before);
  assert.equal(before.aiSafetySummary, null);

  await createAnalysis(message, {
    status: "COMPLETED",
    outcome: "CAUTION",
    signalCodes: ["OTP_REQUEST"],
    analyzedAt: "2028-02-01T00:01:02.000Z"
  });
  const afterAnalysis = await service.listAdminReports(admin, {
    source: "ROOMMATE",
    status: "OPEN",
    category: null,
    page: 1,
    pageSize: 100,
    offset: 0,
    reviewPriority: null
  });
  assert.deepEqual(
    afterAnalysis.data.map((item) => item.id),
    beforeAnalysis.data.map((item) => item.id)
  );
  assert.equal(afterAnalysis.hasNextPage, beforeAnalysis.hasNextPage);
  const after = afterAnalysis.data.find((item) => item.id === report.report.id);
  assert.ok(after);
  assert.equal(after.riskSummary.rulesVersion, before.riskSummary.rulesVersion);
  assert.equal(after.riskSummary.reviewPriority, before.riskSummary.reviewPriority);
  assert.equal(after.riskSummary.partialEvaluation, before.riskSummary.partialEvaluation);
  assert.deepEqual(stableRiskFlags(after.riskSummary.flags), stableRiskFlags(before.riskSummary.flags));
  assert.deepEqual(after.aiSafetySummary, {
    highestOutcome: "CAUTION",
    signalCodes: ["OTP_REQUEST"],
    messageIds: [message],
    analysisVersion,
    promptVersion,
    modelVersion: "gemini-safety",
    analyzedAt: "2028-02-01T00:01:02.000Z"
  });
  assert.equal(after.status, before.status);
  assert.equal(
    afterAnalysis.data.find((item) => item.id === highReport.report.id)?.aiSafetySummary?.highestOutcome,
    "HIGH_CAUTION"
  );
  assert.equal(afterAnalysis.data.find((item) => item.id === missingReport.report.id)?.aiSafetySummary, null);
  assert.equal(afterAnalysis.data.find((item) => item.id === profileReport.report.id)?.aiSafetySummary, null);
  assert.equal(afterAnalysis.data.find((item) => item.id === requestReport.report.id)?.aiSafetySummary, null);
  assert.equal(afterAnalysis.data.find((item) => item.id === crossContextReport.report.id)?.aiSafetySummary, null);

  const pendingMessage = await createMessage(conversation.interestId, 4201, "Pending report message.");
  const pendingReport = await createRoommateReport({
    reporterTenantId: 4202,
    requestId: conversation.requestId,
    targetType: "ROOMMATE_MESSAGE",
    subjectTenantId: null,
    messageId: pendingMessage
  });
  await createAnalysis(pendingMessage, { status: "PENDING" });
  const failedMessage = await createMessage(conversation.interestId, 4201, "Failed report message.");
  const failedReport = await createRoommateReport({
    reporterTenantId: 4201,
    requestId: conversation.requestId,
    targetType: "ROOMMATE_MESSAGE",
    subjectTenantId: null,
    messageId: failedMessage
  });
  await createAnalysis(failedMessage, { status: "FAILED", lastErrorCode: "TIMEOUT" });
  const processingMessage = await createMessage(conversation.interestId, 4201, "Processing report message.");
  const processingReport = await createRoommateReport({
    reporterTenantId: 4202,
    requestId: conversation.requestId,
    targetType: "ROOMMATE_MESSAGE",
    subjectTenantId: null,
    messageId: processingMessage
  });
  await createAnalysis(processingMessage, {
    status: "PROCESSING",
    leaseExpiresAt: "2028-02-01T00:05:00.000Z"
  });
  const finalPage = await service.listAdminReports(admin, {
    source: "ROOMMATE",
    status: "OPEN",
    category: null,
    page: 1,
    pageSize: 100,
    offset: 0,
    reviewPriority: null
  });
  assert.equal(finalPage.data.find((item) => item.id === pendingReport.report.id)?.aiSafetySummary, null);
  assert.equal(finalPage.data.find((item) => item.id === failedReport.report.id)?.aiSafetySummary, null);
  assert.equal(finalPage.data.find((item) => item.id === processingReport.report.id)?.aiSafetySummary, null);
  const analysisRows = await rows<{
    message_id: number;
    status: string;
    attempt_count: number;
    lease_expires_at: Date | null;
    last_error_code: string | null;
  }>(
    `SELECT message_id, status, attempt_count, lease_expires_at, last_error_code
     FROM roommate_message_ai_safety_analyses
     WHERE message_id = ANY($1::integer[]) ORDER BY message_id`,
    [[highReportedMessage, neighboring, message, pendingMessage, processingMessage, failedMessage]]
  );
  assert.deepEqual(
    analysisRows.map((row) => ({ ...row, lease_expires_at: row.lease_expires_at?.toISOString() ?? null })),
    [
      {
        message_id: message,
        status: "COMPLETED",
        attempt_count: 0,
        lease_expires_at: null,
        last_error_code: null
      },
      { message_id: neighboring, status: "COMPLETED", attempt_count: 0, lease_expires_at: null, last_error_code: null },
      {
        message_id: highReportedMessage,
        status: "COMPLETED",
        attempt_count: 0,
        lease_expires_at: null,
        last_error_code: null
      },
      {
        message_id: pendingMessage,
        status: "PENDING",
        attempt_count: 0,
        lease_expires_at: null,
        last_error_code: null
      },
      {
        message_id: failedMessage,
        status: "FAILED",
        attempt_count: 0,
        lease_expires_at: null,
        last_error_code: "TIMEOUT"
      },
      {
        message_id: processingMessage,
        status: "PROCESSING",
        attempt_count: 0,
        lease_expires_at: "2028-02-01T00:05:00.000Z",
        last_error_code: null
      }
    ]
  );
});
