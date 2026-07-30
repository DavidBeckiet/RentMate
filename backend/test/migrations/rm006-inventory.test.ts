import { createHash } from "node:crypto";
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
  "0006_seed_amenities.sql",
  "0007_create_listings.sql",
  "0008_create_listing_images.sql",
  "0009_create_listing_amenities.sql"
] as const;
const rm005Hashes = new Map([
  ["0001_create_enum_types.sql", "c3825e32086bf8f7c714ee6dc0a9ec9597956deec61800dfb3c55da95fd02905"],
  ["0002_create_users.sql", "0ce984306754dab3575cb60bdb9ef6efe6d273533cbab81b0268a1f12660b610"],
  ["0003_create_property_types.sql", "955de020ae29559477a89a1be0b2793184c4434f50f8b7afd2ad0ea4c4e53a20"],
  ["0004_create_amenities.sql", "d234e6c3a78068887a1408549c2f261c967f354809c7e5026ae40bdb2622e519"],
  ["0005_seed_property_types.sql", "a5f371091d983fc2ba8d0d9abd1680e390fdf276cbb66b37a55da49e595c4721"],
  ["0006_seed_amenities.sql", "160142871013b20b1be83ef0b635b966ffb3b33c2acce828415a0f71c90aafb7"]
]);

function normalizedSha256(contents: string): string {
  return createHash("sha256").update(contents.replace(/\r\n/g, "\n")).digest("hex");
}

describe("RM-006 migration inventory", () => {
  it("contains unique sequential versions 0001 through 0009", async () => {
    const migrations = (await discoverMigrations(migrationDirectory)).filter(({ version }) => version <= 9);

    expect(migrations.map(({ filename }) => filename)).toStrictEqual(expectedFilenames);
    expect(migrations.map(({ version }) => version)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(migrations.map(({ version }) => version)).size).toBe(9);
    expect(migrations.filter(({ version }) => version >= 7).map(({ filename }) => filename)).toStrictEqual(
      expectedFilenames.slice(6)
    );
  });

  it("selects the exact clean and existing-deployment plans", async () => {
    const migrations = (await discoverMigrations(migrationDirectory)).filter(({ version }) => version <= 9);

    expect(createMigrationPlan("clean", migrations).migrations.map(({ version }) => version)).toStrictEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9
    ]);
    expect(
      createMigrationPlan("existing", migrations, { appliedVersion: 6 }).migrations.map(({ version }) => version)
    ).toStrictEqual([7, 8, 9]);
    expect(
      createMigrationPlan("existing", migrations, { appliedVersion: 7 }).migrations.map(({ version }) => version)
    ).toStrictEqual([8, 9]);
    expect(
      createMigrationPlan("existing", migrations, { appliedVersion: 8 }).migrations.map(({ version }) => version)
    ).toStrictEqual([9]);
    expect(createMigrationPlan("existing", migrations, { appliedVersion: 9 }).migrations).toStrictEqual([]);
  });

  it("preserves the committed RM-005 migration contents", async () => {
    const migrations = await discoverMigrations(migrationDirectory);

    for (const migration of migrations.filter(({ version }) => version <= 6)) {
      const contents = await readFile(migration.path, "utf8");
      expect(normalizedSha256(contents), migration.filename).toBe(rm005Hashes.get(migration.filename));
    }
  });

  it("keeps RM-006 free of forbidden DDL and later-task objects", async () => {
    const migrations = await discoverMigrations(migrationDirectory);
    const allSql = (
      await Promise.all(migrations.map(({ path: migrationPath }) => readFile(migrationPath, "utf8")))
    ).join("\n");
    const rm006Sql = (
      await Promise.all(
        migrations
          .filter(({ version }) => version >= 7 && version <= 9)
          .map(({ path: migrationPath }) => readFile(migrationPath, "utf8"))
      )
    ).join("\n");

    expect(allSql).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
    expect(allSql).not.toMatch(/\b(?:schema_migrations|migration_history|knex_migrations)\b/i);
    expect(rm006Sql).not.toMatch(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i);
    expect(rm006Sql).not.toMatch(/\bCREATE\s+TABLE\s+(?:favorites|moderation_history)\b/i);
    expect(rm006Sql).not.toMatch(/\b(?:TRIGGER|PROCEDURE|GENERATED\s+ALWAYS\s+AS\s*\()\b/i);
  });

  it("keeps normal application startup separate from migration execution", async () => {
    const [serverSource, appSource] = await Promise.all([
      readFile(path.resolve(process.cwd(), "src", "server.ts"), "utf8"),
      readFile(path.resolve(process.cwd(), "src", "app.ts"), "utf8")
    ]);

    expect(`${serverSource}\n${appSource}`).not.toMatch(
      /\b(?:executeMigrationPlan|runMigrationCommand|migrateClean|migrateExisting)\b/
    );
  });
});
