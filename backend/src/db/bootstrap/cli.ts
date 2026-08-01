import path from "node:path";
import { EnvironmentConfigurationError, loadEnvironment } from "../../config/env.js";
import { AdminProvisioningInputError, readAdminProvisioningInput } from "../admin-provisioning/input.js";
import { AdminProvisioningConflictError, AdminProvisioningError } from "../admin-provisioning/provision-admin.js";
import { closeDatabasePool, createPostgresPool } from "../pool.js";
import { SchemaVerificationError } from "../schema-verification/verify-final-schema.js";
import { createLogger } from "../../shared/logging/logger.js";
import { bootstrapDatabase, DatabaseBootstrapError } from "./bootstrap-database.js";

const migrationsDirectory = path.resolve(__dirname, "../../../migrations");

async function runDatabaseBootstrapCommand(): Promise<void> {
  if (process.argv.slice(2).length > 0) {
    throw new DatabaseBootstrapError("db:bootstrap does not accept command-line arguments.");
  }

  const config = loadEnvironment();
  const adminInput = readAdminProvisioningInput();
  const logger = createLogger(config.logLevel);
  const pool = createPostgresPool(config.database, logger);

  try {
    const result = await bootstrapDatabase({
      pool,
      migrationsDirectory,
      adminInput
    });
    logger.info("Clean database bootstrap completed", {
      appliedMigrationCount: result.appliedMigrationCount,
      lastAppliedMigrationVersion: result.lastAppliedMigrationVersion,
      adminOutcome: result.admin.outcome,
      adminUserId: result.admin.userId
    });
  } finally {
    await closeDatabasePool(pool);
  }
}

void runDatabaseBootstrapCommand().catch((error: unknown) => {
  const logger = createLogger("info");

  if (
    error instanceof DatabaseBootstrapError ||
    error instanceof AdminProvisioningInputError ||
    error instanceof AdminProvisioningConflictError ||
    error instanceof AdminProvisioningError ||
    error instanceof SchemaVerificationError ||
    error instanceof EnvironmentConfigurationError
  ) {
    logger.error("Clean database bootstrap failed", {
      reason: error.message
    });
  } else {
    logger.error("Clean database bootstrap failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }

  process.exitCode = 1;
});
