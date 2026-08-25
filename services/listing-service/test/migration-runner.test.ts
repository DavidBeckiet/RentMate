import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  createMigrationRunner,
  MigrationError,
  MigrationExecutionError,
  type MigrationClient
} from "../../shared/src/runtime/migrations/migration-runner.js";

const temporaryDirectories: string[] = [];
const runner = createMigrationRunner("Listing");

async function migrationDirectory(files: Readonly<Record<string, string>>): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "rentmate-listing-migrations-"));
  temporaryDirectories.push(directory);
  await Promise.all(
    Object.entries(files).map(([filename, sql]) => writeFile(path.join(directory, filename), sql, "utf8"))
  );
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("selects only migrations newer than the external deployment version", async () => {
  const directory = await migrationDirectory({
    "0001_first.sql": "SELECT 1;",
    "0002_second.sql": "SELECT 2;",
    "0003_third.sql": "SELECT 3;"
  });
  const migrations = await runner.discover(directory);

  assert.deepEqual(
    runner.createPlan("existing", migrations, { appliedVersion: 2 }).migrations.map(({ version }) => version),
    [3]
  );
  assert.deepEqual(runner.parseCommand(["existing", "--manifest", "listing-version.json"]), {
    mode: "existing",
    manifestPath: "listing-version.json",
    planOnly: false
  });
});

test("rejects gaps and invalid migration command state", async () => {
  const directory = await migrationDirectory({
    "0001_first.sql": "SELECT 1;",
    "0003_third.sql": "SELECT 3;"
  });

  await assert.rejects(() => runner.discover(directory), /contiguous from 0001/);
  assert.throws(() => runner.parseCommand(["existing"]), MigrationError);
  assert.throws(() => runner.parseDeploymentVersionRecord({ appliedVersion: 2, extra: true }), MigrationError);
});

test("rolls back a failed migration and hides the database error", async () => {
  const directory = await migrationDirectory({
    "0001_first.sql": "SELECT 1;",
    "0002_second.sql": "SELECT fail_second;"
  });
  const events: string[] = [];
  const clients: MigrationClient[] = [1, 2].map((clientNumber) => ({
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

  const error = await runner
    .executePlan(pool, runner.createPlan("clean", await runner.discover(directory)))
    .catch((caught: unknown) => caught);

  assert.ok(error instanceof MigrationExecutionError);
  assert.equal(error.failedMigration.version, 2);
  assert.equal(error.lastSuccessfulMigration?.version, 1);
  assert.equal(error.rollbackFailed, false);
  assert.doesNotMatch(error.message, /private database detail/);
  assert.ok(events.includes("2:ROLLBACK"));
});
