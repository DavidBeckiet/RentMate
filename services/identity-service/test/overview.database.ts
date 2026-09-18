import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresPool } from "../../shared/src/runtime/db/pool.js";
import type { SqlExecutor } from "../../shared/src/runtime/db/sql-executor.js";
import { withTransaction } from "../../shared/src/runtime/db/transaction.js";
import {
  createMigrationRunner,
  type MigrationClient,
  type MigrationPool
} from "../../shared/src/runtime/migrations/migration-runner.js";
import { createIdentityOverviewRepository } from "../src/modules/overview/repositories/identity-overview-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for Identity overview database tests.");
const parsed = new URL(databaseUrl);
const pool = createPostgresPool(
  {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  },
  { debug() {}, info() {}, warn() {}, error() {} }
);
const schemaName = `identity_overview_${process.pid}`;
const quotedSchema = `"${schemaName}"`;
const runner = createMigrationRunner("Identity overview");
const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

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
const migrationPool: MigrationPool = {
  connect: async (): Promise<MigrationClient> => {
    const client = await pool.connect();
    await client.query(`SET search_path TO ${quotedSchema}`);
    return client;
  }
};

before(async () => {
  await pool.query(`CREATE SCHEMA ${quotedSchema}`);
  const migrations = await runner.discover(migrationsDirectory);
  await runner.executePlan(migrationPool, runner.createPlan("clean", migrations));
});
after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await pool.end();
});

test("PostgreSQL Identity overview counts every account state and only pending verifications", async () => {
  assert.deepEqual((await transaction((executor) => createIdentityOverviewRepository(executor).read())).accounts, {
    total: 0,
    byRole: { TENANT: 0, LANDLORD: 0, ADMIN: 0 },
    active: 0,
    inactive: 0
  });
  await transaction(async (executor) => {
    const tenant = await executor.query<{ id: number }>({
      text: "INSERT INTO users (role, email, password_hash, is_active) VALUES ('TENANT', 'tenant@example.test', 'hash', true) RETURNING id",
      values: []
    });
    const landlord = await executor.query<{ id: number }>({
      text: "INSERT INTO users (role, email, phone_e164, password_hash, is_active) VALUES ('LANDLORD', 'landlord@example.test', '+84901234567', 'hash', false) RETURNING id",
      values: []
    });
    const admin = await executor.query<{ id: number }>({
      text: "INSERT INTO users (role, email, password_hash, is_active) VALUES ('ADMIN', 'admin@example.test', 'hash', true) RETURNING id",
      values: []
    });
    const landlordId = landlord.rows[0]?.id;
    const adminId = admin.rows[0]?.id;
    assert.ok(tenant.rows[0]?.id && landlordId && adminId);
    await executor.query({
      text: "INSERT INTO landlord_verifications (landlord_id, display_name, status) VALUES ($1, 'Chủ trọ mới', 'PENDING')",
      values: [landlordId]
    });
    await executor.query({
      text: "INSERT INTO landlord_verifications (landlord_id, display_name, status, decision_note, reviewed_by_admin_id, reviewed_at) VALUES ($1, 'Chủ trọ cũ', 'APPROVED', 'Đã kiểm tra.', $2, CURRENT_TIMESTAMP)",
      values: [landlordId, adminId]
    });
  });
  const value = await transaction((executor) => createIdentityOverviewRepository(executor).read());
  assert.deepEqual(value.accounts, { total: 3, byRole: { TENANT: 1, LANDLORD: 1, ADMIN: 1 }, active: 2, inactive: 1 });
  assert.equal(value.verifications.pending, 1);
  assert.match(value.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
});
