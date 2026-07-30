import { Pool, type PoolConfig } from "pg";
import type { BackendConfig } from "../config/env.js";
import type { Logger } from "../shared/logging/logger.js";

export function createDatabasePool(config: BackendConfig["database"], logger: Logger): Pool {
  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: 5_000
  };

  const pool = new Pool(poolConfig);

  pool.on("error", (error) => {
    logger.error("Unexpected idle PostgreSQL pool error", {
      errorType: error.name
    });
  });

  return pool;
}

export async function checkDatabaseConnection(pool: Pool): Promise<void> {
  await pool.query("SELECT 1");
}

export async function closeDatabasePool(pool: Pool): Promise<void> {
  await pool.end();
}
