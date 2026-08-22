import { EnvironmentConfigurationError, loadEnvironment } from "../shared/src/runtime/config/env.js";
import { closeDatabasePool, createPostgresPool } from "../shared/src/runtime/db/pool.js";
import { createLogger } from "../shared/src/runtime/shared/logging/logger.js";
import { applyDatabaseOverrides } from "../shared/database-overrides.js";

function hasApplyFlag(): boolean {
  return process.argv.includes("--apply");
}

async function backfill(): Promise<void> {
  applyDatabaseOverrides("ENGAGEMENT");
  process.env.PORT = process.env.ENGAGEMENT_SERVICE_PORT ?? "4300";
  const config = loadEnvironment();
  const legacyDatabaseName = process.env.LEGACY_DB_NAME ?? "rentmate";
  if (config.database.database === legacyDatabaseName) {
    throw new Error("Engagement target database must differ from LEGACY_DB_NAME.");
  }

  const logger = createLogger(config.logLevel);
  const targetPool = createPostgresPool(config.database, logger);
  const legacyPool = createPostgresPool(
    {
      ...config.database,
      host: process.env.LEGACY_DB_HOST ?? config.database.host,
      port: Number(process.env.LEGACY_DB_PORT ?? config.database.port),
      database: legacyDatabaseName,
      user: process.env.LEGACY_DB_USER ?? config.database.user,
      password: process.env.LEGACY_DB_PASSWORD ?? config.database.password
    },
    logger
  );
  const legacyClient = await legacyPool.connect();
  const targetClient = await targetPool.connect();

  try {
    const sourceResult = await legacyClient.query({
      text: "SELECT tenant_id, listing_id, created_at FROM favorites ORDER BY created_at ASC, tenant_id ASC, listing_id ASC",
      values: []
    });
    logger.info("Engagement backfill planned", {
      sourceDatabase: legacyDatabaseName,
      targetDatabase: config.database.database,
      favoriteCount: sourceResult.rows.length,
      apply: hasApplyFlag()
    });
    if (!hasApplyFlag()) return;

    await targetClient.query("BEGIN");
    for (const row of sourceResult.rows) {
      await targetClient.query({
        text: `
          INSERT INTO favorites (tenant_id, listing_id, created_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (tenant_id, listing_id) DO UPDATE SET created_at = EXCLUDED.created_at
        `,
        values: [row.tenant_id, row.listing_id, row.created_at]
      });
    }
    await targetClient.query("COMMIT");
    logger.info("Engagement backfill completed", { favoriteCount: sourceResult.rows.length });
  } catch (error) {
    await targetClient.query("ROLLBACK");
    throw error;
  } finally {
    legacyClient.release();
    targetClient.release();
    await closeDatabasePool(legacyPool);
    await closeDatabasePool(targetPool);
  }
}

void backfill().catch((error: unknown) => {
  const logger = createLogger("info");
  if (error instanceof EnvironmentConfigurationError) {
    logger.error("Engagement backfill configuration failed", { reason: error.message });
  } else {
    logger.error("Engagement backfill failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }
  process.exitCode = 1;
});
