import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { EnvironmentConfigurationError, loadEnvironment } from "../shared/src/runtime/config/env.js";
import { closeDatabasePool, createPostgresPool } from "../shared/src/runtime/db/pool.js";
import { createLogger } from "../shared/src/runtime/shared/logging/logger.js";
import { applyDatabaseOverrides } from "../shared/database-overrides.js";

async function migrate(): Promise<void> {
  applyDatabaseOverrides("LISTING");
  process.env.PORT = process.env.LISTING_SERVICE_PORT ?? "4200";
  const config = loadEnvironment();
  const logger = createLogger(config.logLevel);
  const pool = createPostgresPool(config.database, logger);
  const migrationFiles = (await readdir(path.join(__dirname, "migrations")))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    for (const migrationFile of migrationFiles) {
      await client.query(await readFile(path.join(__dirname, "migrations", migrationFile), "utf8"));
      logger.info("Listing migration applied", { migrationFile });
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
    logger.error("Listing migration configuration failed", { reason: error.message });
  } else {
    logger.error("Listing migration failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }
  process.exitCode = 1;
});
