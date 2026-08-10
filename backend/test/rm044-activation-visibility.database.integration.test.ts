import dotenv from "dotenv";
import path from "node:path";
import type { Express } from "express";
import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { closeDatabasePool } from "../src/db/pool.js";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
import { createFavoriteRepository } from "../src/modules/favorites/favorite-repository.js";
import { createAdminListingReadRepository } from "../src/modules/listings/admin-listing-read-repository.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createModerationActionService } from "../src/modules/listings/moderation-action-service.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import { createPublicListingDetailRepository } from "../src/modules/listings/public-listing-detail-repository.js";
import { createPublicListingSearchRepository } from "../src/modules/listings/public-listing-search-repository.js";
import { validatePublicListingSearch } from "../src/modules/listings/public-listing-search-validation.js";
import { createAdminUserRepository } from "../src/modules/users/admin-user-repository.js";
import { createAdminUserService } from "../src/modules/users/admin-user-service.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const origin = "http://localhost:3000";
const secret = "rm044-activation-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const pool = createTestDatabasePool(process.env, { max: 8 });
const executor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
const allStatuses = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const;
let application: Express;
let sequence = 0;

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

interface ActivationTrace {
  pid: number;
  lockPid: number;
  updatePid: number;
  updates: number;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function cleanSchema(): Promise<void> {
  for (const table of [
    "moderation_history",
    "favorites",
    "listing_amenities",
    "listing_images",
    "listings",
    "amenities",
    "property_types",
    "users"
  ]) {
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
  }
  await pool.query("DROP TYPE IF EXISTS listing_status");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

async function resetRows(): Promise<void> {
  await pool.query("DELETE FROM moderation_history");
  await pool.query("DELETE FROM favorites");
  await pool.query("DELETE FROM listing_amenities");
  await pool.query("DELETE FROM listing_images");
  await pool.query("DELETE FROM listings");
  await pool.query("DELETE FROM users");
}

async function insertUser(role: UserRole, active = true, timestamp = "2020-01-01T00:00:00Z"): Promise<number> {
  sequence += 1;
  return (
    await pool.query<{ id: number }>({
      text: `INSERT INTO users (role,email,phone_e164,password_hash,is_active,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
      values: [
        role,
        `rm044.activation.${role.toLowerCase()}.${sequence}@example.com`,
        role === "LANDLORD" ? `+8492${String(sequence).padStart(8, "0")}` : null,
        `PASSWORD_HASH_RM044_${sequence}`,
        active,
        timestamp
      ]
    })
  ).rows[0]!.id;
}

async function insertListing(landlordId: number, status: ListingStatus): Promise<number> {
  sequence += 1;
  return (
    await pool.query<{ id: number }>({
      text: `INSERT INTO listings
        (landlord_id,property_type_id,status,title,description,monthly_rent,room_area_sqm,address_text,area_name,latitude,longitude,created_at,updated_at)
        VALUES ($1,(SELECT id FROM property_types WHERE code='STUDIO'),$2,$3,'Description',5000000,25,'Private address','District 1',10.75,106.67,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z') RETURNING id`,
      values: [landlordId, status, `RM-044 activation listing ${sequence}`]
    })
  ).rows[0]!.id;
}

async function insertImage(listingId: number): Promise<void> {
  await pool.query(
    "INSERT INTO listing_images (listing_id,cloudinary_public_id,secure_url,format,width,height,byte_size,display_order) VALUES ($1,$2,$3,'webp',800,600,1000,1)",
    [listingId, `rm044-${listingId}`, `https://cdn.example.test/rm044-${listingId}.webp`]
  );
}

function standardTransactionRunner(): TransactionRunner {
  return async (operation) => withTransaction(pool, logger, operation);
}

function adminService(counter?: { updates: number }, runner: TransactionRunner = standardTransactionRunner()) {
  const transactionRepositoryFactory = counter
    ? (transaction: SqlExecutor) =>
        createAdminUserRepository({
          async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
            if (/^\s*UPDATE users\b/i.test(query.text)) counter.updates += 1;
            return transaction.query<Row>(query);
          }
        })
    : undefined;
  return createAdminUserService({
    repository: createAdminUserRepository(executor),
    transactionRunner: runner,
    transactionRepositoryFactory
  });
}

function moderationService() {
  return createModerationActionService({ transactionRunner: standardTransactionRunner() });
}

async function token(userId: number, role: UserRole): Promise<string> {
  const signed = await createSessionTokenService({ secret, nowSeconds: () => seconds }).sign({ userId, role });
  return `rentmate_session=${signed}`;
}

async function storedUser(userId: number) {
  return (
    await pool.query<{
      id: number;
      role: UserRole;
      email: string;
      phone_e164: string | null;
      password_hash: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>("SELECT id,role,email,phone_e164,password_hash,is_active,created_at,updated_at FROM users WHERE id=$1", [userId])
  ).rows[0]!;
}

async function listingSnapshots(landlordId: number) {
  return (
    await pool.query<{ id: number; status: ListingStatus; updated_at: Date }>(
      "SELECT id,status,updated_at FROM listings WHERE landlord_id=$1 ORDER BY id",
      [landlordId]
    )
  ).rows;
}

async function backendPid(transaction: SqlExecutor): Promise<number> {
  return (await transaction.query<{ pid: number }>({ text: "SELECT pg_backend_pid()::integer AS pid", values: [] }))
    .rows[0]!.pid;
}

function ids(responseBody: unknown): number[] {
  const body = responseBody as { data?: readonly { id: number }[] };
  return body.data?.map((item) => item.id) ?? [];
}

beforeAll(async () => {
  await cleanSchema();
  await executeMigrationPlan(pool, createMigrationPlan("clean", await discoverMigrations(migrationDirectory)));
  application = await createBackendApp({
    frontendOrigin: origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds,
    transactionRunner: standardTransactionRunner()
  });
});
beforeEach(resetRows);
afterAll(async () => {
  await cleanSchema();
  await closeDatabasePool(pool);
});

describe("RM-044 PostgreSQL activation and visibility acceptance", () => {
  it.each(["TENANT", "LANDLORD"] as const)(
    "proves the four-state %s activation matrix and write allowlist",
    async (role) => {
      const adminId = await insertUser("ADMIN");
      for (const initial of [true, false]) {
        for (const desired of [true, false]) {
          const targetId = await insertUser(role, initial);
          const before = await storedUser(targetId);
          const userCountBefore = (await pool.query("SELECT 1 FROM users")).rowCount;
          const counter = { updates: 0 };
          const returned = await adminService(counter).setActivation({ userId: adminId, role: "ADMIN" }, targetId, {
            isActive: desired
          });
          const after = await storedUser(targetId);
          expect(returned).toMatchObject({ id: targetId, role, isActive: desired });
          expect(after.is_active).toBe(desired);
          expect((await pool.query("SELECT 1 FROM users")).rowCount).toBe(userCountBefore);
          if (initial === desired) {
            expect(after).toStrictEqual(before);
            expect(counter.updates).toBe(0);
          } else {
            expect({ ...after, is_active: before.is_active, updated_at: before.updated_at }).toStrictEqual(before);
            expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
            expect(counter.updates).toBe(1);
          }
        }
      }
    }
  );

  it("protects ADMIN targets for both desired values, including self, and distinguishes missing targets", async () => {
    const callerId = await insertUser("ADMIN", true);
    const otherAdminId = await insertUser("ADMIN", false);
    await expect(
      adminService().setActivation({ userId: callerId, role: "ADMIN" }, 2_147_483_647, { isActive: false })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    for (const targetId of [callerId, otherAdminId]) {
      for (const desired of [true, false]) {
        const before = await storedUser(targetId);
        const counter = { updates: 0 };
        await expect(
          adminService(counter).setActivation({ userId: callerId, role: "ADMIN" }, targetId, { isActive: desired })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(await storedUser(targetId)).toStrictEqual(before);
        expect(counter.updates).toBe(0);
      }
    }
  });

  it("keeps repeated no-op activation exactly idempotent", async () => {
    const adminId = await insertUser("ADMIN");
    const targetId = await insertUser("TENANT", true);
    const counter = { updates: 0 };
    const service = adminService(counter);
    await service.setActivation({ userId: adminId, role: "ADMIN" }, targetId, { isActive: false });
    const afterMeaningful = await storedUser(targetId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        service.setActivation({ userId: adminId, role: "ADMIN" }, targetId, { isActive: false })
      ).resolves.toMatchObject({ isActive: false });
      expect(await storedUser(targetId)).toStrictEqual(afterMeaningful);
    }
    expect(counter.updates).toBe(1);
  });

  it.each([
    { label: "same false/false", followerDesired: false, expectedFinal: false, expectedUpdates: 1 },
    { label: "opposite false/true", followerDesired: true, expectedFinal: true, expectedUpdates: 2 }
  ] as const)("serializes $label activation deterministically without 409", async (testCase) => {
    const adminId = await insertUser("ADMIN");
    const targetId = await insertUser("LANDLORD", true);
    const leaderLocked = deferred();
    const followerBeforeLock = deferred();
    const releaseLeader = deferred();
    const leaderTrace: ActivationTrace = { pid: 0, lockPid: 0, updatePid: 0, updates: 0 };
    const followerTrace: ActivationTrace = { pid: 0, lockPid: 0, updatePid: 0, updates: 0 };

    function runner(side: "leader" | "follower", trace: ActivationTrace): TransactionRunner {
      return async (operation) =>
        withTransaction(pool, logger, async (transaction) => {
          trace.pid = await backendPid(transaction);
          const instrumented: SqlExecutor = {
            async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
              if (query.text.includes("FROM users") && query.text.includes("FOR UPDATE")) {
                trace.lockPid = await backendPid(transaction);
                if (side === "follower") {
                  followerBeforeLock.resolve();
                  return transaction.query<Row>(query);
                }
                const locked = await transaction.query<Row>(query);
                leaderLocked.resolve();
                await releaseLeader.promise;
                return locked;
              }
              if (/^\s*UPDATE users\b/i.test(query.text)) {
                trace.updatePid = await backendPid(transaction);
                trace.updates += 1;
              }
              return transaction.query<Row>(query);
            }
          };
          return operation(instrumented);
        });
    }

    const principal = { userId: adminId, role: "ADMIN" as const };
    const leaderService = adminService(undefined, runner("leader", leaderTrace));
    const followerService = adminService(undefined, runner("follower", followerTrace));
    const leader = leaderService.setActivation(principal, targetId, { isActive: false });
    let follower: ReturnType<typeof followerService.setActivation> | null = null;
    try {
      await leaderLocked.promise;
      follower = followerService.setActivation(principal, targetId, { isActive: testCase.followerDesired });
      await followerBeforeLock.promise;
      await vi.waitFor(
        async () => {
          const blockers = await pool.query<{ blockers: number[] }>(
            "SELECT pg_blocking_pids($1::integer) AS blockers",
            [followerTrace.pid]
          );
          expect(blockers.rows[0]!.blockers).toContain(leaderTrace.pid);
        },
        { timeout: 5_000, interval: 20 }
      );
    } finally {
      releaseLeader.resolve();
    }
    if (follower === null) throw new Error("Follower did not reach the activation row lock.");
    await expect(leader).resolves.toMatchObject({ isActive: false });
    await expect(follower).resolves.toMatchObject({ isActive: testCase.followerDesired });
    expect((await storedUser(targetId)).is_active).toBe(testCase.expectedFinal);
    expect(leaderTrace.updates + followerTrace.updates).toBe(testCase.expectedUpdates);
    expect(leaderTrace.pid).not.toBe(followerTrace.pid);
    expect(leaderTrace.lockPid).toBe(leaderTrace.pid);
    expect(leaderTrace.updatePid).toBe(leaderTrace.pid);
    expect(followerTrace.lockPid).toBe(followerTrace.pid);
    if (testCase.followerDesired) expect(followerTrace.updatePid).toBe(followerTrace.pid);
    else expect(followerTrace.updatePid).toBe(0);
  });

  it.each([
    { role: "TENANT", path: "/api/v1/users/me" },
    { role: "LANDLORD", path: "/api/v1/landlord/listings" }
  ] as const)(
    "enforces current activity for an existing $role JWT and restores the same JWT",
    async ({ role, path }) => {
      const adminId = await insertUser("ADMIN");
      const targetId = await insertUser(role, true);
      const existingCookie = await token(targetId, role);
      await request(application).get(path).set("Cookie", existingCookie).expect(200);
      await adminService().setActivation({ userId: adminId, role: "ADMIN" }, targetId, { isActive: false });
      await request(application).get(path).set("Cookie", existingCookie).expect(401);
      await adminService().setActivation({ userId: adminId, role: "ADMIN" }, targetId, { isActive: true });
      await request(application).get(path).set("Cookie", existingCookie).expect(200);
    }
  );

  it("derives landlord public/favorite visibility while preserving every listing, history, and favorite row", async () => {
    const adminId = await insertUser("ADMIN");
    const landlordId = await insertUser("LANDLORD", true);
    const tenantId = await insertUser("TENANT", true);
    const listingIds = await Promise.all(allStatuses.map((status) => insertListing(landlordId, status)));
    const approvedId = listingIds[2]!;
    await insertImage(approvedId);
    await pool.query("INSERT INTO favorites (tenant_id,listing_id) VALUES ($1,$2)", [tenantId, approvedId]);
    const listingBefore = await listingSnapshots(landlordId);
    const favoriteBefore = await pool.query(
      "SELECT tenant_id,listing_id,created_at FROM favorites ORDER BY tenant_id,listing_id"
    );
    const historyBefore = await pool.query("SELECT * FROM moderation_history ORDER BY id");
    const adminCookie = await token(adminId, "ADMIN");
    const tenantCookie = await token(tenantId, "TENANT");

    expect(ids((await request(application).get("/api/v1/listings").expect(200)).body)).toContain(approvedId);
    await request(application).get(`/api/v1/listings/${approvedId}`).expect(200);
    expect(
      ids((await request(application).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(200)).body)
    ).toContain(approvedId);
    await request(application).get(`/api/v1/admin/listings/${approvedId}`).set("Cookie", adminCookie).expect(200);

    await request(application)
      .patch(`/api/v1/admin/users/${landlordId}/activation`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ isActive: false })
      .expect(200);
    expect(ids((await request(application).get("/api/v1/listings").expect(200)).body)).not.toContain(approvedId);
    await request(application).get(`/api/v1/listings/${approvedId}`).expect(404);
    expect(
      ids((await request(application).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(200)).body)
    ).not.toContain(approvedId);
    const queue = await request(application)
      .get("/api/v1/admin/listings?status=APPROVED")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(ids(queue.body)).toContain(approvedId);
    expect(queue.body.data.find((item: { id: number }) => item.id === approvedId).landlord.isActive).toBe(false);
    await request(application)
      .get(`/api/v1/admin/listings/${approvedId}`)
      .set("Cookie", adminCookie)
      .expect(200)
      .expect(({ body }) => expect(body.data.landlord.isActive).toBe(false));
    expect(await listingSnapshots(landlordId)).toStrictEqual(listingBefore);
    expect(
      await pool.query("SELECT tenant_id,listing_id,created_at FROM favorites ORDER BY tenant_id,listing_id")
    ).toStrictEqual(favoriteBefore);
    expect(await pool.query("SELECT * FROM moderation_history ORDER BY id")).toStrictEqual(historyBefore);

    await request(application)
      .patch(`/api/v1/admin/users/${landlordId}/activation`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ isActive: true })
      .expect(200);
    expect(ids((await request(application).get("/api/v1/listings").expect(200)).body)).toContain(approvedId);
    await request(application).get(`/api/v1/listings/${approvedId}`).expect(200);
    expect(
      ids((await request(application).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(200)).body)
    ).toContain(approvedId);
    expect(await listingSnapshots(landlordId)).toStrictEqual(listingBefore);
    expect(
      (await pool.query("SELECT 1 FROM favorites WHERE tenant_id=$1 AND listing_id=$2", [tenantId, approvedId]))
        .rowCount
    ).toBe(1);
    expect((await pool.query("SELECT 1 FROM moderation_history")).rowCount).toBe(0);
  });

  it("suppresses and restores public/favorite visibility through HIDE/RESTORE with append-only history", async () => {
    const adminId = await insertUser("ADMIN");
    const landlordId = await insertUser("LANDLORD", true);
    const tenantId = await insertUser("TENANT", true);
    const listingId = await insertListing(landlordId, "APPROVED");
    await insertImage(listingId);
    await pool.query("INSERT INTO favorites (tenant_id,listing_id) VALUES ($1,$2)", [tenantId, listingId]);
    const tenantCookie = await token(tenantId, "TENANT");
    const principal = { userId: adminId, role: "ADMIN" as const };
    const listingTimestamp = (await listingSnapshots(landlordId))[0]!.updated_at;

    await moderationService().moderateListing(principal, listingId, { action: "HIDE", reason: "H1" });
    expect(ids((await request(application).get("/api/v1/listings").expect(200)).body)).not.toContain(listingId);
    await request(application).get(`/api/v1/listings/${listingId}`).expect(404);
    expect(
      ids((await request(application).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(200)).body)
    ).not.toContain(listingId);
    expect(
      (await pool.query("SELECT 1 FROM favorites WHERE tenant_id=$1 AND listing_id=$2", [tenantId, listingId])).rowCount
    ).toBe(1);

    await moderationService().moderateListing(principal, listingId, { action: "RESTORE", reason: "R1" });
    expect(ids((await request(application).get("/api/v1/listings").expect(200)).body)).toContain(listingId);
    await request(application).get(`/api/v1/listings/${listingId}`).expect(200);
    expect(
      ids((await request(application).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(200)).body)
    ).toContain(listingId);
    const history = (
      await pool.query<{ previous_status: string; new_status: string; reason: string | null }>(
        "SELECT previous_status,new_status,reason FROM moderation_history WHERE listing_id=$1 ORDER BY id",
        [listingId]
      )
    ).rows;
    expect(history).toStrictEqual([
      { previous_status: "APPROVED", new_status: "HIDDEN", reason: "H1" },
      { previous_status: "HIDDEN", new_status: "APPROVED", reason: "R1" }
    ]);
    expect((await listingSnapshots(landlordId))[0]!.updated_at.getTime()).toBeGreaterThan(listingTimestamp.getTime());
    expect(
      (await pool.query("SELECT 1 FROM favorites WHERE tenant_id=$1 AND listing_id=$2", [tenantId, listingId])).rowCount
    ).toBe(1);
  });

  it("proves the combined visibility predicate is APPROVED plus active landlord", async () => {
    const detailRepository = createPublicListingDetailRepository(executor);
    const cases = [
      { status: "APPROVED", landlordActive: true, visible: true },
      { status: "APPROVED", landlordActive: false, visible: false },
      { status: "HIDDEN", landlordActive: true, visible: false },
      { status: "HIDDEN", landlordActive: false, visible: false },
      { status: "REJECTED", landlordActive: true, visible: false },
      { status: "PENDING", landlordActive: true, visible: false }
    ] as const;
    for (const testCase of cases) {
      const landlordId = await insertUser("LANDLORD", testCase.landlordActive);
      const listingId = await insertListing(landlordId, testCase.status);
      if (testCase.visible) await insertImage(listingId);
      expect((await detailRepository.findPublicDetailById(listingId, false)) !== null).toBe(testCase.visible);
    }
  });

  it("retains tenant favorites through deactivation and restores the same-JWT collection", async () => {
    const adminId = await insertUser("ADMIN");
    const tenantId = await insertUser("TENANT", true);
    const listingId = await insertListing(await insertUser("LANDLORD", true), "APPROVED");
    await insertImage(listingId);
    await pool.query("INSERT INTO favorites (tenant_id,listing_id) VALUES ($1,$2)", [tenantId, listingId]);
    const tenantCookie = await token(tenantId, "TENANT");
    await request(application).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(200);
    await adminService().setActivation({ userId: adminId, role: "ADMIN" }, tenantId, { isActive: false });
    await request(application).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(401);
    expect(
      (await pool.query("SELECT 1 FROM favorites WHERE tenant_id=$1 AND listing_id=$2", [tenantId, listingId])).rowCount
    ).toBe(1);
    await adminService().setActivation({ userId: adminId, role: "ADMIN" }, tenantId, { isActive: true });
    expect(
      ids((await request(application).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(200)).body)
    ).toContain(listingId);
    expect(
      (await pool.query("SELECT 1 FROM favorites WHERE tenant_id=$1 AND listing_id=$2", [tenantId, listingId])).rowCount
    ).toBe(1);
  });

  it("retains representative V1-30 ordering, filters, limit-plus-one, and exact password-free profiles", async () => {
    const oldestTenant = await insertUser("TENANT", true, "2020-01-01T00:00:00Z");
    const tiedLandlord = await insertUser("LANDLORD", false, "2020-01-02T00:00:00Z");
    const tiedAdmin = await insertUser("ADMIN", true, "2020-01-02T00:00:00Z");
    const newestAdmin = await insertUser("ADMIN", false, "2020-01-03T00:00:00Z");
    const calls: ParameterizedQuery[] = [];
    const counting: SqlExecutor = {
      async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
        calls.push(query);
        return executor.query<Row>(query);
      }
    };
    const repository = createAdminUserRepository(counting);
    const all = await repository.findUserPage({ role: null, isActive: null, limit: 10, offset: 0 });
    expect(all.map((user) => user.id)).toStrictEqual([newestAdmin, tiedAdmin, tiedLandlord, oldestTenant]);
    expect(all.map((user) => [user.role, user.isActive])).toStrictEqual([
      ["ADMIN", false],
      ["ADMIN", true],
      ["LANDLORD", false],
      ["TENANT", true]
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).not.toMatch(/COUNT\s*\(/i);
    expect(Object.keys(all[0]!).sort()).toStrictEqual(
      ["id", "role", "email", "phone", "isActive", "createdAt", "updatedAt"].sort()
    );
    expect(JSON.stringify(all)).not.toMatch(/password|hash|phone_e164|is_active/);
    await expect(
      repository.findUserPage({ role: "LANDLORD", isActive: false, limit: 2, offset: 0 })
    ).resolves.toMatchObject([{ id: tiedLandlord, role: "LANDLORD", isActive: false }]);
  });

  it("keeps admin reads available for all six statuses independent of landlord activity", async () => {
    const landlordId = await insertUser("LANDLORD", false);
    const repository = createAdminListingReadRepository(executor);
    for (const status of allStatuses) {
      const listingId = await insertListing(landlordId, status);
      const detail = await repository.findListingDetailBase(listingId);
      expect(detail).toMatchObject({
        listing: {
          id: listingId,
          status,
          addressText: "Private address",
          latitude: 10.75,
          longitude: 106.67
        },
        landlord: { id: landlordId, isActive: false }
      });
    }
  });

  it("uses the same public predicate for search, detail, and favorites repositories", async () => {
    const landlordId = await insertUser("LANDLORD", true);
    const tenantId = await insertUser("TENANT", true);
    const listingId = await insertListing(landlordId, "APPROVED");
    await insertImage(listingId);
    await pool.query("INSERT INTO favorites (tenant_id,listing_id) VALUES ($1,$2)", [tenantId, listingId]);
    const search = validatePublicListingSearch({});
    if (search.mode !== "ordinary") throw new Error("Expected ordinary public search.");
    await expect(createPublicListingSearchRepository(executor).findOrdinaryPage(search)).resolves.toHaveLength(1);
    await expect(
      createPublicListingDetailRepository(executor).findPublicDetailById(listingId, false)
    ).resolves.not.toBeNull();
    await expect(
      createFavoriteRepository(executor).findPage({ tenantId, pageSize: 20, offset: 0 })
    ).resolves.toHaveLength(1);
  });
});
