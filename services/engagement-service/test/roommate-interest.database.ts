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
import { createRoommateRepository } from "../src/modules/roommate/repositories/roommate-repository.js";
import { createRoommateService } from "../src/modules/roommate/services/roommate-service.js";
import type { IdentityRoommateTenantProjection } from "../../shared/identity-account-client.js";
import type { PublicListingSummary } from "../../shared/public-listing-summary.js";

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
    max: 12,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  },
  { debug() {}, info() {}, warn() {}, error() {} }
);

const schemaName = `roommate_interest_${process.pid}`;
const quotedSchema = `"${schemaName}"`;
const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrationRunner = createMigrationRunner("Engagement");
const repository = createRoommateRepository();

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
const identityAccountClient = {
  async loadRoommateTenantProjectionsByIds(
    ids: readonly number[]
  ): Promise<readonly IdentityRoommateTenantProjection[]> {
    return ids
      .map((id) => principals.get(id))
      .filter((projection): projection is IdentityRoommateTenantProjection => projection !== undefined);
  }
};
const publicListings = new Map<number, PublicListingSummary>();
const listingCatalogClient = {
  async loadPublicSummariesByIds(ids: readonly number[]): Promise<readonly PublicListingSummary[]> {
    return ids.flatMap((id) => {
      const listing = publicListings.get(id);
      return listing === undefined ? [] : [listing];
    });
  }
};
const service = createRoommateService({
  repository,
  identityAccountClient,
  listingCatalogClient,
  transactionRunner: { run: transaction }
});

const profileInput = {
  intro: "A complete roommate profile for concurrency integration.",
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
}

async function createProfile(tenantId: number): Promise<void> {
  registerTenant(tenantId);
  await transaction((executor) => repository.upsertProfile(executor, tenantId, profileInput));
}

function principal(tenantId: number) {
  return { userId: tenantId, role: "TENANT" as const };
}

function requestInput() {
  return {
    listingId: null,
    preferredAreaKeys: ["Quan 1"],
    budgetMinPerPerson: 1_000_000,
    budgetMaxPerPerson: 2_000_000,
    moveInFrom: "2026-09-01",
    moveInUntil: "2026-09-30",
    note: null
  } as const;
}

function registerListing(listingId: number): void {
  publicListings.set(listingId, {
    id: listingId,
    businessStatus: "AVAILABLE",
    title: "Roommate listing",
    monthlyRent: 4_000_000,
    roomAreaSqm: 24,
    maxOccupants: 2,
    areaName: "Quan 1",
    latitude: 10.77,
    longitude: 106.7,
    propertyType: { code: "ROOM", label: "Room" },
    amenities: [],
    coverImage: { url: "https://example.test/room.jpg", altText: null, displayOrder: 1 },
    updatedAt: "2026-08-27T00:00:00.000Z"
  });
}

async function createRequest(ownerTenantId: number): Promise<number> {
  const request = await service.createRequest(principal(ownerTenantId), requestInput());
  return request.id;
}

async function createInterest(requestId: number, tenantId: number): Promise<number> {
  const interest = await service.createInterest(principal(tenantId), requestId, {
    message: `Hello from tenant ${tenantId}.`
  });
  return interest.id;
}

async function queryOne<T extends Record<string, unknown>>(text: string, values: readonly unknown[]): Promise<T> {
  return transaction(async (executor) => {
    const result = await executor.query<T>({ text, values });
    assert.equal(result.rows.length, 1);
    return result.rows[0]!;
  });
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

test("serializes two accepts on one request and cleans competing interests", async () => {
  await Promise.all([createProfile(1001), createProfile(1002), createProfile(1003)]);
  const requestId = await createRequest(1001);
  const interestB = await createInterest(requestId, 1002);
  const interestC = await createInterest(requestId, 1003);

  const outcomes = await Promise.allSettled([
    service.acceptInterest(principal(1001), interestB),
    service.acceptInterest(principal(1001), interestC)
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  const state = await queryOne<{ status: string }>("SELECT status FROM roommate_requests WHERE id = $1", [requestId]);
  assert.equal(state.status, "MATCHED");
  const interests = await transaction((executor) =>
    executor.query<{ status: string }>({
      text: "SELECT status FROM roommate_interests WHERE request_id = $1 ORDER BY id",
      values: [requestId]
    })
  );
  assert.deepEqual(interests.rows.map((row) => row.status).sort(), ["ACCEPTED", "REJECTED"]);
});

test("serializes accepts targeting the same candidate across roles", async () => {
  await Promise.all([createProfile(1011), createProfile(1012), createProfile(1013)]);
  const requestA = await createRequest(1011);
  const requestB = await createRequest(1012);
  const interestA = await createInterest(requestA, 1013);
  const interestB = await createInterest(requestB, 1013);
  const outcomes = await Promise.allSettled([
    service.acceptInterest(principal(1011), interestA),
    service.acceptInterest(principal(1012), interestB)
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  assert.equal(
    rejected && rejected.status === "rejected" && typeof rejected.reason === "object" && rejected.reason !== null
      ? (rejected.reason as { readonly code?: unknown }).code
      : undefined,
    "ROOMMATE_ACTIVE_CONNECTION_EXISTS"
  );
  const accepted = await transaction((executor) =>
    executor.query<{ count: string }>({
      text: "SELECT count(*)::text AS count FROM roommate_interests WHERE interested_tenant_id = $1 AND status = 'ACCEPTED'",
      values: [1013]
    })
  );
  assert.equal(Number(accepted.rows[0]?.count), 1);
});

test("cross-accept uses deterministic lock ordering and allows one connection", async () => {
  await Promise.all([createProfile(1021), createProfile(1022)]);
  const requestA = await createRequest(1021);
  const requestB = await createRequest(1022);
  const interestA = await createInterest(requestA, 1022);
  const interestB = await createInterest(requestB, 1021);
  const outcomes = await Promise.allSettled([
    service.acceptInterest(principal(1021), interestA),
    service.acceptInterest(principal(1022), interestB)
  ]);
  assert.ok(outcomes.filter((outcome) => outcome.status === "fulfilled").length <= 1);
  const accepted = await transaction((executor) =>
    executor.query<{ count: string }>({
      text: "SELECT count(*)::text AS count FROM roommate_interests WHERE status = 'ACCEPTED' AND (interested_tenant_id = ANY($1::integer[]) OR request_id = ANY($2::integer[]))",
      values: [
        [1021, 1022],
        [requestA, requestB]
      ]
    })
  );
  assert.ok(Number(accepted.rows[0]?.count) <= 1);
});

test("duplicate concurrent interest creates leave one active interest and one message", async () => {
  await Promise.all([createProfile(1031), createProfile(1032)]);
  const requestId = await createRequest(1031);
  const outcomes = await Promise.allSettled([
    service.createInterest(principal(1032), requestId, { message: "First concurrent message." }),
    service.createInterest(principal(1032), requestId, { message: "Second concurrent message." })
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const counts = await queryOne<{ interests: string; messages: string }>(
    `SELECT
       (SELECT count(*)::text FROM roommate_interests WHERE request_id = $1 AND status IN ('PENDING', 'ACCEPTED')) AS interests,
       (SELECT count(*)::text FROM roommate_messages WHERE interest_id IN (SELECT id FROM roommate_interests WHERE request_id = $1)) AS messages`,
    [requestId]
  );
  assert.equal(Number(counts.interests), 1);
  assert.equal(Number(counts.messages), 1);
});

test("creates one interest and one first message for arbitrary free-text messages", async () => {
  await Promise.all([createProfile(1039), createProfile(1040), createProfile(1043), createProfile(1044)]);
  const keywordRequestId = await createRequest(1039);
  const plainRequestId = await createRequest(1043);
  const keywordMessage = "mình quan tâm, bạn có thể trao đổi thêm không?";
  const plainMessage = "Bạn dự định chuyển vào khi nào?";

  const keywordInterest = await service.createInterest(principal(1040), keywordRequestId, {
    message: keywordMessage
  });
  const plainInterest = await service.createInterest(principal(1044), plainRequestId, {
    message: plainMessage
  });

  assert.equal(keywordInterest.initialMessage?.body, keywordMessage);
  assert.equal(plainInterest.initialMessage?.body, plainMessage);
  const counts = await transaction((executor) =>
    executor.query<{ id: number; message_count: string }>({
      text: `SELECT i.id, count(m.id)::text AS message_count
        FROM roommate_interests i
        LEFT JOIN roommate_messages m ON m.interest_id = i.id
        WHERE i.id = ANY($1::integer[])
        GROUP BY i.id
        ORDER BY i.id`,
      values: [[keywordInterest.id, plainInterest.id]]
    })
  );
  assert.deepEqual(
    counts.rows.map((row) => ({ id: row.id, messageCount: Number(row.message_count) })),
    [
      { id: keywordInterest.id, messageCount: 1 },
      { id: plainInterest.id, messageCount: 1 }
    ]
  );
});

test("leave is serialized from both participants and never reopens the request", async () => {
  await Promise.all([createProfile(1041), createProfile(1042)]);
  const requestId = await createRequest(1041);
  const interestId = await createInterest(requestId, 1042);
  await service.acceptInterest(principal(1041), interestId);
  const outcomes = await Promise.allSettled([
    service.leaveInterest(principal(1041), interestId),
    service.leaveInterest(principal(1042), interestId)
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const state = await queryOne<{ request_status: string; interest_status: string }>(
    `SELECT r.status AS request_status, i.status AS interest_status
     FROM roommate_requests r JOIN roommate_interests i ON i.request_id = r.id WHERE i.id = $1`,
    [interestId]
  );
  assert.equal(state.request_status, "MATCHED");
  assert.equal(state.interest_status, "LEFT");
});

test("accept rejects an expired request even before scheduler materialization", async () => {
  await Promise.all([createProfile(1051), createProfile(1052)]);
  const requestId = await createRequest(1051);
  const interestId = await createInterest(requestId, 1052);
  await transaction((executor) =>
    executor.query({
      text: "UPDATE roommate_requests SET created_at = CURRENT_TIMESTAMP - INTERVAL '31 days', expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1",
      values: [requestId]
    })
  );
  await assert.rejects(
    () => service.acceptInterest(principal(1051), interestId),
    (error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error) {
        assert.equal(error.code, "ROOMMATE_REQUEST_EXPIRED");
        return true;
      }
      return false;
    }
  );
  const state = await queryOne<{ status: string; interest_status: string }>(
    `SELECT r.status, i.status AS interest_status FROM roommate_requests r JOIN roommate_interests i ON i.request_id = r.id WHERE r.id = $1`,
    [requestId]
  );
  assert.equal(state.status, "EXPIRED");
  assert.equal(state.interest_status, "REJECTED");
});

test("accept versus renew never leaves an accepted connection and open candidate request", async () => {
  await Promise.all([createProfile(1061), createProfile(1062)]);
  const targetRequestId = await createRequest(1061);
  const candidateExpiredId = await createRequest(1062);
  const interestId = await createInterest(targetRequestId, 1062);
  await transaction((executor) =>
    executor.query({
      text: "UPDATE roommate_requests SET created_at = CURRENT_TIMESTAMP - INTERVAL '31 days', expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1",
      values: [candidateExpiredId]
    })
  );
  const outcomes = await Promise.allSettled([
    service.acceptInterest(principal(1061), interestId),
    service.renewRequest(principal(1062), candidateExpiredId)
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const state = await queryOne<{ accepted: string; candidate_open: string }>(
    `SELECT
       (SELECT count(*)::text FROM roommate_interests WHERE interested_tenant_id = 1062 AND status = 'ACCEPTED') AS accepted,
       (SELECT count(*)::text FROM roommate_requests WHERE owner_tenant_id = 1062 AND status = 'OPEN') AS candidate_open`,
    []
  );
  assert.ok(Number(state.accepted) === 0 || Number(state.candidate_open) === 0);
});

test("transaction rollback removes interest and first message together", async () => {
  await Promise.all([createProfile(1071), createProfile(1072)]);
  const requestId = await createRequest(1071);
  await assert.rejects(() =>
    transaction(async (executor) => {
      await repository.createInterestWithMessage(executor, {
        requestId,
        interestedTenantId: 1072,
        message: "This transaction must roll back."
      });
      throw new Error("forced rollback");
    })
  );
  const counts = await queryOne<{ interests: string; messages: string }>(
    `SELECT
       (SELECT count(*)::text FROM roommate_interests WHERE request_id = $1) AS interests,
       (SELECT count(*)::text FROM roommate_messages WHERE interest_id IN (SELECT id FROM roommate_interests WHERE request_id = $1)) AS messages`,
    [requestId]
  );
  assert.equal(Number(counts.interests), 0);
  assert.equal(Number(counts.messages), 0);
});

test("returns participant-safe incoming/outgoing projections and a derived current connection", async () => {
  await Promise.all([createProfile(1081), createProfile(1082)]);
  const requestId = await createRequest(1081);
  const interest = await service.createInterest(principal(1082), requestId, {
    message: "A participant-safe first message."
  });
  assert.equal(interest.direction, "OUTGOING");
  assert.equal(interest.counterpart?.displayName, "Tenant 1081");
  assert.equal(interest.initialMessage?.body, "A participant-safe first message.");
  assert.equal("interestedTenantId" in interest, false);
  const incoming = await service.listIncomingInterests(principal(1081), requestId, {
    page: 1,
    pageSize: 20,
    offset: 0
  });
  assert.equal(incoming.data[0]?.direction, "INCOMING");
  const outgoing = await service.listInterests(principal(1082), {
    direction: "OUTGOING",
    status: "PENDING",
    page: 1,
    pageSize: 20,
    offset: 0
  });
  assert.equal(outgoing.data[0]?.id, interest.id);
  await service.acceptInterest(principal(1081), interest.id);
  const connection = await service.getCurrentConnection(principal(1082));
  assert.equal(connection.interestId, interest.id);
  assert.equal(connection.counterpart?.displayName, "Tenant 1081");
  await service.leaveInterest(principal(1082), interest.id);
  await assert.rejects(
    () => service.getCurrentConnection(principal(1082)),
    (error: unknown) => {
      return typeof error === "object" && error !== null && "code" in error && error.code === "RESOURCE_NOT_FOUND";
    }
  );
});

test("enforces ownership for reject/withdraw and the five-interest pending cap", async () => {
  await Promise.all([
    createProfile(1091),
    createProfile(1092),
    createProfile(1093),
    createProfile(1094),
    createProfile(1095),
    createProfile(1096),
    createProfile(1097),
    createProfile(1098),
    createProfile(1099)
  ]);
  const requestIds = await Promise.all([1091, 1093, 1094, 1095, 1096, 1097, 1098].map((owner) => createRequest(owner)));
  const firstInterest = await createInterest(requestIds[0]!, 1092);
  await assert.rejects(
    () => service.rejectInterest(principal(1092), firstInterest),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "RESOURCE_NOT_FOUND"
  );
  await service.rejectInterest(principal(1091), firstInterest);
  const secondInterest = await createInterest(requestIds[1]!, 1092);
  await service.withdrawInterest(principal(1092), secondInterest);
  await Promise.all(requestIds.slice(2).map((requestId) => createInterest(requestId!, 1092)));
  const sixthRequest = await createRequest(1099);
  await assert.rejects(
    () => service.createInterest(principal(1092), sixthRequest, { message: "This sixth interest should be capped." }),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "ROOMMATE_PENDING_INTEREST_LIMIT"
  );
});

test("serializes accept against linked-request unlink without partial state", async () => {
  registerListing(1101);
  await Promise.all([createProfile(1102), createProfile(1103)]);
  const linkedRequest = await service.createRequest(principal(1102), {
    ...requestInput(),
    listingId: 1101
  });
  const interestId = await createInterest(linkedRequest.id, 1103);
  const outcomes = await Promise.allSettled([
    service.acceptInterest(principal(1102), interestId),
    service.unlinkListing(principal(1102), linkedRequest.id)
  ]);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  if (rejected && rejected.status === "rejected") {
    assert.equal(
      typeof rejected.reason === "object" && rejected.reason !== null && "code" in rejected.reason
        ? rejected.reason.code
        : undefined,
      "ROOMMATE_REQUEST_NOT_OPEN"
    );
  }
  const state = await queryOne<{ status: string; listing_id: number | null }>(
    "SELECT status, listing_id FROM roommate_requests WHERE id = $1",
    [linkedRequest.id]
  );
  assert.equal(state.status, "MATCHED");
  assert.ok(state.listing_id === null || state.listing_id === 1101);
});
