import { readFile } from "node:fs/promises";
import { parseMigrationFilename } from "./discovery.js";
import {
  MigrationExecutionError,
  MigrationExecutionInputError,
  type MigrationExecutionResult,
  type MigrationFile,
  type MigrationPlan
} from "./types.js";

export interface MigrationClient {
  query(sql: string): Promise<unknown>;
  release(): void;
}

export interface MigrationPool {
  connect(): Promise<MigrationClient>;
}

function validateExecutionPlan(plan: MigrationPlan): void {
  if (plan.mode === "clean" && plan.appliedVersion !== null) {
    throw new MigrationExecutionInputError("Clean migration plan must not have an applied version");
  }

  if (plan.mode === "existing" && !Number.isInteger(plan.appliedVersion)) {
    throw new MigrationExecutionInputError("Existing migration plan requires an applied version");
  }

  let previousVersion = plan.appliedVersion ?? 0;
  for (const migration of plan.migrations) {
    let parsed;

    try {
      parsed = parseMigrationFilename(migration.filename);
    } catch {
      throw new MigrationExecutionInputError("Migration plan contains an invalid filename");
    }

    if (parsed.version !== migration.version) {
      throw new MigrationExecutionInputError("Migration plan contains mismatched filename metadata");
    }

    if (migration.version <= previousVersion) {
      throw new MigrationExecutionInputError("Migration plan versions must be strictly increasing");
    }

    previousVersion = migration.version;
  }
}

async function rollbackMigration(client: MigrationClient): Promise<boolean> {
  try {
    await client.query("ROLLBACK");
    return false;
  } catch {
    return true;
  }
}

export async function executeMigrationPlan(
  pool: MigrationPool,
  plan: MigrationPlan
): Promise<MigrationExecutionResult> {
  validateExecutionPlan(plan);

  const completedMigrations: MigrationFile[] = [];

  for (const migration of plan.migrations) {
    let client: MigrationClient;

    try {
      client = await pool.connect();
    } catch {
      throw new MigrationExecutionError(migration, completedMigrations.at(-1) ?? null, false);
    }

    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const sql = await readFile(migration.path, "utf8");
      if (!sql.trim()) {
        throw new MigrationExecutionInputError("Migration SQL file must not be empty");
      }

      await client.query(sql);
      await client.query("COMMIT");
      completedMigrations.push(migration);
    } catch {
      const rollbackFailed = transactionStarted ? await rollbackMigration(client) : false;
      throw new MigrationExecutionError(migration, completedMigrations.at(-1) ?? null, rollbackFailed);
    } finally {
      client.release();
    }
  }

  return {
    completedMigrations,
    lastSuccessfulMigration: completedMigrations.at(-1) ?? null
  };
}
