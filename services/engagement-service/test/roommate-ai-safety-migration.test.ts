import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createMigrationRunner } from "../../shared/src/runtime/migrations/migration-runner.js";

const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

test("V3 safety migration is one forward Engagement table with only bounded metadata", async () => {
  const migrations = await createMigrationRunner("Engagement").discover(migrationsDirectory);
  assert.equal(migrations.at(-1)?.version, 20);
  assert.equal(migrations.at(-1)?.filename, "0020_roommate_ai_safety_analyses.sql");
  const sql = await readFile(path.join(migrationsDirectory, "0020_roommate_ai_safety_analyses.sql"), "utf8");
  for (const required of [
    "CREATE TABLE roommate_message_ai_safety_analyses",
    "UNIQUE (message_id, analysis_version)",
    "REFERENCES roommate_messages (id) ON DELETE CASCADE",
    "idx_roommate_messages_ai_safety_scan",
    "PENDING', 'PROCESSING', 'COMPLETED', 'FAILED",
    "ADVANCE_PAYMENT_REQUEST",
    "SENSITIVE_FINANCIAL_INFO_REQUEST",
    "ck_roommate_message_ai_safety_analyses_lease"
  ]) {
    assert.equal(sql.includes(required), true, required);
  }
  for (const forbidden of ["raw_message", "prompt_body", "provider_response", "tenant_id", "reason_prose"]) {
    assert.equal(sql.includes(forbidden), false, forbidden);
  }
});
