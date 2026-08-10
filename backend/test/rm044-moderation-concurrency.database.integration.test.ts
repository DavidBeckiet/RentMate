import dotenv from "dotenv";
import path from "node:path";
import type { QueryResult, QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { closeDatabasePool } from "../src/db/pool.js";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createModerationActionService } from "../src/modules/listings/moderation-action-service.js";
import type { ModerationActionInput } from "../src/modules/listings/moderation-action-validation.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 6 });
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
let sequence = 0;

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

interface TransactionTrace {
  connectionPid: number;
  lockPid: number;
  updatePid: number;
  historyPid: number;
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

async function insertUser(role: "ADMIN" | "LANDLORD"): Promise<number> {
  sequence += 1;
  return (
    await pool.query<{ id: number }>({
      text: "INSERT INTO users (role,email,phone_e164,password_hash,is_active) VALUES ($1,$2,$3,'hash',true) RETURNING id",
      values: [
        role,
        `rm044.concurrency.${role.toLowerCase()}.${sequence}@example.com`,
        role === "LANDLORD" ? `+8493${String(sequence).padStart(8, "0")}` : null
      ]
    })
  ).rows[0]!.id;
}

async function insertPendingListing(landlordId: number): Promise<number> {
  sequence += 1;
  return (
    await pool.query<{ id: number }>({
      text: `INSERT INTO listings
        (landlord_id,property_type_id,status,title,description,monthly_rent,room_area_sqm,address_text,area_name,latitude,longitude,updated_at)
        VALUES ($1,(SELECT id FROM property_types WHERE code='STUDIO'),'PENDING',$2,'Description',5000000,25,'Private address','District 1',10.75,106.67,'2020-01-01T00:00:00Z') RETURNING id`,
      values: [landlordId, `RM-044 concurrent listing ${sequence}`]
    })
  ).rows[0]!.id;
}

async function backendPid(executor: SqlExecutor): Promise<number> {
  return (await executor.query<{ pid: number }>({ text: "SELECT pg_backend_pid()::integer AS pid", values: [] }))
    .rows[0]!.pid;
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

describe("RM-044 deterministic PostgreSQL moderation concurrency", () => {
  it.each([
    { label: "same APPROVE/APPROVE", followerInput: { action: "APPROVE", reason: null } },
    { label: "competing APPROVE/REJECT", followerInput: { action: "REJECT", reason: "loser" } }
  ] satisfies readonly { label: string; followerInput: ModerationActionInput }[])(
    "serializes $label with one durable transition and one history row",
    async ({ followerInput }) => {
      const adminId = await insertUser("ADMIN");
      const listingId = await insertPendingListing(await insertUser("LANDLORD"));
      const leaderLocked = deferred();
      const followerBeforeLock = deferred();
      const releaseLeader = deferred();
      const leaderTrace: TransactionTrace = { connectionPid: 0, lockPid: 0, updatePid: 0, historyPid: 0 };
      const followerTrace: TransactionTrace = { connectionPid: 0, lockPid: 0, updatePid: 0, historyPid: 0 };

      function runner(side: "leader" | "follower", trace: TransactionTrace): TransactionRunner {
        return async (operation) =>
          withTransaction(pool, logger, async (transaction) => {
            trace.connectionPid = await backendPid(transaction);
            const instrumented: SqlExecutor = {
              async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
                if (query.text.includes("FOR UPDATE OF l")) {
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
                if (query.text.startsWith("UPDATE listings")) trace.updatePid = await backendPid(transaction);
                if (query.text.startsWith("INSERT INTO moderation_history")) {
                  trace.historyPid = await backendPid(transaction);
                }
                return transaction.query<Row>(query);
              }
            };
            return operation(instrumented);
          });
      }

      const principal = { userId: adminId, role: "ADMIN" as const };
      const leaderService = createModerationActionService({ transactionRunner: runner("leader", leaderTrace) });
      const followerService = createModerationActionService({ transactionRunner: runner("follower", followerTrace) });
      const leader = leaderService.moderateListing(principal, listingId, { action: "APPROVE", reason: null });
      let follower: ReturnType<typeof followerService.moderateListing> | null = null;
      try {
        await leaderLocked.promise;
        follower = followerService.moderateListing(principal, listingId, followerInput);
        await followerBeforeLock.promise;
        await vi.waitFor(
          async () => {
            const blockers = await pool.query<{ blockers: number[] }>(
              "SELECT pg_blocking_pids($1::integer) AS blockers",
              [followerTrace.connectionPid]
            );
            expect(blockers.rows[0]!.blockers).toContain(leaderTrace.connectionPid);
          },
          { timeout: 5_000, interval: 20 }
        );
      } finally {
        releaseLeader.resolve();
      }

      if (follower === null) throw new Error("Follower did not reach the moderation row lock.");
      await expect(leader).resolves.toMatchObject({ previousStatus: "PENDING", newStatus: "APPROVED" });
      await expect(follower).rejects.toMatchObject({ code: "INVALID_LISTING_TRANSITION" });
      expect(
        (await pool.query<{ status: string }>("SELECT status FROM listings WHERE id=$1", [listingId])).rows[0]!.status
      ).toBe("APPROVED");
      expect(
        (
          await pool.query<{ count: number }>(
            "SELECT COUNT(*)::integer AS count FROM moderation_history WHERE listing_id=$1",
            [listingId]
          )
        ).rows[0]!.count
      ).toBe(1);
      expect(leaderTrace.connectionPid).not.toBe(followerTrace.connectionPid);
      expect(leaderTrace.lockPid).toBe(leaderTrace.connectionPid);
      expect(leaderTrace.updatePid).toBe(leaderTrace.connectionPid);
      expect(leaderTrace.historyPid).toBe(leaderTrace.connectionPid);
      expect(followerTrace.lockPid).toBe(followerTrace.connectionPid);
      expect(followerTrace.updatePid).toBe(0);
      expect(followerTrace.historyPid).toBe(0);
    }
  );
});
