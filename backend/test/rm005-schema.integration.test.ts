import dotenv from "dotenv";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import type { MigrationPlan } from "../src/db/migrations/types.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool();
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const temporaryDirectories: string[] = [];

const expectedPropertyTypes = [
  { code: "ROOM", label: "Room" },
  { code: "STUDIO", label: "Studio" },
  { code: "APARTMENT", label: "Apartment" },
  { code: "HOUSE", label: "House" },
  { code: "DORMITORY", label: "Dormitory" }
] as const;

const expectedAmenities = [
  { code: "AIR_CONDITIONING", label: "Air conditioning" },
  { code: "WIFI", label: "Wi-Fi" },
  { code: "FURNISHED", label: "Furnished" },
  { code: "PRIVATE_BATHROOM", label: "Private bathroom" },
  { code: "KITCHEN", label: "Kitchen" },
  { code: "REFRIGERATOR", label: "Refrigerator" },
  { code: "WASHING_MACHINE", label: "Washing machine" },
  { code: "PARKING", label: "Parking" },
  { code: "ELEVATOR", label: "Elevator" },
  { code: "SECURITY", label: "Security" },
  { code: "BALCONY", label: "Balcony" },
  { code: "PET_FRIENDLY", label: "Pet-friendly" }
] as const;

interface CatalogRow {
  readonly id: number;
  readonly code: string;
  readonly label: string;
  readonly isActive: boolean;
}

async function cleanDatabase(): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS rm005_committed_fixture");
  await pool.query("DROP TABLE IF EXISTS rm005_rolled_back_fixture");
  await pool.query("DROP TABLE IF EXISTS rm005_skipped_fixture");
  await pool.query("DROP TABLE IF EXISTS amenities");
  await pool.query("DROP TABLE IF EXISTS property_types");
  await pool.query("DROP TABLE IF EXISTS users");
  await pool.query("DROP TYPE IF EXISTS listing_status");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

async function createRepositoryPlan(appliedVersion?: number): Promise<MigrationPlan> {
  const migrations = await discoverMigrations(migrationDirectory);
  return appliedVersion === undefined
    ? createMigrationPlan("clean", migrations)
    : createMigrationPlan("existing", migrations, { appliedVersion });
}

async function migrateClean(): Promise<void> {
  await executeMigrationPlan(pool, await createRepositoryPlan());
}

async function expectQueryFailure(sql: string, values: readonly unknown[] = []): Promise<void> {
  await expect(pool.query(sql, [...values])).rejects.toBeDefined();
}

async function readCatalog(table: "property_types" | "amenities"): Promise<CatalogRow[]> {
  const result = await pool.query<CatalogRow>(
    `
      SELECT id, code, label, is_active AS "isActive"
      FROM ${table}
      ORDER BY id
    `
  );
  return result.rows;
}

function withoutIds(rows: readonly CatalogRow[]): Array<Omit<CatalogRow, "id">> {
  return rows.map(({ code, label, isActive }) => ({ code, label, isActive }));
}

beforeEach(async () => {
  await cleanDatabase();
});

afterEach(async () => {
  await cleanDatabase();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

afterAll(async () => {
  await cleanDatabase();
  await pool.end();
});

describe("RM-005 PostgreSQL schema", () => {
  it("creates only the exact enum, table, column, constraint, and index inventory", async () => {
    await migrateClean();

    const enumLabels = await pool.query<{ typeName: string; label: string; sortOrder: number }>(
      `
        SELECT type.typname AS "typeName", enum.enumlabel AS label, enum.enumsortorder AS "sortOrder"
        FROM pg_type AS type
        JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
        JOIN pg_enum AS enum ON enum.enumtypid = type.oid
        WHERE namespace.nspname = 'public'
        ORDER BY type.typname, enum.enumsortorder
      `
    );
    expect(enumLabels.rows).toStrictEqual([
      { typeName: "listing_status", label: "DRAFT", sortOrder: 1 },
      { typeName: "listing_status", label: "PENDING", sortOrder: 2 },
      { typeName: "listing_status", label: "APPROVED", sortOrder: 3 },
      { typeName: "listing_status", label: "REJECTED", sortOrder: 4 },
      { typeName: "listing_status", label: "HIDDEN", sortOrder: 5 },
      { typeName: "listing_status", label: "INACTIVE", sortOrder: 6 },
      { typeName: "user_role", label: "TENANT", sortOrder: 1 },
      { typeName: "user_role", label: "LANDLORD", sortOrder: 2 },
      { typeName: "user_role", label: "ADMIN", sortOrder: 3 }
    ]);

    const tables = await pool.query<{ tableName: string }>(
      `
        SELECT tablename AS "tableName"
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `
    );
    expect(tables.rows).toStrictEqual([
      { tableName: "amenities" },
      { tableName: "property_types" },
      { tableName: "users" }
    ]);

    const columns = await pool.query<{
      tableName: string;
      ordinalPosition: number;
      columnName: string;
      dataType: string;
      udtName: string;
      maximumLength: number | null;
      nullable: "YES" | "NO";
      identity: "YES" | "NO";
      identityGeneration: "ALWAYS" | null;
      defaultValue: string | null;
    }>(
      `
        SELECT
          table_name AS "tableName",
          ordinal_position AS "ordinalPosition",
          column_name AS "columnName",
          data_type AS "dataType",
          udt_name AS "udtName",
          character_maximum_length AS "maximumLength",
          is_nullable AS nullable,
          is_identity AS identity,
          identity_generation AS "identityGeneration",
          column_default AS "defaultValue"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'property_types', 'amenities')
        ORDER BY table_name, ordinal_position
      `
    );
    expect(columns.rows).toStrictEqual([
      {
        tableName: "amenities",
        ordinalPosition: 1,
        columnName: "id",
        dataType: "smallint",
        udtName: "int2",
        maximumLength: null,
        nullable: "NO",
        identity: "YES",
        identityGeneration: "ALWAYS",
        defaultValue: null
      },
      {
        tableName: "amenities",
        ordinalPosition: 2,
        columnName: "code",
        dataType: "character varying",
        udtName: "varchar",
        maximumLength: 40,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: null
      },
      {
        tableName: "amenities",
        ordinalPosition: 3,
        columnName: "label",
        dataType: "character varying",
        udtName: "varchar",
        maximumLength: 80,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: null
      },
      {
        tableName: "amenities",
        ordinalPosition: 4,
        columnName: "is_active",
        dataType: "boolean",
        udtName: "bool",
        maximumLength: null,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: "true"
      },
      {
        tableName: "property_types",
        ordinalPosition: 1,
        columnName: "id",
        dataType: "smallint",
        udtName: "int2",
        maximumLength: null,
        nullable: "NO",
        identity: "YES",
        identityGeneration: "ALWAYS",
        defaultValue: null
      },
      {
        tableName: "property_types",
        ordinalPosition: 2,
        columnName: "code",
        dataType: "character varying",
        udtName: "varchar",
        maximumLength: 32,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: null
      },
      {
        tableName: "property_types",
        ordinalPosition: 3,
        columnName: "label",
        dataType: "character varying",
        udtName: "varchar",
        maximumLength: 80,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: null
      },
      {
        tableName: "property_types",
        ordinalPosition: 4,
        columnName: "is_active",
        dataType: "boolean",
        udtName: "bool",
        maximumLength: null,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: "true"
      },
      {
        tableName: "users",
        ordinalPosition: 1,
        columnName: "id",
        dataType: "integer",
        udtName: "int4",
        maximumLength: null,
        nullable: "NO",
        identity: "YES",
        identityGeneration: "ALWAYS",
        defaultValue: null
      },
      {
        tableName: "users",
        ordinalPosition: 2,
        columnName: "role",
        dataType: "USER-DEFINED",
        udtName: "user_role",
        maximumLength: null,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: null
      },
      {
        tableName: "users",
        ordinalPosition: 3,
        columnName: "email",
        dataType: "character varying",
        udtName: "varchar",
        maximumLength: 320,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: null
      },
      {
        tableName: "users",
        ordinalPosition: 4,
        columnName: "phone_e164",
        dataType: "character varying",
        udtName: "varchar",
        maximumLength: 16,
        nullable: "YES",
        identity: "NO",
        identityGeneration: null,
        defaultValue: null
      },
      {
        tableName: "users",
        ordinalPosition: 5,
        columnName: "password_hash",
        dataType: "character varying",
        udtName: "varchar",
        maximumLength: 100,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: null
      },
      {
        tableName: "users",
        ordinalPosition: 6,
        columnName: "is_active",
        dataType: "boolean",
        udtName: "bool",
        maximumLength: null,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: "true"
      },
      {
        tableName: "users",
        ordinalPosition: 7,
        columnName: "created_at",
        dataType: "timestamp with time zone",
        udtName: "timestamptz",
        maximumLength: null,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: "CURRENT_TIMESTAMP"
      },
      {
        tableName: "users",
        ordinalPosition: 8,
        columnName: "updated_at",
        dataType: "timestamp with time zone",
        udtName: "timestamptz",
        maximumLength: null,
        nullable: "NO",
        identity: "NO",
        identityGeneration: null,
        defaultValue: "CURRENT_TIMESTAMP"
      }
    ]);

    const constraints = await pool.query<{ tableName: string; constraintName: string; constraintType: string }>(
      `
        SELECT
          constrained.relname AS "tableName",
          constraint_record.conname AS "constraintName",
          constraint_record.contype AS "constraintType"
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS constrained ON constrained.oid = constraint_record.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = constrained.relnamespace
        WHERE namespace.nspname = 'public'
          AND constrained.relname IN ('users', 'property_types', 'amenities')
        ORDER BY constrained.relname, constraint_record.conname
      `
    );
    expect(constraints.rows).toStrictEqual([
      { tableName: "amenities", constraintName: "ck_amenities_code", constraintType: "c" },
      { tableName: "amenities", constraintName: "ck_amenities_label", constraintType: "c" },
      { tableName: "amenities", constraintName: "pk_amenities", constraintType: "p" },
      { tableName: "amenities", constraintName: "uq_amenities_code", constraintType: "u" },
      { tableName: "amenities", constraintName: "uq_amenities_label", constraintType: "u" },
      { tableName: "property_types", constraintName: "ck_property_types_code", constraintType: "c" },
      { tableName: "property_types", constraintName: "ck_property_types_label", constraintType: "c" },
      { tableName: "property_types", constraintName: "pk_property_types", constraintType: "p" },
      { tableName: "property_types", constraintName: "uq_property_types_code", constraintType: "u" },
      { tableName: "property_types", constraintName: "uq_property_types_label", constraintType: "u" },
      { tableName: "users", constraintName: "ck_users_email_normalized", constraintType: "c" },
      { tableName: "users", constraintName: "ck_users_landlord_phone", constraintType: "c" },
      { tableName: "users", constraintName: "ck_users_phone_e164", constraintType: "c" },
      { tableName: "users", constraintName: "pk_users", constraintType: "p" },
      { tableName: "users", constraintName: "uq_users_email", constraintType: "u" }
    ]);

    const nonConstraintIndexes = await pool.query<{ indexName: string }>(
      `
        SELECT indexed.relname AS "indexName"
        FROM pg_index AS index_record
        JOIN pg_class AS indexed ON indexed.oid = index_record.indexrelid
        JOIN pg_class AS source_table ON source_table.oid = index_record.indrelid
        JOIN pg_namespace AS namespace ON namespace.oid = source_table.relnamespace
        WHERE namespace.nspname = 'public'
          AND source_table.relname IN ('users', 'property_types', 'amenities')
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint AS constraint_record
            WHERE constraint_record.conindid = index_record.indexrelid
          )
      `
    );
    expect(nonConstraintIndexes.rows).toStrictEqual([]);
  });

  it("enforces user normalization, role, phone, identity, uniqueness, and defaults", async () => {
    await migrateClean();

    await pool.query(
      `
        INSERT INTO users (role, email, phone_e164, password_hash)
        VALUES
          ('TENANT', 'tenant@example.com', NULL, 'tenant-hash'),
          ('TENANT', 'tenant-phone@example.com', '+84901234567', 'tenant-phone-hash'),
          ('LANDLORD', 'landlord@example.com', '+14155552671', 'landlord-hash'),
          ('ADMIN', 'admin@example.com', NULL, 'admin-hash')
      `
    );

    const defaults = await pool.query<{ isActive: boolean; timestampsSet: boolean }>(
      `
        SELECT
          is_active AS "isActive",
          created_at IS NOT NULL AND updated_at IS NOT NULL AS "timestampsSet"
        FROM users
        WHERE email = 'tenant@example.com'
      `
    );
    expect(defaults.rows).toStrictEqual([{ isActive: true, timestampsSet: true }]);

    const invalidUsers: ReadonlyArray<readonly [string, readonly unknown[]]> = [
      ["INSERT INTO users (role, email, password_hash) VALUES ('TENANT', $1, 'hash')", [""]],
      ["INSERT INTO users (role, email, password_hash) VALUES ('TENANT', $1, 'hash')", ["   "]],
      ["INSERT INTO users (role, email, password_hash) VALUES ('TENANT', $1, 'hash')", ["Upper@example.com"]],
      ["INSERT INTO users (role, email, password_hash) VALUES ('TENANT', $1, 'hash')", [" edged@example.com "]],
      [
        "INSERT INTO users (role, email, phone_e164, password_hash) VALUES ('TENANT', 'phone1@example.com', $1, 'hash')",
        ["84901234567"]
      ],
      [
        "INSERT INTO users (role, email, phone_e164, password_hash) VALUES ('TENANT', 'phone2@example.com', $1, 'hash')",
        ["+012345678"]
      ],
      [
        "INSERT INTO users (role, email, phone_e164, password_hash) VALUES ('TENANT', 'phone3@example.com', $1, 'hash')",
        ["+1234567"]
      ],
      [
        "INSERT INTO users (role, email, phone_e164, password_hash) VALUES ('TENANT', 'phone4@example.com', $1, 'hash')",
        ["+1234567890123456"]
      ],
      [
        "INSERT INTO users (role, email, phone_e164, password_hash) VALUES ('TENANT', 'phone5@example.com', $1, 'hash')",
        ["+12345678x"]
      ],
      [
        "INSERT INTO users (role, email, password_hash) VALUES ('LANDLORD', 'landlord-no-phone@example.com', 'hash')",
        []
      ],
      ["INSERT INTO users (role, email, password_hash) VALUES ('GUEST', 'guest@example.com', 'hash')", []],
      ["INSERT INTO users (role, email, password_hash) VALUES ('TENANT', 'tenant@example.com', 'hash')", []],
      ["INSERT INTO users (id, role, email, password_hash) VALUES (100, 'TENANT', 'explicit@example.com', 'hash')", []],
      ["INSERT INTO users (role, email, password_hash) VALUES (NULL, 'null-role@example.com', 'hash')", []],
      ["INSERT INTO users (role, email, password_hash) VALUES ('TENANT', 'null-hash@example.com', NULL)", []]
    ];

    for (const [sql, values] of invalidUsers) {
      await expectQueryFailure(sql, values);
    }
  });

  it("enforces catalog identities, codes, labels, defaults, and uniqueness", async () => {
    await migrateClean();

    for (const table of ["property_types", "amenities"] as const) {
      const prefix = table === "property_types" ? "TYPE" : "AMENITY";
      await pool.query(`INSERT INTO ${table} (code, label) VALUES ($1, $2)`, [`${prefix}_VALID_2`, `${prefix} valid`]);
      const valid = await pool.query<{ isActive: boolean }>(
        `SELECT is_active AS "isActive" FROM ${table} WHERE code = $1`,
        [`${prefix}_VALID_2`]
      );
      expect(valid.rows).toStrictEqual([{ isActive: true }]);

      await expectQueryFailure(`INSERT INTO ${table} (id, code, label) VALUES (100, $1, $2)`, [
        `${prefix}_EXPLICIT`,
        `${prefix} explicit`
      ]);
      await expectQueryFailure(`INSERT INTO ${table} (code, label) VALUES ($1, $2)`, [
        `${prefix.toLowerCase()}_LOWER`,
        `${prefix} lower`
      ]);
      await expectQueryFailure(`INSERT INTO ${table} (code, label) VALUES ($1, $2)`, [
        `1_${prefix}`,
        `${prefix} digit`
      ]);
      await expectQueryFailure(`INSERT INTO ${table} (code, label) VALUES ($1, $2)`, [
        `${prefix}-PUNCTUATION`,
        `${prefix} punctuation`
      ]);
      await expectQueryFailure(`INSERT INTO ${table} (code, label) VALUES ($1, $2)`, [`${prefix}_BLANK`, "   "]);
      await expectQueryFailure(`INSERT INTO ${table} (code, label) VALUES ($1, $2)`, [`${prefix}_EDGED`, " edged "]);
      await expectQueryFailure(`INSERT INTO ${table} (code, label) VALUES ($1, $2)`, [
        `${prefix}_DUPLICATE_CODE`,
        `${prefix} valid`
      ]);
      await expectQueryFailure(`INSERT INTO ${table} (code, label) VALUES ($1, $2)`, [
        `${prefix}_VALID_2`,
        `${prefix} duplicate code`
      ]);
      await expectQueryFailure(`INSERT INTO ${table} (code, label) VALUES (NULL, $1)`, [`${prefix} null code`]);
      await expectQueryFailure(`INSERT INTO ${table} (code, label) VALUES ($1, NULL)`, [`${prefix}_NULL_LABEL`]);
    }
  });

  it("seeds exact catalogs and reconciles labels without reactivating or replacing rows", async () => {
    await migrateClean();

    const initialPropertyTypes = await readCatalog("property_types");
    const initialAmenities = await readCatalog("amenities");
    expect(withoutIds(initialPropertyTypes)).toStrictEqual(
      expectedPropertyTypes.map(({ code, label }) => ({ code, label, isActive: true }))
    );
    expect(withoutIds(initialAmenities)).toStrictEqual(
      expectedAmenities.map(({ code, label }) => ({ code, label, isActive: true }))
    );

    await pool.query("UPDATE property_types SET label = 'Legacy room', is_active = false WHERE code = 'ROOM'");
    await pool.query("UPDATE amenities SET label = 'Legacy Wi-Fi', is_active = false WHERE code = 'WIFI'");

    const seedPlan = await createRepositoryPlan(4);
    expect(seedPlan.migrations.map(({ version }) => version)).toStrictEqual([5, 6]);
    await executeMigrationPlan(pool, seedPlan);
    await executeMigrationPlan(pool, seedPlan);

    const finalPropertyTypes = await readCatalog("property_types");
    const finalAmenities = await readCatalog("amenities");
    expect(finalPropertyTypes.map(({ id }) => id)).toStrictEqual(initialPropertyTypes.map(({ id }) => id));
    expect(finalAmenities.map(({ id }) => id)).toStrictEqual(initialAmenities.map(({ id }) => id));
    expect(withoutIds(finalPropertyTypes)).toStrictEqual(
      expectedPropertyTypes.map(({ code, label }) => ({ code, label, isActive: code !== "ROOM" }))
    );
    expect(withoutIds(finalAmenities)).toStrictEqual(
      expectedAmenities.map(({ code, label }) => ({ code, label, isActive: code !== "WIFI" }))
    );
  });

  it("fails visibly when a frozen seed label belongs to a different code", async () => {
    await migrateClean();
    await pool.query("UPDATE property_types SET label = 'Temporary room' WHERE code = 'ROOM'");
    await pool.query("UPDATE property_types SET label = 'Room' WHERE code = 'STUDIO'");

    await expect(executeMigrationPlan(pool, await createRepositoryPlan(4))).rejects.toMatchObject({
      failedMigration: { version: 5 },
      lastSuccessfulMigration: null
    });

    const rows = await pool.query<{ code: string; label: string }>(
      "SELECT code, label FROM property_types WHERE code IN ('ROOM', 'STUDIO') ORDER BY code"
    );
    expect(rows.rows).toStrictEqual([
      { code: "ROOM", label: "Temporary room" },
      { code: "STUDIO", label: "Room" }
    ]);
  });

  it("rolls back one failed file, preserves prior commits, and skips later files", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "rentmate-rm005-rollback-"));
    temporaryDirectories.push(directory);
    await writeFile(
      path.join(directory, "0001_create_committed_fixture.sql"),
      "CREATE TABLE rm005_committed_fixture (id integer PRIMARY KEY);",
      "utf8"
    );
    await writeFile(
      path.join(directory, "0002_create_then_fail.sql"),
      `
        CREATE TABLE rm005_rolled_back_fixture (id integer PRIMARY KEY);
        SELECT * FROM rm005_missing_fixture;
      `,
      "utf8"
    );
    await writeFile(
      path.join(directory, "0003_create_skipped_fixture.sql"),
      "CREATE TABLE rm005_skipped_fixture (id integer PRIMARY KEY);",
      "utf8"
    );

    await expect(
      executeMigrationPlan(pool, createMigrationPlan("clean", await discoverMigrations(directory)))
    ).rejects.toMatchObject({
      failedMigration: { version: 2 },
      lastSuccessfulMigration: { version: 1 }
    });

    const relations = await pool.query<{ name: string; relation: string | null }>(
      `
        SELECT requested.name, to_regclass('public.' || requested.name)::text AS relation
        FROM unnest($1::text[]) AS requested(name)
        ORDER BY requested.name
      `,
      [["rm005_committed_fixture", "rm005_rolled_back_fixture", "rm005_skipped_fixture"]]
    );
    expect(relations.rows).toStrictEqual([
      { name: "rm005_committed_fixture", relation: "rm005_committed_fixture" },
      { name: "rm005_rolled_back_fixture", relation: null },
      { name: "rm005_skipped_fixture", relation: null }
    ]);
  });
});
