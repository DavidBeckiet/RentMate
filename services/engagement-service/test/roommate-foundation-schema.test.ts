import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createMigrationRunner } from "../../shared/src/runtime/migrations/migration-runner.js";

const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrationPath = path.join(migrationsDirectory, "0018_roommate_foundation.sql");

test("Engagement migration inventory includes the Roommate foundation as version 0018", async () => {
  const migrations = await createMigrationRunner("Engagement").discover(migrationsDirectory);
  assert.deepEqual(
    migrations.find(({ version }) => version === 18),
    {
      version: 18,
      filename: "0018_roommate_foundation.sql",
      path: migrationPath
    }
  );
  assert.equal(
    createMigrationRunner("Engagement")
      .createPlan("clean", migrations)
      .migrations.some(({ version }) => version === 18),
    true
  );
  assert.deepEqual(
    createMigrationRunner("Engagement").createPlan("existing", migrations, { appliedVersion: 17 }).migrations.at(0)
      ?.version,
    18
  );
});

test("Roommate foundation migration defines four entities and preserves service boundaries", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of ["roommate_profiles", "roommate_requests", "roommate_interests", "roommate_messages"]) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}\\s*\\(`, "iu"));
  }
  assert.equal((sql.match(/CREATE TABLE roommate_/giu) ?? []).length, 4);
  assert.match(sql, /idx_roommate_profiles_moderation/iu);
  assert.match(sql, /uq_roommate_requests_open_owner/iu);
  assert.match(sql, /uq_roommate_interests_accepted_request/iu);
  assert.match(sql, /uq_roommate_interests_accepted_tenant/iu);
  assert.match(sql, /fk_contact_blocks_roommate_request/iu);
  assert.match(sql, /subject_tenant_id/iu);
  assert.doesNotMatch(sql, /roommate_target_tenant_id/iu);
  assert.match(sql, /ROOMMATE_PROFILE/iu);
  assert.match(sql, /ROOMMATE_REQUEST/iu);
  assert.match(sql, /ROOMMATE_MESSAGE/iu);
  assert.match(sql, /ROOMMATE_REQUEST_EXPIRING/iu);
  assert.match(sql, /ROOMMATE_REQUEST_EXPIRED/iu);
  assert.doesNotMatch(sql, /REFERENCES\s+(?:users|listings)\s*\(/iu);
  assert.doesNotMatch(
    sql,
    /CREATE TABLE\s+(?:roommate_match|roommate_groups?|group_members|roommate_preferences|compatibility_scores)/iu
  );
});
