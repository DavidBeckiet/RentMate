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
import { defaultRoommateRiskConfig } from "../../shared/src/runtime/config/env.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import type {
  IdentityRoommateRiskProjection,
  IdentityRoommateTenantProjection
} from "../../shared/identity-account-client.js";
import { createRoommateRepository } from "../src/modules/roommate/repositories/roommate-repository.js";
import { createRoommateSafetyRepository } from "../src/modules/roommate/repositories/roommate-safety-repository.js";
import { createRoommateService } from "../src/modules/roommate/services/roommate-service.js";
import { createRoommateSafetyService } from "../src/modules/roommate/services/roommate-safety-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for Engagement database integration tests.");

const parsed = new URL(databaseUrl);
const pool = createPostgresPool(
  {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    max: 16,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  },
  { debug() {}, info() {}, warn() {}, error() {} }
);

const schemaName = `roommate_safety_${process.pid}`;
const quotedSchema = `"${schemaName}"`;
const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrationRunner = createMigrationRunner("Engagement");
const roommateRepository = createRoommateRepository();
const safetyRepository = createRoommateSafetyRepository();

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

const principals = new Map<number, IdentityRoommateTenantProjection>();
const riskAccountCreatedAt = new Map<number, string>();
const identityAccountClient = {
  async loadRoommateTenantProjectionsByIds(
    ids: readonly number[]
  ): Promise<readonly IdentityRoommateTenantProjection[]> {
    return ids
      .map((id) => principals.get(id))
      .filter((projection): projection is IdentityRoommateTenantProjection => projection !== undefined);
  },
  async loadRoommateRiskProjectionsByIds(ids: readonly number[]): Promise<readonly IdentityRoommateRiskProjection[]> {
    return ids
      .map((tenantId) => {
        const createdAt = riskAccountCreatedAt.get(tenantId);
        return createdAt === undefined ? undefined : { tenantId, createdAt };
      })
      .filter((projection): projection is IdentityRoommateRiskProjection => projection !== undefined);
  }
};

const roommateService = createRoommateService({
  repository: roommateRepository,
  safetyRepository,
  identityAccountClient,
  listingCatalogClient: {
    async loadPublicSummariesByIds() {
      return [];
    }
  },
  transactionRunner: { run: transaction }
});
const safetyService = createRoommateSafetyService({
  roommateRepository,
  safetyRepository,
  identityAccountClient,
  transactionRunner: { run: transaction }
});

const profileInput = {
  intro: "A complete roommate profile used for messaging and safety integration tests.",
  sleepSchedule: "STANDARD",
  cleanlinessLevel: "BALANCED",
  noisePreference: "QUIET",
  smokingEnvironment: "SMOKE_FREE",
  petEnvironment: "NO_PETS"
} as const;

function registerTenant(tenantId: number): void {
  principals.set(tenantId, {
    tenantId,
    role: "TENANT",
    isActive: true,
    displayName: `Tenant ${tenantId}`,
    memberSince: "2026-01",
    emailVerified: false,
    phoneVerified: false
  });
  riskAccountCreatedAt.set(tenantId, "2025-01-01T00:00:00.000Z");
}

async function createProfile(tenantId: number): Promise<void> {
  registerTenant(tenantId);
  await transaction((executor) => roommateRepository.upsertProfile(executor, tenantId, profileInput));
}

function principal(tenantId: number) {
  return { userId: tenantId, role: "TENANT" as const };
}

const admin = { userId: 9001, role: "ADMIN" as const };

function requestInput() {
  const moveInFromDate = new Date();
  moveInFromDate.setUTCDate(moveInFromDate.getUTCDate() + 14);
  const moveInUntilDate = new Date(moveInFromDate);
  moveInUntilDate.setUTCDate(moveInUntilDate.getUTCDate() + 30);
  return {
    listingId: null,
    preferredAreaKeys: ["Quan 1"],
    budgetMinPerPerson: 1_000_000,
    budgetMaxPerPerson: 2_000_000,
    moveInFrom: moveInFromDate.toISOString().slice(0, 10),
    moveInUntil: moveInUntilDate.toISOString().slice(0, 10),
    note: "Looking for a calm and respectful roommate."
  } as const;
}

async function createRequest(ownerTenantId: number): Promise<number> {
  return (await roommateService.createRequest(principal(ownerTenantId), requestInput())).id;
}

async function createInterest(requestId: number, tenantId: number): Promise<number> {
  return (
    await roommateService.createInterest(principal(tenantId), requestId, {
      message: `Hello from tenant ${tenantId}.`
    })
  ).id;
}

async function queryOne<T extends Record<string, unknown>>(text: string, values: readonly unknown[]): Promise<T> {
  return transaction(async (executor) => {
    const result = await executor.query<T>({ text, values });
    assert.equal(result.rows.length, 1);
    return result.rows[0]!;
  });
}

async function queryRows<T extends Record<string, unknown>>(
  text: string,
  values: readonly unknown[]
): Promise<readonly T[]> {
  return transaction(async (executor) => (await executor.query<T>({ text, values })).rows);
}

before(async () => {
  await pool.query(`CREATE SCHEMA ${quotedSchema}`);
  const migrations = await migrationRunner.discover(migrationsDirectory);
  await migrationRunner.executePlan(migrationPool(), migrationRunner.createPlan("clean", migrations));
});

after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await pool.end();
});

test("supports ordered participant messaging, pagination, monotonic reads, placeholders, and notifications", async () => {
  await Promise.all([createProfile(2001), createProfile(2002)]);
  const requestId = await createRequest(2001);
  const interestId = await createInterest(requestId, 2002);

  const firstPage = await safetyService.listMessages(principal(2002), interestId, {
    page: 1,
    pageSize: 1,
    offset: 0
  });
  assert.equal(firstPage.data.length, 1);
  assert.equal(firstPage.data[0]?.sender, "SELF");
  assert.equal(firstPage.data[0]?.body, "Hello from tenant 2002.");
  assert.equal(firstPage.hasNextPage, false);

  const ownerMessage = await safetyService.sendMessage(principal(2001), interestId, { body: "Owner reply." });
  const candidateMessage = await safetyService.sendMessage(principal(2002), interestId, { body: "Candidate reply." });
  assert.equal(ownerMessage.sender, "SELF");
  assert.equal(candidateMessage.sender, "SELF");

  const ownerPage = await safetyService.listMessages(principal(2001), interestId, {
    page: 1,
    pageSize: 100,
    offset: 0
  });
  assert.deepEqual(
    ownerPage.data.map((message) => message.body),
    ["Hello from tenant 2002.", "Owner reply.", "Candidate reply."]
  );
  assert.deepEqual(
    ownerPage.data.map((message) => message.sender),
    ["COUNTERPART", "SELF", "COUNTERPART"]
  );
  assert.equal("senderTenantId" in ownerPage.data[0]!, false);

  const ownerMessageRows = await queryRows<{ id: number; sender_tenant_id: number; read_at: string | null }>(
    "SELECT id, sender_tenant_id, read_at FROM roommate_messages WHERE interest_id = $1 ORDER BY created_at, id",
    [interestId]
  );
  const beforeRead = ownerMessageRows.map((row) => row.read_at);
  await safetyService.markMessagesRead(principal(2001), interestId);
  await safetyService.markMessagesRead(principal(2001), interestId);
  const afterOwnerRead = await queryRows<{ id: number; sender_tenant_id: number; read_at: string | null }>(
    "SELECT id, sender_tenant_id, read_at FROM roommate_messages WHERE interest_id = $1 ORDER BY created_at, id",
    [interestId]
  );
  assert.equal(afterOwnerRead[0]?.read_at !== null, true);
  assert.equal(afterOwnerRead[1]?.read_at, beforeRead[1]);
  assert.equal(afterOwnerRead[2]?.read_at !== null, true);

  await safetyService.markMessagesRead(principal(2002), interestId);
  const afterBothRead = await queryRows<{ read_at: string | null }>(
    "SELECT read_at FROM roommate_messages WHERE interest_id = $1 ORDER BY created_at, id",
    [interestId]
  );
  assert.equal(
    afterBothRead.every((row) => row.read_at !== null),
    true
  );

  await transaction((executor) =>
    executor.query({
      text: "UPDATE roommate_messages SET moderation_state = 'HIDDEN' WHERE id = $1",
      values: [ownerMessage.id]
    })
  );
  const hiddenPage = await safetyService.listMessages(principal(2002), interestId, {
    page: 1,
    pageSize: 100,
    offset: 0
  });
  assert.equal(
    hiddenPage.data.find((message) => message.id === ownerMessage.id)?.body,
    "This message is no longer available."
  );

  await roommateService.rejectInterest(principal(2001), interestId);
  await assert.rejects(
    () => safetyService.sendMessage(principal(2002), interestId, { body: "too late" }),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "CONCURRENT_MODIFICATION"
  );
  assert.equal(
    (await safetyService.listMessages(principal(2002), interestId, { page: 1, pageSize: 100, offset: 0 })).data.length,
    3
  );

  const notifications = await queryRows<{
    event_type: string;
    roommate_request_id: number | null;
    roommate_interest_id: number | null;
    resource_path: string;
    dedupe_key: string;
  }>(
    `SELECT event_type, roommate_request_id, roommate_interest_id, resource_path, dedupe_key
     FROM notifications WHERE roommate_interest_id = $1 ORDER BY id`,
    [interestId]
  );
  assert.deepEqual(
    notifications.map((notification) => notification.event_type),
    [
      "ROOMMATE_INTEREST_RECEIVED",
      "ROOMMATE_MESSAGE_RECEIVED",
      "ROOMMATE_MESSAGE_RECEIVED",
      "ROOMMATE_INTEREST_REJECTED"
    ]
  );
  assert.equal(
    notifications.every((notification) => notification.roommate_request_id === null),
    true
  );
  assert.equal(
    notifications.every((notification) => notification.resource_path === `/roommate-interests/${interestId}`),
    true
  );
  assert.equal(
    notifications.some((notification) => notification.dedupe_key.includes("Owner reply")),
    false
  );
});

test("applies directional block outcomes without exposing direction or resurrecting history", async () => {
  await Promise.all([createProfile(2101), createProfile(2102), createProfile(2111), createProfile(2112)]);
  const requestId = await createRequest(2101);
  const interestId = await createInterest(requestId, 2102);
  await safetyService.blockInterest(principal(2102), interestId);
  let state = await queryOne<{ request_status: string; interest_status: string }>(
    `SELECT r.status AS request_status, i.status AS interest_status
     FROM roommate_requests r JOIN roommate_interests i ON i.request_id = r.id WHERE i.id = $1`,
    [interestId]
  );
  assert.deepEqual(state, { request_status: "OPEN", interest_status: "WITHDRAWN" });
  await assert.rejects(
    () => safetyService.listMessages(principal(2101), interestId, { page: 1, pageSize: 50, offset: 0 }),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "RESOURCE_NOT_FOUND"
  );
  assert.deepEqual(await safetyService.blockInterest(principal(2102), interestId), { blocked: true });
  assert.deepEqual(await safetyService.unblockInterest(principal(2102), interestId), { blocked: false });
  assert.deepEqual(await safetyService.unblockInterest(principal(2102), interestId), { blocked: false });
  assert.equal(
    (await queryOne<{ status: string }>("SELECT status FROM roommate_interests WHERE id = $1", [interestId])).status,
    "WITHDRAWN"
  );

  const requestBlockId = await createRequest(2111);
  const requestBlockInterestId = await createInterest(requestBlockId, 2112);
  await safetyService.blockRequest(principal(2112), requestBlockId);
  assert.deepEqual(await safetyService.blockRequest(principal(2112), requestBlockId), { blocked: true });
  assert.equal(
    (
      await queryOne<{ status: string }>("SELECT status FROM roommate_interests WHERE id = $1", [
        requestBlockInterestId
      ])
    ).status,
    "WITHDRAWN"
  );

  await roommateService.cancelRequest(principal(2111), requestBlockId);
  const replacementRequestId = await createRequest(2111);
  assert.deepEqual(await safetyService.blockRequest(principal(2112), replacementRequestId), { blocked: true });
  assert.deepEqual(await safetyService.unblockRequest(principal(2112), replacementRequestId), { blocked: false });

  await Promise.all([createProfile(2121), createProfile(2122), createProfile(2131), createProfile(2132)]);
  const ownerBlockRequestId = await createRequest(2121);
  const ownerBlockInterestId = await createInterest(ownerBlockRequestId, 2122);
  await safetyService.blockInterest(principal(2121), ownerBlockInterestId);
  assert.equal(
    (await queryOne<{ status: string }>("SELECT status FROM roommate_interests WHERE id = $1", [ownerBlockInterestId]))
      .status,
    "REJECTED"
  );

  const acceptedRequestId = await createRequest(2131);
  const acceptedInterestId = await createInterest(acceptedRequestId, 2132);
  await roommateService.acceptInterest(principal(2131), acceptedInterestId);
  await safetyService.blockInterest(principal(2131), acceptedInterestId);
  state = await queryOne<{ request_status: string; interest_status: string }>(
    `SELECT r.status AS request_status, i.status AS interest_status
     FROM roommate_requests r JOIN roommate_interests i ON i.request_id = r.id WHERE i.id = $1`,
    [acceptedInterestId]
  );
  assert.deepEqual(state, { request_status: "MATCHED", interest_status: "LEFT" });
  await assert.rejects(
    () => roommateService.getCurrentConnection(principal(2131)),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "RESOURCE_NOT_FOUND"
  );
  assert.deepEqual(await safetyService.unblockInterest(principal(2131), acceptedInterestId), { blocked: false });
  assert.equal(
    (await queryOne<{ status: string }>("SELECT status FROM roommate_interests WHERE id = $1", [acceptedInterestId]))
      .status,
    "LEFT"
  );
});

test("lists only caller-owned roommate blocks with existing request or interest unblock actions", async () => {
  await Promise.all([
    createProfile(2401),
    createProfile(2402),
    createProfile(2403),
    createProfile(2404),
    createProfile(2405),
    createProfile(2406)
  ]);

  const requestContextId = await createRequest(2402);
  await safetyService.blockRequest(principal(2401), requestContextId);

  const ownerRequestId = await createRequest(2401);
  const interestContextId = await createInterest(ownerRequestId, 2403);
  await safetyService.blockInterest(principal(2401), interestContextId);
  assert.equal(
    (await queryOne<{ status: string }>("SELECT status FROM roommate_interests WHERE id = $1", [interestContextId]))
      .status,
    "REJECTED"
  );

  await safetyService.blockRequest(principal(2404), ownerRequestId);
  const inquiryId = await transaction(async (executor) => {
    const inquiry = await executor.query<{ id: unknown }>({
      text: `
        INSERT INTO listing_inquiries (tenant_id, landlord_id, listing_id)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      values: [2401, 2406, 991]
    });
    const id = Number(inquiry.rows[0]?.id);
    assert.equal(Number.isSafeInteger(id), true);
    await executor.query({
      text: `
        INSERT INTO contact_blocks (blocker_id, blocked_id, inquiry_id)
        VALUES ($1, $2, $3)
      `,
      values: [2401, 2406, id]
    });
    return id;
  });
  assert.equal(Number.isSafeInteger(inquiryId), true);

  const firstPage = await safetyService.listOwnedBlocks(principal(2401), { page: 1, pageSize: 1, offset: 0 });
  const secondPage = await safetyService.listOwnedBlocks(principal(2401), { page: 2, pageSize: 1, offset: 1 });
  assert.equal(firstPage.data.length, 1);
  assert.equal(firstPage.hasNextPage, true);
  assert.equal(secondPage.data.length, 1);
  assert.equal(secondPage.hasNextPage, false);

  const page = await safetyService.listOwnedBlocks(principal(2401), { page: 1, pageSize: 20, offset: 0 });
  assert.equal(page.data.length, 2);
  assert.deepEqual(page.data.map((block) => block.unblockAction.kind).sort(), ["INTEREST", "REQUEST"]);
  for (const block of page.data) {
    assert.equal("tenantId" in block, false);
    assert.equal("blockedTenantId" in block, false);
    assert.equal("blockerTenantId" in block, false);
    assert.equal("email" in block.counterpart, false);
    assert.equal("phone" in block.counterpart, false);
    assert.equal("terminalReason" in block, false);
  }

  const requestBlock = page.data.find((block) => block.unblockAction.kind === "REQUEST");
  const interestBlock = page.data.find((block) => block.unblockAction.kind === "INTEREST");
  assert.ok(requestBlock);
  assert.ok(interestBlock);

  const beforeUnblockNotifications = await queryRows<{ id: number }>(
    "SELECT id FROM notifications WHERE roommate_request_id IN ($1, $2) OR roommate_interest_id = $3",
    [requestContextId, ownerRequestId, interestContextId]
  );
  await safetyService.unblockRequest(principal(2401), requestBlock.unblockAction.id);
  await safetyService.unblockInterest(principal(2401), interestBlock.unblockAction.id);
  const afterUnblock = await safetyService.listOwnedBlocks(principal(2401), { page: 1, pageSize: 20, offset: 0 });
  assert.equal(afterUnblock.data.length, 0);
  assert.equal(
    (await queryOne<{ status: string }>("SELECT status FROM roommate_interests WHERE id = $1", [interestContextId]))
      .status,
    "REJECTED"
  );
  const afterUnblockNotifications = await queryRows<{ id: number }>(
    "SELECT id FROM notifications WHERE roommate_request_id IN ($1, $2) OR roommate_interest_id = $3",
    [requestContextId, ownerRequestId, interestContextId]
  );
  assert.deepEqual(afterUnblockNotifications, beforeUnblockNotifications);
});

test("dedupes reports, projects caller-owned acknowledgement, retains minimal evidence, and enforces admin moderation context", async () => {
  await Promise.all([createProfile(2201), createProfile(2202), createProfile(2203)]);
  const requestId = await createRequest(2201);
  const interestId = await createInterest(requestId, 2202);
  assert.deepEqual((await roommateService.getRequest(principal(2202), requestId)).reporting, {
    profileHasReported: false,
    requestHasReported: false
  });
  const requestReport = await safetyService.createRequestReport(principal(2202), requestId, {
    targetType: "ROOMMATE_REQUEST",
    category: "FRAUD",
    details: "The request contains suspicious claims."
  });
  assert.deepEqual((await roommateService.getRequest(principal(2202), requestId)).reporting, {
    profileHasReported: false,
    requestHasReported: true
  });
  const profileReport = await safetyService.createInterestReport(principal(2202), interestId, {
    category: "IMPERSONATION",
    details: "The profile may impersonate another person."
  });
  const callerProjection = await roommateService.getRequest(principal(2202), requestId);
  assert.deepEqual(callerProjection.reporting, { profileHasReported: true, requestHasReported: true });
  const differentCallerProjection = await roommateService.getRequest(principal(2203), requestId);
  assert.deepEqual(differentCallerProjection.reporting, { profileHasReported: false, requestHasReported: false });
  const message = await safetyService.sendMessage(principal(2201), interestId, { body: "Please pay a deposit first." });
  const messageReports = await Promise.all([
    safetyService.createMessageReport(principal(2202), message.id, {
      category: "PAYMENT_SCAM",
      details: "Requests money."
    }),
    safetyService.createMessageReport(principal(2202), message.id, {
      category: "PAYMENT_SCAM",
      details: "Retry duplicate."
    })
  ]);
  assert.equal(messageReports[0]?.id, messageReports[1]?.id);
  const messageReportId = messageReports[0]!.id;
  assert.equal("details" in messageReports[0]!, false);
  assert.equal("evidenceSnapshot" in messageReports[0]!, false);

  const reportState = await queryOne<{
    inquiry_id: number | null;
    roommate_message_id: number | null;
    evidence_snapshot: Record<string, unknown>;
  }>(
    `SELECT inquiry_id, roommate_message_id, evidence_snapshot
     FROM contact_reports WHERE source = 'ROOMMATE' AND roommate_message_id = $1`,
    [message.id]
  );
  const reportCounts = await queryOne<{ report_count: string; event_count: string }>(
    `SELECT count(*)::text AS report_count,
       (SELECT count(*)::text FROM contact_report_events WHERE report_id = $1) AS event_count
     FROM contact_reports WHERE source = 'ROOMMATE' AND roommate_message_id = $2`,
    [messageReportId, message.id]
  );
  assert.equal(reportCounts.report_count, "1");
  assert.equal(reportCounts.event_count, "1");
  assert.equal(reportState.inquiry_id, null);
  assert.equal(reportState.roommate_message_id, message.id);
  assert.equal(reportState.evidence_snapshot.kind, "ROOMMATE_MESSAGE");
  assert.equal(reportState.evidence_snapshot.body, "Please pay a deposit first.");

  const adminPage = await safetyService.listAdminReports(admin, {
    source: "ROOMMATE",
    status: "OPEN",
    category: null,
    page: 1,
    pageSize: 50,
    offset: 0
  });
  const messageAdminRow = adminPage.data.find((report) => report.id === messageReportId)!;
  const profileAdminRow = adminPage.data.find((report) => report.id === profileReport.id)!;
  assert.equal(messageAdminRow.reporter.displayName, "Tenant 2202");
  assert.equal("assignedAdminId" in messageAdminRow, false);
  assert.equal("reporterTenantId" in messageAdminRow, false);
  assert.equal("profileTenantId" in messageAdminRow.subject, false);
  assert.equal("profileTenantId" in profileAdminRow.subject, false);

  const profileDetail = await safetyService.getAdminReport(admin, profileReport.id);
  assert.equal(profileDetail?.subject.profileTenantId, 2201);

  await safetyService.moderateMessage(admin, message.id, {
    state: "HIDDEN",
    note: "Review the reported message.",
    reportId: messageReportId
  });
  const hidden = await safetyService.listMessages(principal(2202), interestId, { page: 1, pageSize: 50, offset: 0 });
  assert.equal(hidden.data.find((item) => item.id === message.id)?.body, "This message is no longer available.");
  await safetyService.moderateMessage(admin, message.id, {
    state: "VISIBLE",
    note: "Restore after review.",
    reportId: messageReportId
  });
  await safetyService.moderateMessage(admin, message.id, {
    state: "VISIBLE",
    note: null,
    reportId: messageReportId
  });
  const restored = await safetyService.listMessages(principal(2202), interestId, { page: 1, pageSize: 50, offset: 0 });
  assert.equal(restored.data.find((item) => item.id === message.id)?.body, "Please pay a deposit first.");

  await safetyService.moderateProfile(admin, 2201, {
    state: "HIDDEN",
    note: "Hide reported profile.",
    reportId: profileReport.id
  });
  await safetyService.moderateRequest(admin, requestId, {
    state: "HIDDEN",
    note: "Hide reported request.",
    reportId: requestReport.id
  });
  const moderationStates = await queryOne<{ profile_state: string; request_state: string; message_state: string }>(
    `SELECT
       (SELECT moderation_state FROM roommate_profiles WHERE tenant_id = 2201) AS profile_state,
       (SELECT moderation_state FROM roommate_requests WHERE id = $1) AS request_state,
       (SELECT moderation_state FROM roommate_messages WHERE id = $2) AS message_state`,
    [requestId, message.id]
  );
  assert.deepEqual(moderationStates, { profile_state: "HIDDEN", request_state: "HIDDEN", message_state: "VISIBLE" });

  const detail = await safetyService.getAdminReport(admin, messageReportId);
  assert.ok(detail);
  assert.equal(detail?.events?.length, 3);
  assert.equal("actorId" in (detail?.events?.[0] ?? {}), false);
  assert.equal("subjectId" in (detail?.events?.[0] ?? {}), false);
  assert.equal(detail?.evidenceSnapshot?.body, "Please pay a deposit first.");

  await safetyService.updateAdminReportStatus(admin, messageReportId, { status: "INVESTIGATING", note: null });
  const resolved = await safetyService.updateAdminReportStatus(admin, messageReportId, {
    status: "RESOLVED",
    note: "Reviewed and resolved."
  });
  assert.equal(resolved?.status, "RESOLVED");
  assert.equal(
    (
      await queryOne<{ event_count: string }>(
        "SELECT count(*)::text AS event_count FROM contact_report_events WHERE report_id = $1",
        [messageReportId]
      )
    ).event_count,
    "5"
  );
});

test("serializes block, accept, leave, read, and rollback outcomes without partial writes", async () => {
  await Promise.all([
    createProfile(2301),
    createProfile(2302),
    createProfile(2311),
    createProfile(2312),
    createProfile(2321),
    createProfile(2322),
    createProfile(2331),
    createProfile(2332)
  ]);

  const messageRaceRequestId = await createRequest(2301);
  const messageRaceInterestId = await createInterest(messageRaceRequestId, 2302);
  await Promise.allSettled([
    safetyService.sendMessage(principal(2302), messageRaceInterestId, { body: "Racing message." }),
    safetyService.blockInterest(principal(2301), messageRaceInterestId)
  ]);
  assert.equal(
    (await queryOne<{ status: string }>("SELECT status FROM roommate_interests WHERE id = $1", [messageRaceInterestId]))
      .status,
    "REJECTED"
  );
  const messageRaceCount = Number(
    (
      await queryOne<{ count: string }>(
        "SELECT count(*)::text AS count FROM roommate_messages WHERE interest_id = $1",
        [messageRaceInterestId]
      )
    ).count
  );
  assert.ok(messageRaceCount >= 1 && messageRaceCount <= 2);

  const acceptRaceRequestId = await createRequest(2311);
  const acceptRaceInterestId = await createInterest(acceptRaceRequestId, 2312);
  await Promise.allSettled([
    roommateService.acceptInterest(principal(2311), acceptRaceInterestId),
    safetyService.blockInterest(principal(2312), acceptRaceInterestId)
  ]);
  const acceptRaceState = await queryOne<{ request_status: string; interest_status: string }>(
    `SELECT r.status AS request_status, i.status AS interest_status
     FROM roommate_requests r JOIN roommate_interests i ON i.request_id = r.id WHERE i.id = $1`,
    [acceptRaceInterestId]
  );
  assert.ok(
    (acceptRaceState.request_status === "MATCHED" && acceptRaceState.interest_status === "LEFT") ||
      (acceptRaceState.request_status === "OPEN" && acceptRaceState.interest_status === "WITHDRAWN")
  );

  const leaveRaceRequestId = await createRequest(2321);
  const leaveRaceInterestId = await createInterest(leaveRaceRequestId, 2322);
  await roommateService.acceptInterest(principal(2321), leaveRaceInterestId);
  await Promise.allSettled([
    roommateService.leaveInterest(principal(2322), leaveRaceInterestId),
    safetyService.blockInterest(principal(2321), leaveRaceInterestId)
  ]);
  assert.equal(
    (await queryOne<{ status: string }>("SELECT status FROM roommate_interests WHERE id = $1", [leaveRaceInterestId]))
      .status,
    "LEFT"
  );

  const readRaceRequestId = await createRequest(2331);
  const readRaceInterestId = await createInterest(readRaceRequestId, 2332);
  await safetyService.sendMessage(principal(2331), readRaceInterestId, { body: "Read race." });
  await Promise.all([
    safetyService.markMessagesRead(principal(2331), readRaceInterestId),
    safetyService.markMessagesRead(principal(2331), readRaceInterestId),
    safetyService.markMessagesRead(principal(2332), readRaceInterestId)
  ]);
  const readRows = await queryRows<{ read_at: string | null }>(
    "SELECT read_at FROM roommate_messages WHERE interest_id = $1",
    [readRaceInterestId]
  );
  assert.equal(
    readRows.every((row) => row.read_at !== null),
    true
  );

  const before = await queryOne<{ message_count: string; notification_count: string }>(
    `SELECT
       (SELECT count(*)::text FROM roommate_messages WHERE interest_id = $1) AS message_count,
       (SELECT count(*)::text FROM notifications WHERE roommate_interest_id = $1) AS notification_count`,
    [readRaceInterestId]
  );
  await assert.rejects(() =>
    transaction(async (executor) => {
      const message = await safetyRepository.createMessage(executor, {
        interestId: readRaceInterestId,
        senderTenantId: 2331,
        body: "This mutation must roll back."
      });
      await safetyRepository.createNotification(executor, {
        recipientId: 2332,
        eventType: "ROOMMATE_MESSAGE_RECEIVED",
        interestId: readRaceInterestId,
        dedupeKey: `rollback-message:${message.id}`
      });
      throw new Error("forced rollback");
    })
  );
  const after = await queryOne<{ message_count: string; notification_count: string }>(
    `SELECT
       (SELECT count(*)::text FROM roommate_messages WHERE interest_id = $1) AS message_count,
       (SELECT count(*)::text FROM notifications WHERE roommate_interest_id = $1) AS notification_count`,
    [readRaceInterestId]
  );
  assert.deepEqual(after, before);
});

test("aggregates bounded Roommate risk activity from PostgreSQL without mutating source facts", async () => {
  const subjectTenantId = 2501;
  const counterpartTenantIds = [2502, 2503, 2504] as const;
  await Promise.all([createProfile(subjectTenantId), ...counterpartTenantIds.map((id) => createProfile(id))]);

  const interestIds: number[] = [];
  for (const counterpartTenantId of counterpartTenantIds) {
    const requestId = await createRequest(counterpartTenantId);
    interestIds.push(await createInterest(requestId, subjectTenantId));
  }
  await safetyService.sendMessage(principal(subjectTenantId), interestIds[0]!, {
    body: "Mình muốn trao đổi tại https://example.com"
  });
  await safetyService.sendMessage(principal(subjectTenantId), interestIds[1]!, {
    body: "Mình muốn trao đổi tại https://example.com"
  });

  const subjectMessages = await queryRows<{ id: number; interest_id: number }>(
    `SELECT id, interest_id FROM roommate_messages
     WHERE sender_tenant_id = $1 ORDER BY id ASC`,
    [subjectTenantId]
  );
  assert.equal(subjectMessages.length, 5);

  await Promise.all([
    safetyService.createMessageReport(principal(counterpartTenantIds[0]), subjectMessages[0]!.id, {
      category: "INAPPROPRIATE_CONTENT",
      details: "Repeated solicitation."
    }),
    safetyService.createMessageReport(principal(counterpartTenantIds[1]), subjectMessages[1]!.id, {
      category: "INAPPROPRIATE_CONTENT",
      details: "Repeated solicitation."
    }),
    safetyService.createMessageReport(principal(counterpartTenantIds[2]), subjectMessages[2]!.id, {
      category: "INAPPROPRIATE_CONTENT",
      details: "Repeated solicitation."
    })
  ]);
  await Promise.all(
    interestIds.map((interestId, index) =>
      safetyService.blockInterest(principal(counterpartTenantIds[index]!), interestId)
    )
  );

  const evaluationTime = new Date();
  riskAccountCreatedAt.set(subjectTenantId, new Date(evaluationTime.getTime() - 60_000).toISOString());
  const riskConfig = Object.freeze({
    ...defaultRoommateRiskConfig,
    repeatedMessageCounterpartThreshold: 3,
    rapidInterestCountThreshold: 3,
    highMessageCountThreshold: 4,
    highMessageThreadThreshold: 2,
    solicitationCounterpartThreshold: 2,
    reportCountThreshold: 3,
    reporterCountThreshold: 2,
    currentBlockerThreshold: 3,
    activityRowLimit: 20,
    reportBatchSize: 2
  });
  const riskService = createRoommateSafetyService({
    roommateRepository,
    safetyRepository,
    identityAccountClient,
    riskConfig,
    now: () => evaluationTime,
    transactionRunner: { run: transaction }
  });
  const before = await queryOne<{
    message_count: string;
    interest_count: string;
    report_count: string;
    block_count: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM roommate_messages WHERE sender_tenant_id = $1) AS message_count,
       (SELECT count(*)::text FROM roommate_interests WHERE interested_tenant_id = $1) AS interest_count,
       (SELECT count(*)::text FROM contact_reports WHERE source = 'ROOMMATE' AND status IN ('OPEN', 'INVESTIGATING')
          AND reporter_id = ANY($2::integer[])) AS report_count,
       (SELECT count(*)::text FROM contact_blocks WHERE blocked_id = $1 AND roommate_request_id IS NOT NULL) AS block_count`,
    [subjectTenantId, [...counterpartTenantIds]]
  );
  const page = await riskService.listAdminReports(admin, {
    source: "ROOMMATE",
    status: "OPEN",
    category: "INAPPROPRIATE_CONTENT",
    page: 1,
    pageSize: 20,
    offset: 0,
    reviewPriority: null
  });
  assert.equal(page.data.length, 3);
  const summary = page.data[0]!.riskSummary;
  assert.deepEqual(
    summary.flags.map((flag) => flag.code),
    [
      "REPEATED_MESSAGE_ACROSS_THREADS",
      "RAPID_INTEREST_ACTIVITY",
      "HIGH_MESSAGE_VOLUME",
      "REPEATED_EXTERNAL_CONTACT_SOLICITATION",
      "REPEATED_REPORT_PATTERN",
      "MULTIPLE_CURRENT_BLOCKERS",
      "NEW_ACCOUNT_WITH_UNUSUAL_ACTIVITY"
    ]
  );
  assert.equal(summary.reviewPriority, "ELEVATED");
  assert.equal(summary.partialEvaluation, false);
  assert.equal(
    summary.flags.every((flag) => JSON.stringify(flag).includes("body") === false),
    true
  );
  assert.equal(
    (summary.flags.find((flag) => flag.code === "REPEATED_MESSAGE_ACROSS_THREADS")?.evidenceSummary.messageIds ?? [])
      .length <= 20,
    true
  );
  assert.equal(
    (summary.flags.find((flag) => flag.code === "RAPID_INTEREST_ACTIVITY")?.evidenceSummary.interestIds ?? []).length <=
      20,
    true
  );
  assert.equal(
    (summary.flags.find((flag) => flag.code === "REPEATED_REPORT_PATTERN")?.evidenceSummary.reportIds ?? []).length <=
      20,
    true
  );

  const after = await queryOne<typeof before>(
    `SELECT
       (SELECT count(*)::text FROM roommate_messages WHERE sender_tenant_id = $1) AS message_count,
       (SELECT count(*)::text FROM roommate_interests WHERE interested_tenant_id = $1) AS interest_count,
       (SELECT count(*)::text FROM contact_reports WHERE source = 'ROOMMATE' AND status IN ('OPEN', 'INVESTIGATING')
          AND reporter_id = ANY($2::integer[])) AS report_count,
       (SELECT count(*)::text FROM contact_blocks WHERE blocked_id = $1 AND roommate_request_id IS NOT NULL) AS block_count`,
    [subjectTenantId, [...counterpartTenantIds]]
  );
  assert.deepEqual(after, before);
});
