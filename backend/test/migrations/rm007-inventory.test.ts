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
  "0009_create_listing_amenities.sql",
  "0010_create_favorites.sql",
  "0011_create_moderation_history.sql",
  "0012_create_explicit_indexes.sql"
] as const;
const expectedExplicitIndexes = [
  "idx_listings_status_updated_at",
  "idx_listings_landlord_updated_at",
  "idx_listings_approved_monthly_rent",
  "idx_listings_approved_property_type",
  "idx_listings_approved_room_area",
  "idx_listings_approved_latitude",
  "idx_listings_approved_longitude",
  "idx_listing_amenities_amenity_listing",
  "idx_favorites_tenant_created_at",
  "idx_moderation_history_listing_created_at"
] as const;
const priorMigrationHashes = new Map([
  ["0001_create_enum_types.sql", "c3825e32086bf8f7c714ee6dc0a9ec9597956deec61800dfb3c55da95fd02905"],
  ["0002_create_users.sql", "0ce984306754dab3575cb60bdb9ef6efe6d273533cbab81b0268a1f12660b610"],
  ["0003_create_property_types.sql", "955de020ae29559477a89a1be0b2793184c4434f50f8b7afd2ad0ea4c4e53a20"],
  ["0004_create_amenities.sql", "d234e6c3a78068887a1408549c2f261c967f354809c7e5026ae40bdb2622e519"],
  ["0005_seed_property_types.sql", "a5f371091d983fc2ba8d0d9abd1680e390fdf276cbb66b37a55da49e595c4721"],
  ["0006_seed_amenities.sql", "160142871013b20b1be83ef0b635b966ffb3b33c2acce828415a0f71c90aafb7"],
  ["0007_create_listings.sql", "051d7e9a9b828a234d13730cd41fa3f7e699648956951cc2de53417412799d89"],
  ["0008_create_listing_images.sql", "aa0045d541f18442c887875bb754c643145535d8bac041877cd821c9f9be3a95"],
  ["0009_create_listing_amenities.sql", "0c239fab69f5b091c95499bbc5347a29875147c6f2c5ba59930bb9c0dabc1167"]
]);

function normalizedSha256(contents: string): string {
  return createHash("sha256").update(contents.replace(/\r\n/g, "\n")).digest("hex");
}

function createdObjectNames(sql: string, objectType: "TABLE" | "INDEX"): string[] {
  const pattern = new RegExp(`\\bCREATE\\s+${objectType}\\s+([a-z][a-z0-9_]*)`, "gi");
  return [...sql.matchAll(pattern)].map((match) => match[1]!);
}

async function discoverMvpMigrations() {
  return (await discoverMigrations(migrationDirectory)).filter(({ version }) => version <= 12);
}

describe("RM-007 migration inventory", () => {
  it("contains unique sequential versions 0001 through 0012", async () => {
    const migrations = await discoverMvpMigrations();

    expect(migrations.map(({ filename }) => filename)).toStrictEqual(expectedFilenames);
    expect(migrations.map(({ version }) => version)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(new Set(migrations.map(({ version }) => version)).size).toBe(12);
    expect(migrations.filter(({ version }) => version >= 10).map(({ filename }) => filename)).toStrictEqual(
      expectedFilenames.slice(9)
    );
  });

  it("selects the exact clean and existing-deployment plans", async () => {
    const migrations = await discoverMvpMigrations();

    expect(createMigrationPlan("clean", migrations).migrations.map(({ version }) => version)).toStrictEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
    ]);
    expect(
      createMigrationPlan("existing", migrations, { appliedVersion: 9 }).migrations.map(({ version }) => version)
    ).toStrictEqual([10, 11, 12]);
    expect(
      createMigrationPlan("existing", migrations, { appliedVersion: 10 }).migrations.map(({ version }) => version)
    ).toStrictEqual([11, 12]);
    expect(
      createMigrationPlan("existing", migrations, { appliedVersion: 11 }).migrations.map(({ version }) => version)
    ).toStrictEqual([12]);
    expect(createMigrationPlan("existing", migrations, { appliedVersion: 12 }).migrations).toStrictEqual([]);
  });

  it("preserves migrations 0001 through 0009 byte-for-byte after line-ending normalization", async () => {
    const migrations = await discoverMvpMigrations();

    for (const migration of migrations.filter(({ version }) => version <= 9)) {
      const contents = await readFile(migration.path, "utf8");
      expect(normalizedSha256(contents), migration.filename).toBe(priorMigrationHashes.get(migration.filename));
    }
  });

  it("creates only the two RM-007 tables in their owning files", async () => {
    const migrations = await discoverMvpMigrations();
    const favoritesSql = await readFile(migrations.find(({ version }) => version === 10)!.path, "utf8");
    const moderationSql = await readFile(migrations.find(({ version }) => version === 11)!.path, "utf8");

    expect(createdObjectNames(favoritesSql, "TABLE")).toStrictEqual(["favorites"]);
    expect(createdObjectNames(moderationSql, "TABLE")).toStrictEqual(["moderation_history"]);
    expect(createdObjectNames(favoritesSql, "INDEX")).toStrictEqual([]);
    expect(createdObjectNames(moderationSql, "INDEX")).toStrictEqual([]);
  });

  it("creates exactly the ten approved explicit indexes in 0012", async () => {
    const migrations = await discoverMvpMigrations();
    const indexSql = await readFile(migrations.find(({ version }) => version === 12)!.path, "utf8");

    expect(createdObjectNames(indexSql, "INDEX")).toStrictEqual(expectedExplicitIndexes);
    expect(createdObjectNames(indexSql, "TABLE")).toStrictEqual([]);
    expect((indexSql.match(/\bWHERE\s+status\s*=\s*'APPROVED'/gi) ?? []).length).toBe(5);
    expect(indexSql).not.toMatch(/\bUNIQUE\s+INDEX\b/i);
    expect(indexSql).not.toMatch(/\bINCLUDE\s*\(/i);
  });

  it("keeps all migrations free of bookkeeping and RM-007 free of prohibited objects or provisioning", async () => {
    const migrations = await discoverMvpMigrations();
    const allSql = (
      await Promise.all(migrations.map(({ path: migrationPath }) => readFile(migrationPath, "utf8")))
    ).join("\n");
    const rm007Sql = (
      await Promise.all(
        migrations
          .filter(({ version }) => version >= 10)
          .map(({ path: migrationPath }) => readFile(migrationPath, "utf8"))
      )
    ).join("\n");

    expect(allSql).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
    expect(allSql).not.toMatch(/\b(?:schema_migrations|migration_history|knex_migrations)\b/i);
    expect(rm007Sql).not.toMatch(/\bINSERT\s+INTO\s+users\b/i);
    expect(rm007Sql).not.toMatch(
      /\b(?:TRIGGER|PROCEDURE|CREATE\s+FUNCTION|POSTGIS|spatial_ref_sys|sessions|refresh_tokens|bcrypt)\b/i
    );
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
