import dotenv from "dotenv";
import path from "node:path";
import type { QueryResult, QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { closeDatabasePool } from "../src/db/pool.js";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
import { createCurrentModerationReasonRepository } from "../src/modules/listings/current-moderation-reason-repository.js";
import { requiresCurrentModerationReason } from "../src/modules/listings/current-moderation-reason.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createModerationActionService } from "../src/modules/listings/moderation-action-service.js";
import type { ModerationActionInput } from "../src/modules/listings/moderation-action-validation.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 4 });
const executor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
const adminPrincipal = Object.freeze({ userId: 0, role: "ADMIN" as const });
let sequence = 0;

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
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

async function insertUser(role: "ADMIN" | "LANDLORD" | "TENANT", active = true): Promise<number> {
  sequence += 1;
  const row = await pool.query<{ id: number }>({
    text: "INSERT INTO users (role,email,phone_e164,password_hash,is_active) VALUES ($1,$2,$3,'hash',$4) RETURNING id",
    values: [
      role,
      `rm042.${role.toLowerCase()}.${sequence}@example.com`,
      role === "LANDLORD" ? `+8497${String(sequence).padStart(8, "0")}` : null,
      active
    ]
  });
  return row.rows[0]!.id;
}

async function insertListing(landlordId: number, status: ListingStatus): Promise<number> {
  sequence += 1;
  const row = await pool.query<{ id: number }>({
    text: `INSERT INTO listings
      (landlord_id,property_type_id,status,title,description,monthly_rent,room_area_sqm,address_text,area_name,latitude,longitude,updated_at)
      VALUES ($1,(SELECT id FROM property_types WHERE code='STUDIO'),$2,$3,'Description',5000000,25,'Private address','District 1',10.75,106.67,'2020-01-01T00:00:00Z') RETURNING id`,
    values: [landlordId, status, `RM-042 listing ${sequence}`]
  });
  return row.rows[0]!.id;
}

function transactionRunner(): TransactionRunner {
  return async (operation) => withTransaction(pool, logger, operation);
}

function service(runner: TransactionRunner = transactionRunner()) {
  return createModerationActionService({ transactionRunner: runner });
}

async function moderate(adminId: number, listingId: number, input: ModerationActionInput) {
  return service().moderateListing({ ...adminPrincipal, userId: adminId }, listingId, input);
}

async function storedListing(listingId: number) {
  const result = await pool.query<{ status: ListingStatus; updated_at: Date }>(
    "SELECT status,updated_at FROM listings WHERE id=$1",
    [listingId]
  );
  return result.rows[0]!;
}

async function storedHistory(listingId: number) {
  return (
    await pool.query<{
      id: number;
      listing_id: number;
      admin_id: number;
      previous_status: ListingStatus;
      new_status: ListingStatus;
      reason: string | null;
      created_at: Date;
    }>(
      "SELECT id,listing_id,admin_id,previous_status,new_status,reason,created_at FROM moderation_history WHERE listing_id=$1 ORDER BY id",
      [listingId]
    )
  ).rows;
}

beforeAll(async () => {
  await cleanSchema();
  await executeMigrationPlan(pool, createMigrationPlan("clean", await discoverMigrations(migrationDirectory)));
});
beforeEach(resetRows);
afterAll(async () => {
  await cleanSchema();
  await closeDatabasePool(pool);
});

describe("RM-042 PostgreSQL atomic moderation actions", () => {
  it.each([
    ["APPROVE", "PENDING", "APPROVED", null],
    ["REJECT", "PENDING", "REJECTED", "reject reason"],
    ["HIDE", "APPROVED", "HIDDEN", "hide reason"],
    ["RESTORE", "HIDDEN", "APPROVED", "restore note"]
  ] as const)("persists %s: %s -> %s and exactly one matching history row", async (action, source, target, reason) => {
    const adminId = await insertUser("ADMIN");
    const ownerId = await insertUser("LANDLORD");
    const listingId = await insertListing(ownerId, source);
    const before = await storedListing(listingId);
    const returned = await moderate(adminId, listingId, { action, reason });
    const after = await storedListing(listingId);
    const history = await storedHistory(listingId);
    expect(after.status).toBe(target);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      listing_id: listingId,
      admin_id: adminId,
      previous_status: source,
      new_status: target,
      reason
    });
    expect(returned).toMatchObject({
      id: history[0]!.id,
      listingId,
      adminId,
      previousStatus: source,
      newStatus: target,
      reason
    });
    expect(returned.createdAt.toISOString()).toBe(history[0]!.created_at.toISOString());
  });

  it("is non-idempotent and leaves timestamp/history unchanged after repeated APPROVE", async () => {
    const adminId = await insertUser("ADMIN");
    const listingId = await insertListing(await insertUser("LANDLORD"), "PENDING");
    await moderate(adminId, listingId, { action: "APPROVE", reason: null });
    const afterSuccess = await storedListing(listingId);
    const historyAfterSuccess = await storedHistory(listingId);
    await expect(moderate(adminId, listingId, { action: "APPROVE", reason: null })).rejects.toMatchObject({
      code: "INVALID_LISTING_TRANSITION"
    });
    const afterFailure = await storedListing(listingId);
    expect(afterFailure.status).toBe("APPROVED");
    expect(afterFailure.updated_at.toISOString()).toBe(afterSuccess.updated_at.toISOString());
    expect(await storedHistory(listingId)).toStrictEqual(historyAfterSuccess);
  });

  it("moderates inactive-landlord listings while public visibility remains inactive", async () => {
    const adminId = await insertUser("ADMIN");
    const ownerId = await insertUser("LANDLORD", false);
    const listingId = await insertListing(ownerId, "PENDING");
    await moderate(adminId, listingId, { action: "APPROVE", reason: null });
    expect((await storedListing(listingId)).status).toBe("APPROVED");
    expect(
      (await pool.query<{ is_active: boolean }>("SELECT is_active FROM users WHERE id=$1", [ownerId])).rows[0]
    ).toStrictEqual({ is_active: false });
    const visible = await pool.query<{ count: number }>(
      "SELECT COUNT(*)::integer AS count FROM listings l JOIN users landlord ON landlord.id=l.landlord_id WHERE l.id=$1 AND l.status='APPROVED' AND landlord.is_active=true",
      [listingId]
    );
    expect(visible.rows[0]!.count).toBe(0);
  });

  it("derives current reject/hide reasons and retains favorites across HIDE/RESTORE", async () => {
    const adminId = await insertUser("ADMIN");
    const ownerId = await insertUser("LANDLORD");
    const tenantId = await insertUser("TENANT");
    const rejected = await insertListing(ownerId, "PENDING");
    await moderate(adminId, rejected, { action: "REJECT", reason: "reject reason" });
    await expect(
      createCurrentModerationReasonRepository(executor).findLatestReason(rejected, "REJECTED")
    ).resolves.toBe("reject reason");

    const hidden = await insertListing(ownerId, "APPROVED");
    await pool.query("INSERT INTO favorites (tenant_id,listing_id) VALUES ($1,$2)", [tenantId, hidden]);
    await moderate(adminId, hidden, { action: "HIDE", reason: "hide reason" });
    await expect(createCurrentModerationReasonRepository(executor).findLatestReason(hidden, "HIDDEN")).resolves.toBe(
      "hide reason"
    );
    expect(
      (
        await pool.query("SELECT tenant_id,listing_id FROM favorites WHERE tenant_id=$1 AND listing_id=$2", [
          tenantId,
          hidden
        ])
      ).rowCount
    ).toBe(1);
    await moderate(adminId, hidden, { action: "RESTORE", reason: null });
    expect(requiresCurrentModerationReason((await storedListing(hidden)).status)).toBe(false);
    expect(
      (await pool.query("SELECT 1 FROM favorites WHERE tenant_id=$1 AND listing_id=$2", [tenantId, hidden])).rowCount
    ).toBe(1);
  });

  it.each(["insert", "mapping"] as const)(
    "rolls back status, updated_at, and history when history %s fails",
    async (fault) => {
      const adminId = await insertUser("ADMIN");
      const listingId = await insertListing(await insertUser("LANDLORD"), "PENDING");
      const before = await storedListing(listingId);
      const runner: TransactionRunner = async (operation) =>
        withTransaction(pool, logger, async (transaction) => {
          const faulting: SqlExecutor = {
            async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
              if (!query.text.startsWith("INSERT INTO moderation_history")) return transaction.query<Row>(query);
              if (fault === "insert") throw new Error("synthetic history insert failure");
              const durable = await transaction.query<Row>(query);
              return { ...durable, rows: [{ id: 0 }] as unknown as Row[] };
            }
          };
          return operation(faulting);
        });
      await expect(
        service(runner).moderateListing({ ...adminPrincipal, userId: adminId }, listingId, {
          action: "APPROVE",
          reason: null
        })
      ).rejects.toThrow(fault === "insert" ? "synthetic history insert failure" : "Moderation history representation");
      const after = await storedListing(listingId);
      expect(after.status).toBe("PENDING");
      expect(after.updated_at.toISOString()).toBe(before.updated_at.toISOString());
      expect(await storedHistory(listingId)).toHaveLength(0);
    }
  );

  it("serializes APPROVE versus REJECT so only the deterministic leader succeeds", async () => {
    const adminId = await insertUser("ADMIN");
    const listingId = await insertListing(await insertUser("LANDLORD"), "PENDING");
    const leaderLocked = deferred();
    const followerBeforeLock = deferred();
    const releaseLeader = deferred();
    let leaderPid = 0;
    let followerPid = 0;

    function runner(side: "leader" | "follower"): TransactionRunner {
      return async (operation) =>
        withTransaction(pool, logger, async (transaction) => {
          const pid = (
            await transaction.query<{ pid: number }>({ text: "SELECT pg_backend_pid()::integer AS pid", values: [] })
          ).rows[0]!.pid;
          if (side === "leader") leaderPid = pid;
          else followerPid = pid;
          const instrumented: SqlExecutor = {
            async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
              if (!query.text.includes("FOR UPDATE OF l")) return transaction.query<Row>(query);
              if (side === "follower") {
                followerBeforeLock.resolve();
                return transaction.query<Row>(query);
              }
              const locked = await transaction.query<Row>(query);
              leaderLocked.resolve();
              await releaseLeader.promise;
              return locked;
            }
          };
          return operation(instrumented);
        });
    }

    const principal = { ...adminPrincipal, userId: adminId };
    const leader = service(runner("leader")).moderateListing(principal, listingId, { action: "APPROVE", reason: null });
    let follower: ReturnType<ReturnType<typeof service>["moderateListing"]> | null = null;
    try {
      await leaderLocked.promise;
      follower = service(runner("follower")).moderateListing(principal, listingId, {
        action: "REJECT",
        reason: "loser"
      });
      await followerBeforeLock.promise;
      await vi.waitFor(
        async () => {
          const blockers = await pool.query<{ blockers: number[] }>(
            "SELECT pg_blocking_pids($1::integer) AS blockers",
            [followerPid]
          );
          expect(blockers.rows[0]!.blockers).toContain(leaderPid);
        },
        { timeout: 5_000, interval: 20 }
      );
    } finally {
      releaseLeader.resolve();
    }
    if (follower === null) throw new Error("Follower did not reach the moderation lock.");
    await expect(leader).resolves.toMatchObject({ newStatus: "APPROVED" });
    await expect(follower).rejects.toMatchObject({ code: "INVALID_LISTING_TRANSITION" });
    expect((await storedListing(listingId)).status).toBe("APPROVED");
    expect(await storedHistory(listingId)).toHaveLength(1);
    expect(leaderPid).not.toBe(followerPid);
  });
});
