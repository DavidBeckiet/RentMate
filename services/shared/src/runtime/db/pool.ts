import { Pool, type PoolConfig } from "pg";
import type { RuntimeConfig } from "../config/env.js";
import type { Logger } from "../shared/logging/logger.js";

export type PostgresPoolFactory = (config: RuntimeConfig["database"], logger: Logger) => Pool;

export class DatabaseConnectionError extends Error {
  constructor() {
    super("PostgreSQL connection failed.");
    this.name = "DatabaseConnectionError";
  }
}

export class RuntimePoolStateError extends Error {
  constructor() {
    super("The runtime PostgreSQL pool is already closed.");
    this.name = "RuntimePoolStateError";
  }
}

export function buildPostgresPoolConfig(config: RuntimeConfig["database"]): PoolConfig {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.max,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    application_name: "rentmate-service",
    options: "-c timezone=UTC"
  };
}

export function createPostgresPool(config: RuntimeConfig["database"], logger: Logger): Pool {
  const pool = new Pool(buildPostgresPoolConfig(config));

  pool.on("error", (error) => {
    logger.error("Unexpected idle PostgreSQL pool error", {
      errorType: error.name
    });
  });

  return pool;
}

export async function checkDatabaseConnection(pool: Pick<Pool, "query">): Promise<void> {
  try {
    await pool.query({
      text: "SELECT 1",
      values: []
    });
  } catch {
    throw new DatabaseConnectionError();
  }
}

export async function closeDatabasePool(pool: Pool): Promise<void> {
  await pool.end();
}

export interface RuntimePoolManager {
  getPool(config: RuntimeConfig["database"], logger: Logger): Pool;
  close(): Promise<void>;
}

export function createRuntimePoolManager(poolFactory: PostgresPoolFactory = createPostgresPool): RuntimePoolManager {
  let pool: Pool | undefined;
  let closePromise: Promise<void> | undefined;
  let closed = false;

  return {
    getPool(config, logger) {
      if (closed) {
        throw new RuntimePoolStateError();
      }

      pool ??= poolFactory(config, logger);
      return pool;
    },
    close() {
      if (closePromise) {
        return closePromise;
      }

      closed = true;
      closePromise = pool ? closeDatabasePool(pool) : Promise.resolve();
      return closePromise;
    }
  };
}

const runtimePoolManager = createRuntimePoolManager();

export function getRuntimePool(config: RuntimeConfig["database"], logger: Logger): Pool {
  return runtimePoolManager.getPool(config, logger);
}

export function closeRuntimePool(): Promise<void> {
  return runtimePoolManager.close();
}
