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
    max: 2,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  },
  { debug() {}, info() {}, warn() {}, error() {} }
);

const schemaName = `roommate_lifecycle_${process.pid}`;
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

before(async () => {
  await pool.query(`CREATE SCHEMA ${quotedSchema}`);
  const migrations = await migrationRunner.discover(migrationsDirectory);
  await migrationRunner.executePlan(migrationPool(), migrationRunner.createPlan("clean", migrations));
});

after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await pool.end();
});

test("enforces one open request, materializes expiry, cleans pending interests, and dedupes reminders", async () => {
  const profileInput = {
    intro: "A complete roommate profile for database integration.",
    sleepSchedule: "STANDARD",
    cleanlinessLevel: "BALANCED",
    noisePreference: "QUIET",
    smokingEnvironment: "SMOKE_FREE",
    petEnvironment: "NO_PETS"
  } as const;
  const initialProfile = await transaction((executor) => repository.upsertProfile(executor, 10, profileInput));
  const noopProfile = await transaction((executor) => repository.upsertProfile(executor, 10, profileInput));
  assert.equal(noopProfile.updatedAt, initialProfile.updatedAt);

  const input = {
    listingId: null,
    preferredAreaKeys: ["Quan 1"],
    budgetMinPerPerson: 1_000_000,
    budgetMaxPerPerson: 2_000_000,
    moveInFrom: "2026-09-01",
    moveInUntil: "2026-09-30",
    note: null
  } as const;
  const first = await transaction((executor) => repository.createRequest(executor, 10, input));
  await transaction(async (executor) => {
    await executor.query({
      text: "INSERT INTO roommate_interests (request_id, interested_tenant_id) VALUES ($1, $2)",
      values: [first.id, 20]
    });
    await executor.query({
      text: "UPDATE roommate_requests SET created_at = CURRENT_TIMESTAMP - INTERVAL '31 days', expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1",
      values: [first.id]
    });
  });
  await assert.rejects(
    () => transaction((executor) => repository.createRequest(executor, 10, input)),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23505"
  );
  const expired = await transaction((executor) => repository.materializeExpired(executor, first.id, new Date()));
  assert.equal(expired, true);
  const state = await transaction((executor) => repository.findRequestById(executor, first.id));
  assert.equal(state?.status, "EXPIRED");
  const interest = await transaction((executor) =>
    executor.query<{ status: string }>({
      text: "SELECT status FROM roommate_interests WHERE request_id = $1",
      values: [first.id]
    })
  );
  assert.equal(interest.rows[0]?.status, "REJECTED");
  const notifications = await transaction((executor) =>
    executor.query<{ event_type: string }>({
      text: "SELECT event_type FROM notifications WHERE roommate_request_id = $1 OR roommate_interest_id IS NOT NULL",
      values: [first.id]
    })
  );
  assert.equal(notifications.rows.length, 2);
  const second = await transaction((executor) => repository.createRequest(executor, 10, input));
  await transaction(async (executor) => {
    await executor.query({
      text: "UPDATE roommate_requests SET expires_at = CURRENT_TIMESTAMP + INTERVAL '2 days' WHERE id = $1",
      values: [second.id]
    });
    assert.equal(await repository.createDueExpiryReminders(executor, new Date(), 3, 100), 1);
    assert.equal(await repository.createDueExpiryReminders(executor, new Date(), 3, 100), 0);
  });

  await transaction(async (executor) => {
    await executor.query({
      text: "INSERT INTO roommate_interests (request_id, interested_tenant_id) VALUES ($1, $2)",
      values: [second.id, 21]
    });
    const cancelled = await repository.cancelRequest(executor, second.id);
    assert.equal(cancelled?.status, "CANCELLED");
    assert.equal(await repository.rejectPendingInterests(executor, second.id, "REQUEST_CANCELLED"), 1);
    const result = await executor.query<{ status: string; terminal_reason: string | null }>({
      text: "SELECT status, terminal_reason FROM roommate_interests WHERE request_id = $1",
      values: [second.id]
    });
    assert.deepEqual(result.rows[0], { status: "REJECTED", terminal_reason: "REQUEST_CANCELLED" });
  });

  const third = await transaction((executor) => repository.createRequest(executor, 10, input));
  await transaction(async (executor) => {
    await executor.query({
      text: "UPDATE roommate_requests SET created_at = CURRENT_TIMESTAMP - INTERVAL '31 days', expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1",
      values: [third.id]
    });
    assert.equal(await repository.materializeExpired(executor, third.id, new Date()), true);
    const renewed = await repository.renewRequest(executor, third.id);
    assert.equal(renewed.id, third.id);
    assert.equal(renewed.status, "OPEN");
    assert.ok(new Date(renewed.expiresAt).getTime() > Date.now());
  });
});
