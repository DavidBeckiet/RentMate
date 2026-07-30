import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverMigrations } from "../../src/db/migrations/discovery.js";
import { createMigrationPlan } from "../../src/db/migrations/planning.js";

const migrationDirectory = path.resolve(process.cwd(), "migrations");
const expectedFilenames = [
  "0001_create_enum_types.sql",
  "0002_create_users.sql",
  "0003_create_property_types.sql",
  "0004_create_amenities.sql",
  "0005_seed_property_types.sql",
  "0006_seed_amenities.sql"
] as const;

describe("RM-005 migration inventory", () => {
  it("contains exactly the six ordered RM-005 migration files", async () => {
    const migrations = await discoverMigrations(migrationDirectory);

    expect(migrations.map(({ filename }) => filename)).toStrictEqual(expectedFilenames);
    expect(migrations.map(({ version }) => version)).toStrictEqual([1, 2, 3, 4, 5, 6]);
    expect(createMigrationPlan("clean", migrations).migrations).toStrictEqual(migrations);
    expect(
      createMigrationPlan("existing", migrations, { appliedVersion: 3 }).migrations.map(({ version }) => version)
    ).toStrictEqual([4, 5, 6]);
    expect(createMigrationPlan("existing", migrations, { appliedVersion: 6 }).migrations).toStrictEqual([]);
  });

  it("does not add bookkeeping, idempotent DDL, indexes, or later-task schema", async () => {
    const migrations = await discoverMigrations(migrationDirectory);
    const sql = (await Promise.all(migrations.map((migration) => readFile(migration.path, "utf8")))).join("\n");

    expect(sql).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
    expect(sql).not.toMatch(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i);
    expect(sql).not.toMatch(/\b(?:schema_migrations|migration_history|refresh_tokens|sessions)\b/i);
    expect(sql).not.toMatch(
      /\bCREATE\s+TABLE\s+(?:listings|listing_amenities|listing_images|favorites|moderation_actions)\b/i
    );
  });

  it("keeps application startup separate from migration execution", async () => {
    const [serverSource, appSource] = await Promise.all([
      readFile(path.resolve(process.cwd(), "src", "server.ts"), "utf8"),
      readFile(path.resolve(process.cwd(), "src", "app.ts"), "utf8")
    ]);

    expect(`${serverSource}\n${appSource}`).not.toMatch(
      /\b(?:executeMigrationPlan|runMigrationCommand|migrateClean|migrateExisting)\b/
    );
  });
});
