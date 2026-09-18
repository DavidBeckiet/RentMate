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
import { ApplicationError } from "../../shared/src/runtime/shared/errors/application-error.js";
import type { IdentityAccountClient, IdentityUserProfile } from "../../shared/identity-account-client.js";
import { createSupportRepository } from "../src/modules/support/repositories/support-repository.js";
import { createSupportService } from "../src/modules/support/services/support-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for Support database integration tests.");

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
const schemaName = `support_requests_${process.pid}`;
const quotedSchema = `"${schemaName}"`;
const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrationRunner = createMigrationRunner("Engagement");
const repository = createSupportRepository();
const tenant = Object.freeze({ userId: 11, role: "TENANT" as const });
const admin = Object.freeze({ userId: 99, role: "ADMIN" as const });
const input = Object.freeze({
  category: "TECHNICAL" as const,
  subject: "Unable to open a conversation",
  message: "The page fails while sending a message."
});

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

const profiles: readonly IdentityUserProfile[] = Object.freeze([
  Object.freeze({
    id: tenant.userId,
    role: "TENANT",
    email: "tenant@example.test",
    phone: "+84900000000",
    isActive: true
  })
]);
const identityAccountClient: Pick<IdentityAccountClient, "loadProfilesByIds"> = {
  loadProfilesByIds: async (ids) => Object.freeze(profiles.filter((profile) => ids.includes(profile.id)))
};
const service = createSupportService({
  repository,
  identityAccountClient,
  transactionRunner: { run: transaction }
});

before(async () => {
  await pool.query(`CREATE SCHEMA ${quotedSchema}`);
  const migrations = await migrationRunner.discover(migrationsDirectory);
  await migrationRunner.executePlan(migrationPool(), migrationRunner.createPlan("clean", migrations));
});

after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await pool.end();
});

async function rawState(supportRequestId: number): Promise<{
  readonly status: string;
  readonly assignedAdminId: number | null;
  readonly resolutionNote: string | null;
  readonly resolvedAt: Date | null;
}> {
  return transaction(async (executor) => {
    const result = await executor.query<{
      status: string;
      assigned_admin_id: number | null;
      resolution_note: string | null;
      resolved_at: Date | null;
    }>({
      text: "SELECT status, assigned_admin_id, resolution_note, resolved_at FROM support_requests WHERE id = $1",
      values: [supportRequestId]
    });
    const row = result.rows[0];
    if (!row) throw new Error("Support request was not created.");
    return {
      status: row.status,
      assignedAdminId: row.assigned_admin_id,
      resolutionNote: row.resolution_note,
      resolvedAt: row.resolved_at
    };
  });
}

test("PostgreSQL preserves unassigned, unresolved IN_PROGRESS support requests", async () => {
  const created = await service.create(tenant, input);
  const updated = await service.updateAdmin(admin, created.id, { status: "IN_PROGRESS", note: null });
  const stored = await rawState(created.id);

  assert.equal(updated.status, "IN_PROGRESS");
  assert.equal(updated.assignedAdminId, null);
  assert.equal(updated.resolutionNote, null);
  assert.equal(updated.resolvedAt, null);
  assert.deepEqual(stored, { status: "IN_PROGRESS", assignedAdminId: null, resolutionNote: null, resolvedAt: null });
});

test("PostgreSQL records the resolving admin and note only for RESOLVED support requests", async () => {
  const direct = await service.create(tenant, input);
  const directResolved = await service.updateAdmin(admin, direct.id, {
    status: "RESOLVED",
    note: "Closed after internal review."
  });
  const directStored = await rawState(direct.id);
  assert.equal(directResolved.status, "RESOLVED");
  assert.equal(directResolved.assignedAdminId, admin.userId);
  assert.equal(directResolved.resolutionNote, "Closed after internal review.");
  assert.ok(directResolved.resolvedAt);
  assert.equal(directStored.status, "RESOLVED");
  assert.equal(directStored.assignedAdminId, admin.userId);
  assert.equal(directStored.resolutionNote, "Closed after internal review.");
  assert.ok(directStored.resolvedAt);
  await assert.rejects(
    () => service.updateAdmin(admin, direct.id, { status: "IN_PROGRESS", note: null }),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );

  const reviewed = await service.create(tenant, input);
  await service.updateAdmin(admin, reviewed.id, { status: "IN_PROGRESS", note: null });
  const reviewedResolved = await service.updateAdmin(admin, reviewed.id, {
    status: "RESOLVED",
    note: "Completed after review."
  });
  assert.equal(reviewedResolved.status, "RESOLVED");
  assert.equal(reviewedResolved.assignedAdminId, admin.userId);
  assert.equal(reviewedResolved.resolutionNote, "Completed after review.");
});

test("PostgreSQL locking preserves conflict semantics for stale support transitions", async () => {
  const created = await service.create(tenant, input);
  const results = await Promise.allSettled([
    service.updateAdmin(admin, created.id, { status: "IN_PROGRESS", note: null }),
    service.updateAdmin(admin, created.id, { status: "IN_PROGRESS", note: null })
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof ApplicationError);
  assert.equal(rejected.reason.code, "CONCURRENT_MODIFICATION");

  const current = await service.getAdmin(admin, created.id);
  assert.equal(current.status, "IN_PROGRESS");
  await assert.rejects(
    () => service.updateAdmin(admin, created.id, { status: "IN_PROGRESS", note: null }),
    (error: unknown) => error instanceof ApplicationError && error.code === "CONCURRENT_MODIFICATION"
  );
});
