import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  createIdentityMigrationPlan,
  discoverIdentityMigrations,
  executeIdentityMigrationPlan,
  IdentityMigrationError,
  IdentityMigrationExecutionError,
  parseIdentityDeploymentVersionRecord,
  parseIdentityMigrationCommand,
  type IdentityMigrationClient
} from "../src/migrations/runner.js";

const temporaryDirectories: string[] = [];

async function migrationDirectory(files: Readonly<Record<string, string>>): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "rentmate-identity-migrations-"));
  temporaryDirectories.push(directory);
  await Promise.all(
    Object.entries(files).map(([filename, sql]) => writeFile(path.join(directory, filename), sql, "utf8"))
  );
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("clean and existing plans select explicit deterministic Identity versions", async () => {
  const directory = await migrationDirectory({
    "0003_third.sql": "SELECT 3;",
    "0001_first.sql": "SELECT 1;",
    "0002_second.sql": "SELECT 2;"
  });
  const migrations = await discoverIdentityMigrations(directory);

  assert.deepEqual(
    migrations.map(({ version, filename }) => ({ version, filename })),
    [
      { version: 1, filename: "0001_first.sql" },
      { version: 2, filename: "0002_second.sql" },
      { version: 3, filename: "0003_third.sql" }
    ]
  );
  assert.deepEqual(
    createIdentityMigrationPlan("clean", migrations).migrations.map(({ version }) => version),
    [1, 2, 3]
  );
  assert.deepEqual(
    createIdentityMigrationPlan("existing", migrations, { appliedVersion: 2 }).migrations.map(({ version }) => version),
    [3]
  );
});

test("command and deployment records require explicit valid version selection", () => {
  assert.deepEqual(parseIdentityMigrationCommand(["clean", "--plan-only"]), {
    mode: "clean",
    manifestPath: null,
    planOnly: true
  });
  assert.deepEqual(parseIdentityMigrationCommand(["existing", "--manifest", "identity-version.json"]), {
    mode: "existing",
    manifestPath: "identity-version.json",
    planOnly: false
  });
  assert.deepEqual(parseIdentityDeploymentVersionRecord({ appliedVersion: 2 }), { appliedVersion: 2 });
  assert.throws(() => parseIdentityMigrationCommand([]), IdentityMigrationError);
  assert.throws(() => parseIdentityMigrationCommand(["existing"]), /requires --manifest/);
  assert.throws(() => parseIdentityDeploymentVersionRecord({ appliedVersion: 2, extra: true }), IdentityMigrationError);
});

test("inventory gaps and version mismatches fail instead of selecting an ambiguous plan", async () => {
  const directory = await migrationDirectory({
    "0001_first.sql": "SELECT 1;",
    "0003_third.sql": "SELECT 3;"
  });
  await assert.rejects(() => discoverIdentityMigrations(directory), /contiguous from 0001/);
});

test("a partial execution failure rolls back the failed migration and is never reported as success", async () => {
  const directory = await migrationDirectory({
    "0001_first.sql": "SELECT 1;",
    "0002_second.sql": "SELECT fail_second;"
  });
  const events: string[] = [];
  const clients: IdentityMigrationClient[] = [1, 2].map((clientNumber) => ({
    async query(sql: string) {
      events.push(`${clientNumber}:${sql.trim()}`);
      if (sql.includes("fail_second")) throw new Error("private database detail");
    },
    release() {
      events.push(`${clientNumber}:release`);
    }
  }));
  const pool = {
    async connect() {
      const client = clients.shift();
      if (!client) throw new Error("unexpected connection");
      return client;
    }
  };

  const error = await executeIdentityMigrationPlan(
    pool,
    createIdentityMigrationPlan("clean", await discoverIdentityMigrations(directory))
  ).catch((caught: unknown) => caught);

  assert.ok(error instanceof IdentityMigrationExecutionError);
  assert.equal(error.failedMigration.version, 2);
  assert.equal(error.lastSuccessfulMigration?.version, 1);
  assert.equal(error.rollbackFailed, false);
  assert.match(error.message, /last successful migration: 1/);
  assert.doesNotMatch(error.message, /private database detail/);
  assert.ok(events.includes("2:ROLLBACK"));
  assert.ok(events.includes("1:release"));
  assert.ok(events.includes("2:release"));
});
