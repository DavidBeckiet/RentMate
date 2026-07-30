import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeMigrationPlan, type MigrationClient, type MigrationPool } from "../../src/db/migrations/execution.js";
import {
  MigrationExecutionError,
  MigrationExecutionInputError,
  type MigrationFile,
  type MigrationPlan
} from "../../src/db/migrations/types.js";

class FakeMigrationClient implements MigrationClient {
  readonly queries: string[] = [];
  releaseCount = 0;

  constructor(private readonly failingSql: string | null = null) {}

  async query(sql: string): Promise<unknown> {
    this.queries.push(sql);

    if (this.failingSql && sql.includes(this.failingSql)) {
      throw new Error("private database detail");
    }

    return {};
  }

  release(): void {
    this.releaseCount += 1;
  }
}

class FakeMigrationPool implements MigrationPool {
  connectCount = 0;

  constructor(private readonly clients: FakeMigrationClient[]) {}

  async connect(): Promise<MigrationClient> {
    const client = this.clients[this.connectCount];
    this.connectCount += 1;

    if (!client) {
      throw new Error("No fake client configured");
    }

    return client;
  }
}

const temporaryDirectories: string[] = [];

async function migrationFile(version: number, description: string, sql: string): Promise<MigrationFile> {
  const directory = await mkdtemp(path.join(tmpdir(), "rentmate-rm004-execution-"));
  temporaryDirectories.push(directory);
  const prefix = String(version).padStart(4, "0");
  const filename = `${prefix}_${description}.sql`;
  const migrationPath = path.join(directory, filename);
  await writeFile(migrationPath, sql, "utf8");

  return {
    version,
    filename,
    path: migrationPath
  };
}

function cleanPlan(migrations: readonly MigrationFile[]): MigrationPlan {
  return {
    mode: "clean",
    appliedVersion: null,
    highestRepositoryVersion: migrations.at(-1)?.version ?? null,
    migrations
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("migration execution", () => {
  it("uses one transaction and releases one client per migration", async () => {
    const migrations = [await migrationFile(1, "first", "SELECT 1;"), await migrationFile(2, "second", "SELECT 2;")];
    const clients = [new FakeMigrationClient(), new FakeMigrationClient()];
    const pool = new FakeMigrationPool(clients);

    const result = await executeMigrationPlan(pool, cleanPlan(migrations));

    expect(result.completedMigrations).toStrictEqual(migrations);
    expect(pool.connectCount).toBe(2);
    expect(clients[0]?.queries).toStrictEqual(["BEGIN", "SELECT 1;", "COMMIT"]);
    expect(clients[1]?.queries).toStrictEqual(["BEGIN", "SELECT 2;", "COMMIT"]);
    expect(clients.map(({ releaseCount }) => releaseCount)).toStrictEqual([1, 1]);
  });

  it("rolls back, releases the client, reports progress, and stops after failure", async () => {
    const migrations = [
      await migrationFile(1, "first", "SELECT 1;"),
      await migrationFile(2, "failing", "SELECT FAIL_PRIVATE;"),
      await migrationFile(3, "must_not_run", "SELECT 3;")
    ];
    const clients = [new FakeMigrationClient(), new FakeMigrationClient("FAIL_PRIVATE")];
    const pool = new FakeMigrationPool(clients);

    let failure: MigrationExecutionError | undefined;
    try {
      await executeMigrationPlan(pool, cleanPlan(migrations));
    } catch (error) {
      if (error instanceof MigrationExecutionError) {
        failure = error;
      } else {
        throw error;
      }
    }

    expect(failure?.failedMigration.version).toBe(2);
    expect(failure?.lastSuccessfulMigration?.version).toBe(1);
    expect(failure?.message).not.toContain("FAIL_PRIVATE");
    expect(failure?.message).not.toContain("private database detail");
    expect(clients[1]?.queries).toStrictEqual(["BEGIN", "SELECT FAIL_PRIVATE;", "ROLLBACK"]);
    expect(clients.map(({ releaseCount }) => releaseCount)).toStrictEqual([1, 1]);
    expect(pool.connectCount).toBe(2);
  });

  it("rejects invalid execution order before checking out a client", async () => {
    const migrations = [await migrationFile(2, "second", "SELECT 2;"), await migrationFile(1, "first", "SELECT 1;")];
    const pool = new FakeMigrationPool([]);

    await expect(executeMigrationPlan(pool, cleanPlan(migrations))).rejects.toThrowError(MigrationExecutionInputError);
    expect(pool.connectCount).toBe(0);
  });
});
