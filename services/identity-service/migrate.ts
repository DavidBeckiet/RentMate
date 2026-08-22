import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { applyDatabaseOverrides } from "../shared/database-overrides.js";
import { EnvironmentConfigurationError, loadEnvironment } from "../shared/src/runtime/config/env.js";
import { closeDatabasePool, createPostgresPool } from "../shared/src/runtime/db/pool.js";
import { createLogger } from "../shared/src/runtime/shared/logging/logger.js";

async function migrate(): Promise<void> {
  applyDatabaseOverrides("IDENTITY");
  process.env.PORT = process.env.IDENTITY_SERVICE_PORT ?? "4100";
  const config = loadEnvironment();
  const logger = createLogger(config.logLevel);
  const pool = createPostgresPool(config.database, logger);
  const migrationsDirectory = __dirname;
  const migrationFiles = (await readdir(path.join(migrationsDirectory, "migrations")))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const migrationFile of migrationFiles) {
      const sql = await readFile(path.join(migrationsDirectory, "migrations", migrationFile), "utf8");
      await client.query(sql);
      logger.info("Identity migration applied", { migrationFile });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await closeDatabasePool(pool);
  }
}

void migrate().catch((error: unknown) => {
  const logger = createLogger("info");
  if (error instanceof EnvironmentConfigurationError) {
    logger.error("Identity migration configuration failed", { reason: error.message });
  } else {
    logger.error("Identity migration failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }
  process.exitCode = 1;
});
