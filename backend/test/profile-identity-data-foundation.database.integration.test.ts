import dotenv from "dotenv";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { MigrationExecutionError } from "../src/db/migrations/types.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool();
const compatibilityMigrationDirectory = path.resolve(process.cwd(), "migrations");
const identityMigrationDirectory = path.resolve(process.cwd(), "..", "services", "identity-service", "migrations");

async function cleanDatabase(): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS landlord_verifications");
  await pool.query("DROP TABLE IF EXISTS moderation_history");
  await pool.query("DROP TABLE IF EXISTS favorites");
  await pool.query("DROP TABLE IF EXISTS listing_amenities");
  await pool.query("DROP TABLE IF EXISTS listing_images");
  await pool.query("DROP TABLE IF EXISTS listings");
  await pool.query("DROP TABLE IF EXISTS amenities");
  await pool.query("DROP TABLE IF EXISTS property_types");
  await pool.query("DROP TABLE IF EXISTS users");
  await pool.query("DROP TYPE IF EXISTS listing_status");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

async function expectDisplayNameSchema(): Promise<void> {
  const column = await pool.query<{
    dataType: string;
    maximumLength: number;
    nullable: "YES" | "NO";
    defaultValue: string | null;
  }>(`
    SELECT
      data_type AS "dataType",
      character_maximum_length AS "maximumLength",
      is_nullable AS nullable,
      column_default AS "defaultValue"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'display_name'
  `);
  expect(column.rows).toStrictEqual([
    { dataType: "character varying", maximumLength: 120, nullable: "YES", defaultValue: null }
  ]);

  const constraints = await pool.query<{ constraintName: string }>(`
    SELECT conname AS "constraintName"
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND conname = 'ck_users_display_name'
  `);
  expect(constraints.rows).toStrictEqual([{ constraintName: "ck_users_display_name" }]);
}

async function expectDisplayNameValues(): Promise<void> {
  await pool.query("INSERT INTO users (role, email, password_hash, display_name) VALUES ('TENANT', $1, 'hash', NULL)", [
    "profile-null@example.test"
  ]);
  await pool.query("INSERT INTO users (role, email, password_hash, display_name) VALUES ('TENANT', $1, 'hash', $2)", [
    "profile-unicode@example.test",
    "Nguyễn Gia Kiệt"
  ]);
  await expect(
    pool.query("INSERT INTO users (role, email, password_hash, display_name) VALUES ('TENANT', $1, 'hash', $2)", [
      "profile-blank@example.test",
      ""
    ])
  ).rejects.toBeDefined();
  await expect(
    pool.query("INSERT INTO users (role, email, password_hash, display_name) VALUES ('TENANT', $1, 'hash', $2)", [
      "profile-untrimmed@example.test",
      " Gia Kiệt "
    ])
  ).rejects.toBeDefined();

  const names = await pool.query<{ email: string; displayName: string | null }>(
    'SELECT email, display_name AS "displayName" FROM users ORDER BY email'
  );
  expect(names.rows).toStrictEqual([
    { email: "profile-null@example.test", displayName: null },
    { email: "profile-unicode@example.test", displayName: "Nguyễn Gia Kiệt" }
  ]);
}

beforeEach(cleanDatabase);
afterEach(cleanDatabase);
afterAll(async () => {
  await cleanDatabase();
  await pool.end();
});

describe("PROFILE IDENTITY database foundation", () => {
  it("migrates a fresh Identity database through 0001, 0002, and 0003", async () => {
    const migrations = await discoverMigrations(identityMigrationDirectory);
    const plan = createMigrationPlan("clean", migrations);
    expect(plan.migrations.map(({ version }) => version)).toStrictEqual([1, 2, 3]);

    const result = await executeMigrationPlan(pool, plan);
    expect(result.completedMigrations).toHaveLength(3);
    await expectDisplayNameSchema();
    await expectDisplayNameValues();
  });

  it("selects only 0003 for an existing Identity 0002 database and preserves its rows", async () => {
    const migrations = await discoverMigrations(identityMigrationDirectory);
    await executeMigrationPlan(pool, createMigrationPlan("clean", migrations.slice(0, 2)));
    await pool.query(
      "INSERT INTO users (role, email, password_hash, created_at, updated_at) VALUES ('TENANT', $1, 'hash', $2, $3)",
      ["existing@example.test", "2030-01-01T00:00:00.000Z", "2030-01-02T00:00:00.000Z"]
    );

    const plan = createMigrationPlan("existing", migrations, { appliedVersion: 2 });
    expect(plan.migrations.map(({ version }) => version)).toStrictEqual([3]);
    const result = await executeMigrationPlan(pool, plan);
    expect(result.completedMigrations).toHaveLength(1);

    const existing = await pool.query<{ email: string; displayName: string | null; updatedAt: string }>(
      `SELECT email, display_name AS "displayName", updated_at::text AS "updatedAt"
       FROM users WHERE email = $1`,
      ["existing@example.test"]
    );
    expect(existing.rows).toHaveLength(1);
    expect(existing.rows[0]).toMatchObject({ email: "existing@example.test", displayName: null });
    expect(new Date(existing.rows[0]!.updatedAt).toISOString()).toBe("2030-01-02T00:00:00.000Z");
  });

  it("fails and rolls back when an external version record does not match the Identity schema", async () => {
    const migrations = await discoverMigrations(identityMigrationDirectory);
    await executeMigrationPlan(pool, createMigrationPlan("clean", migrations.slice(0, 1)));

    await expect(
      executeMigrationPlan(pool, createMigrationPlan("existing", migrations, { appliedVersion: 2 }))
    ).rejects.toBeInstanceOf(MigrationExecutionError);

    const column = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'display_name'
      ) AS exists
    `);
    expect(column.rows).toStrictEqual([{ exists: false }]);
  });

  it("applies compatibility migration 0013 with the same nullable constrained semantics", async () => {
    const migrations = await discoverMigrations(compatibilityMigrationDirectory);
    expect(migrations.at(-1)).toMatchObject({ version: 13, filename: "0013_add_user_display_name.sql" });
    await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));

    await expectDisplayNameSchema();
    await expectDisplayNameValues();
  });
});
