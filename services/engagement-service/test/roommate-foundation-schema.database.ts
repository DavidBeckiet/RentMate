import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMigrationRunner,
  type MigrationClient,
  type MigrationPool
} from "../../shared/src/runtime/migrations/migration-runner.js";
import { createPostgresPool } from "../../shared/src/runtime/db/pool.js";

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

const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrationRunner = createMigrationRunner("Engagement");
const schemaNames = {
  clean: `roommate_foundation_clean_${process.pid}`,
  existing: `roommate_foundation_existing_${process.pid}`
} as const;

function quotedSchema(schemaName: string): string {
  if (!/^roommate_foundation_(?:clean|existing)_[0-9]+$/u.test(schemaName)) {
    throw new Error("Invalid test schema name.");
  }
  return `"${schemaName}"`;
}

function schemaMigrationPool(schemaName: string): MigrationPool {
  const quoted = quotedSchema(schemaName);
  return {
    async connect(): Promise<MigrationClient> {
      const client = await pool.connect();
      await client.query(`SET search_path TO ${quoted}`);
      return client;
    }
  };
}

async function createSchema(schemaName: string): Promise<void> {
  await pool.query(`CREATE SCHEMA ${quotedSchema(schemaName)}`);
}

async function dropSchema(schemaName: string): Promise<void> {
  await pool.query(`DROP SCHEMA IF EXISTS ${quotedSchema(schemaName)} CASCADE`);
}

async function countRoommateTables(schemaName: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
    `,
    [schemaName, ["roommate_profiles", "roommate_requests", "roommate_interests", "roommate_messages"]]
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function hasColumn(schemaName: string, tableName: string, columnName: string): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
    `,
    [schemaName, tableName, columnName]
  );
  return result.rows.length === 1;
}

before(async () => {
  await createSchema(schemaNames.clean);
  await createSchema(schemaNames.existing);
});

after(async () => {
  await dropSchema(schemaNames.clean);
  await dropSchema(schemaNames.existing);
  await pool.end();
});

test("clean Engagement migration creates the complete Roommate foundation", async () => {
  const migrations = await migrationRunner.discover(migrationsDirectory);
  const completed = await migrationRunner.executePlan(
    schemaMigrationPool(schemaNames.clean),
    migrationRunner.createPlan("clean", migrations)
  );

  assert.equal(
    completed.some(({ version }) => version === 18),
    true
  );
  assert.equal(
    completed.some(({ version }) => version === 19),
    true
  );
  assert.equal(await countRoommateTables(schemaNames.clean), 4);
  assert.equal(await hasColumn(schemaNames.clean, "contact_reports", "evidence_snapshot"), true);
});

test("existing Engagement migration applies only Roommate foundation after version 17", async () => {
  const migrations = await migrationRunner.discover(migrationsDirectory);
  await migrationRunner.executePlan(
    schemaMigrationPool(schemaNames.existing),
    migrationRunner.createPlan("clean", migrations.slice(0, 17))
  );

  const plan = migrationRunner.createPlan("existing", migrations.slice(0, 18), { appliedVersion: 17 });
  assert.equal(plan.migrations.at(0)?.version, 18);
  const completed = await migrationRunner.executePlan(schemaMigrationPool(schemaNames.existing), plan);

  assert.equal(completed.at(0)?.version, 18);
  assert.equal(await countRoommateTables(schemaNames.existing), 4);

  const safetyPlan = migrationRunner.createPlan("existing", migrations, { appliedVersion: 18 });
  assert.equal(safetyPlan.migrations.at(0)?.version, 19);
  const safetyCompleted = await migrationRunner.executePlan(schemaMigrationPool(schemaNames.existing), safetyPlan);
  assert.equal(safetyCompleted.at(0)?.version, 19);
  assert.equal(await hasColumn(schemaNames.existing, "contact_reports", "evidence_snapshot"), true);
});
