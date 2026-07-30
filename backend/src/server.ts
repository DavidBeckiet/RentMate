import { createServer, type Server } from "node:http";
import { createApp } from "./app.js";
import { EnvironmentConfigurationError, loadEnvironment } from "./config/env.js";
import { checkDatabaseConnection, closeDatabasePool, createDatabasePool } from "./db/pool.js";
import { createLogger } from "./shared/logging/logger.js";
import { createShutdownHandler } from "./shutdown.js";

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port);
  });
}

async function startBackend(): Promise<void> {
  let config;

  try {
    config = loadEnvironment();
  } catch (error) {
    const logger = createLogger("info");
    logger.error("Backend configuration validation failed", {
      reason: error instanceof EnvironmentConfigurationError ? error.message : "Unexpected configuration error"
    });
    process.exitCode = 1;
    return;
  }

  const logger = createLogger(config.logLevel);
  const databasePool = createDatabasePool(config.database, logger);
  const app = createApp({
    frontendOrigin: config.frontendOrigin,
    logger,
    checkDatabaseConnection: () => checkDatabaseConnection(databasePool)
  });
  const server = createServer(app);

  try {
    await listen(server, config.port);
  } catch (error) {
    logger.error("Backend startup failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });

    try {
      await closeDatabasePool(databasePool);
    } catch {
      logger.error("PostgreSQL pool cleanup failed after startup error");
    }

    process.exitCode = 1;
    return;
  }

  logger.info("Backend started", {
    nodeEnvironment: config.nodeEnv,
    port: config.port
  });

  const shutdown = createShutdownHandler({
    server,
    closeDatabase: () => closeDatabasePool(databasePool),
    logger
  });
  const handleSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal).catch(() => {
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  void checkDatabaseConnection(databasePool)
    .then(() => {
      logger.info("PostgreSQL connection verified");
    })
    .catch(() => {
      logger.warn("PostgreSQL is unavailable");
    });
}

void startBackend();
