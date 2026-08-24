import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";

const migrationDirectory = path.resolve(process.cwd(), "migrations");

describe("PROFILE IDENTITY data-foundation inventory", () => {
  it("adds only compatibility migration 0013 after the frozen MVP inventory", async () => {
    const migrations = await discoverMigrations(migrationDirectory);
    expect(migrations.at(-1)).toMatchObject({ version: 13, filename: "0013_add_user_display_name.sql" });
    expect(
      createMigrationPlan("existing", migrations, { appliedVersion: 12 }).migrations.map(({ filename }) => filename)
    ).toStrictEqual(["0013_add_user_display_name.sql"]);
  });

  it("keeps the compatibility column nullable and constrained without defaults, indexes, or idempotent DDL", async () => {
    const sql = await readFile(path.resolve(migrationDirectory, "0013_add_user_display_name.sql"), "utf8");
    expect(sql).toMatch(/ADD COLUMN display_name varchar\(120\)/i);
    expect(sql).toMatch(/ADD CONSTRAINT ck_users_display_name CHECK/i);
    expect(sql).toMatch(/display_name IS NULL/i);
    expect(sql).toMatch(/display_name = btrim\(display_name\)/i);
    expect(sql).not.toMatch(/NOT NULL|DEFAULT|CREATE\s+(?:UNIQUE\s+)?INDEX|IF\s+NOT\s+EXISTS|TRIGGER/i);
  });
});
