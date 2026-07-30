import { EnvironmentConfigurationError, loadEnvironment } from "../../config/env.js";
import { closeDatabasePool, createDatabasePool } from "../pool.js";
import { createLogger } from "../../shared/logging/logger.js";
import { SchemaVerificationError, verifyFinalSchema } from "./verify-final-schema.js";

async function runSchemaVerificationCommand(): Promise<void> {
  if (process.argv.slice(2).length > 0) {
    throw new SchemaVerificationError(["db:verify does not accept command-line arguments"]);
  }

  const config = loadEnvironment();
  const logger = createLogger(config.logLevel);
  const pool = createDatabasePool(config.database, logger);

  try {
    const result = await verifyFinalSchema(pool);
    logger.info("Final database schema verified", {
      enumCount: result.enumCount,
      tableCount: result.tableCount,
      constraintCount: result.constraintCount,
      explicitIndexCount: result.explicitIndexCount,
      propertyTypeCount: result.propertyTypeCount,
      amenityCount: result.amenityCount
    });
  } finally {
    await closeDatabasePool(pool);
  }
}

void runSchemaVerificationCommand().catch((error: unknown) => {
  const logger = createLogger("info");

  if (error instanceof SchemaVerificationError || error instanceof EnvironmentConfigurationError) {
    logger.error("Final database schema verification failed", {
      reason: error.message
    });
  } else {
    logger.error("Final database schema verification failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }

  process.exitCode = 1;
});
