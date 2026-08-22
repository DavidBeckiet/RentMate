import { EnvironmentConfigurationError, loadEnvironment } from "../shared/src/runtime/config/env.js";
import { closeDatabasePool, createPostgresPool } from "../shared/src/runtime/db/pool.js";
import { createLogger } from "../shared/src/runtime/shared/logging/logger.js";
import { applyDatabaseOverrides } from "../shared/database-overrides.js";

interface LegacyUserRow {
  readonly id: number;
  readonly role: "TENANT" | "LANDLORD" | "ADMIN";
  readonly email: string;
  readonly phone_e164: string | null;
  readonly password_hash: string;
  readonly is_active: boolean;
  readonly created_at: Date;
  readonly updated_at: Date;
}

function hasApplyFlag(): boolean {
  return process.argv.includes("--apply");
}

async function backfill(): Promise<void> {
  applyDatabaseOverrides("IDENTITY");
  process.env.PORT = process.env.IDENTITY_SERVICE_PORT ?? "4100";
  const config = loadEnvironment();
  const legacyDatabaseName = process.env.LEGACY_DB_NAME ?? "rentmate";
  if (config.database.database === legacyDatabaseName) {
    throw new Error("Identity target database must differ from LEGACY_DB_NAME.");
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
    const sourceResult = await legacyClient.query<LegacyUserRow>({
      text: `
        SELECT id, role, email, phone_e164, password_hash, is_active, created_at, updated_at
        FROM users
        ORDER BY id ASC
      `,
      values: []
    });

    logger.info("Identity backfill planned", {
      sourceDatabase: legacyDatabaseName,
      targetDatabase: config.database.database,
      userCount: sourceResult.rows.length,
      apply: hasApplyFlag()
    });

    if (!hasApplyFlag()) {
      return;
    }

    await targetClient.query("BEGIN");
    for (const user of sourceResult.rows) {
      await targetClient.query({
        text: `
          INSERT INTO users (
            id, role, email, phone_e164, password_hash, is_active, created_at, updated_at
          )
          OVERRIDING SYSTEM VALUE
          VALUES ($1, $2::user_role, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            role = EXCLUDED.role,
            email = EXCLUDED.email,
            phone_e164 = EXCLUDED.phone_e164,
            password_hash = EXCLUDED.password_hash,
            is_active = EXCLUDED.is_active,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        values: [
          user.id,
          user.role,
          user.email,
          user.phone_e164,
          user.password_hash,
          user.is_active,
          user.created_at,
          user.updated_at
        ]
      });
    }
    await targetClient.query({
      text: `
        SELECT setval(
          pg_get_serial_sequence('users', 'id'),
          COALESCE(MAX(id), 1),
          MAX(id) IS NOT NULL
        )
        FROM users
      `,
      values: []
    });
    await targetClient.query("COMMIT");
    logger.info("Identity backfill completed", { userCount: sourceResult.rows.length });
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
    logger.error("Identity backfill configuration failed", { reason: error.message });
  } else {
    logger.error("Identity backfill failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }
  process.exitCode = 1;
});
