import dotenv from "dotenv";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { MigrationExecutionError } from "../src/db/migrations/types.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool();
const temporaryDirectories: string[] = [];
const testTableNames = [
  "rm004_order_success",
  "rm004_partial_success",
  "rm004_failed_effect",
  "rm004_later_should_not_exist",
  "rm004_precondition_anchor",
  "rm004_precondition_failed_effect",
  "rm004_precondition_later",
  "rm004_existing_selection"
] as const;

async function createMigrationDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "rentmate-rm004-integration-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeMigration(directory: string, version: number, description: string, sql: string): Promise<void> {
  const filename = `${String(version).padStart(4, "0")}_${description}.sql`;
  await writeFile(path.join(directory, filename), sql, "utf8");
}

async function cleanTestObjects(): Promise<void> {
  const identifiers = testTableNames.map((name) => `"${name}"`).join(", ");
  await pool.query(`DROP TABLE IF EXISTS ${identifiers} CASCADE`);
}

async function readRelations(names: readonly string[]): Promise<Record<string, string | null>> {
  const result = await pool.query<{ name: string; relation: string | null }>(
    `
      SELECT requested.name, to_regclass('public.' || requested.name)::text AS relation
      FROM unnest($1::text[]) AS requested(name)
      ORDER BY requested.name
    `,
    [names]
  );

  return Object.fromEntries(result.rows.map(({ name, relation }) => [name, relation]));
}

function expectAllClientsReleased(): void {
  expect(pool.waitingCount).toBe(0);
  expect(pool.idleCount).toBe(pool.totalCount);
}

beforeEach(async () => {
  await cleanTestObjects();
});

afterEach(async () => {
  await cleanTestObjects();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

afterAll(async () => {
  await cleanTestObjects();
  await pool.end();
});

describe("PostgreSQL migration execution", () => {
  it("executes dependent fixture migrations in deterministic order", async () => {
    const directory = await createMigrationDirectory();
    await writeMigration(
      directory,
      2,
      "insert_order_success",
      "INSERT INTO rm004_order_success (value) VALUES ('second');"
    );
    await writeMigration(
      directory,
      1,
      "create_order_success",
      "CREATE TABLE rm004_order_success (value text NOT NULL);"
    );
    const migrations = await discoverMigrations(directory);

    const result = await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));

    expect(result.completedMigrations.map(({ version }) => version)).toStrictEqual([1, 2]);
    await expect(pool.query<{ value: string }>("SELECT value FROM rm004_order_success")).resolves.toMatchObject({
      rows: [{ value: "second" }]
    });
    expectAllClientsReleased();
  });

  it("rolls back a failed migration, preserves earlier commits, and skips later files", async () => {
    const directory = await createMigrationDirectory();
    await writeMigration(
      directory,
      1,
      "create_partial_success",
      "CREATE TABLE rm004_partial_success (id integer PRIMARY KEY);"
    );
    await writeMigration(
      directory,
      2,
      "create_then_fail",
      `
        CREATE TABLE rm004_failed_effect (id integer PRIMARY KEY);
        SELECT * FROM rm004_deliberately_missing_relation;
      `
    );
    await writeMigration(
      directory,
      3,
      "must_not_execute",
      "CREATE TABLE rm004_later_should_not_exist (id integer PRIMARY KEY);"
    );
    const plan = createMigrationPlan("clean", await discoverMigrations(directory));

    let failure: MigrationExecutionError | undefined;
    try {
      await executeMigrationPlan(pool, plan);
    } catch (error) {
      if (error instanceof MigrationExecutionError) {
        failure = error;
      } else {
        throw error;
      }
    }

    expect(failure?.failedMigration.version).toBe(2);
    expect(failure?.lastSuccessfulMigration?.version).toBe(1);
    expect(failure?.message).not.toContain("rm004_deliberately_missing_relation");
    await expect(
      readRelations(["rm004_partial_success", "rm004_failed_effect", "rm004_later_should_not_exist"])
    ).resolves.toStrictEqual({
      rm004_failed_effect: null,
      rm004_later_should_not_exist: null,
      rm004_partial_success: "rm004_partial_success"
    });
    expectAllClientsReleased();
  });

  it("treats a schema-precondition mismatch as a rolled-back migration failure", async () => {
    const directory = await createMigrationDirectory();
    await writeMigration(
      directory,
      1,
      "create_precondition_anchor",
      "CREATE TABLE rm004_precondition_anchor (id integer PRIMARY KEY);"
    );
    await writeMigration(
      directory,
      2,
      "fail_schema_precondition",
      `
        CREATE TABLE rm004_precondition_failed_effect (id integer PRIMARY KEY);
        ALTER TABLE rm004_precondition_anchor ADD COLUMN id text;
      `
    );
    await writeMigration(
      directory,
      3,
      "must_not_execute_after_precondition",
      "CREATE TABLE rm004_precondition_later (id integer PRIMARY KEY);"
    );

    await expect(
      executeMigrationPlan(pool, createMigrationPlan("clean", await discoverMigrations(directory)))
    ).rejects.toMatchObject({
      failedMigration: { version: 2 },
      lastSuccessfulMigration: { version: 1 }
    });

    await expect(
      readRelations(["rm004_precondition_anchor", "rm004_precondition_failed_effect", "rm004_precondition_later"])
    ).resolves.toStrictEqual({
      rm004_precondition_anchor: "rm004_precondition_anchor",
      rm004_precondition_failed_effect: null,
      rm004_precondition_later: null
    });
    expectAllClientsReleased();
  });

  it("executes only migrations newer than the external deployment record", async () => {
    const directory = await createMigrationDirectory();
    await writeMigration(
      directory,
      1,
      "create_existing_selection",
      "CREATE TABLE rm004_existing_selection (value integer NOT NULL);"
    );
    await writeMigration(
      directory,
      2,
      "insert_existing_selection",
      "INSERT INTO rm004_existing_selection (value) VALUES (2);"
    );
    await writeMigration(
      directory,
      3,
      "insert_existing_selection_again",
      "INSERT INTO rm004_existing_selection (value) VALUES (3);"
    );
    const migrations = await discoverMigrations(directory);

    await executeMigrationPlan(pool, createMigrationPlan("clean", [migrations[0]!]));
    const existingPlan = createMigrationPlan("existing", migrations, {
      appliedVersion: 1
    });
    await executeMigrationPlan(pool, existingPlan);

    expect(existingPlan.migrations.map(({ version }) => version)).toStrictEqual([2, 3]);
    await expect(
      pool.query<{ value: number }>("SELECT value FROM rm004_existing_selection ORDER BY value")
    ).resolves.toMatchObject({
      rows: [{ value: 2 }, { value: 3 }]
    });

    const bookkeepingTables = await pool.query<{ tableName: string }>(
      `
        SELECT tablename AS "tableName"
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('migrations', 'schema_migrations', 'migration_history')
      `
    );
    expect(bookkeepingTables.rows).toStrictEqual([]);
    expectAllClientsReleased();
  });
});
