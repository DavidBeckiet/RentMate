import { EnvironmentConfigurationError, loadEnvironment } from "../../config/env.js";
import { closeDatabasePool, createPostgresPool } from "../pool.js";
import { createLogger } from "../../shared/logging/logger.js";
import { AdminProvisioningInputError, readAdminProvisioningInput } from "./input.js";
import { AdminProvisioningConflictError, AdminProvisioningError, provisionAdmin } from "./provision-admin.js";

async function runAdminProvisioningCommand(): Promise<void> {
  if (process.argv.slice(2).length > 0) {
    throw new AdminProvisioningInputError("Admin provisioning does not accept command-line arguments.");
  }

  const config = loadEnvironment();
  const input = readAdminProvisioningInput();
  const logger = createLogger(config.logLevel);
  const pool = createPostgresPool(config.database, logger);

  try {
    const result = await provisionAdmin(pool, input);
    logger.info("Controlled admin provisioning completed", {
      outcome: result.outcome,
      userId: result.userId
    });
  } finally {
    await closeDatabasePool(pool);
  }
}

void runAdminProvisioningCommand().catch((error: unknown) => {
  const logger = createLogger("info");

  if (
    error instanceof AdminProvisioningInputError ||
    error instanceof AdminProvisioningConflictError ||
    error instanceof AdminProvisioningError ||
    error instanceof EnvironmentConfigurationError
  ) {
    logger.error("Controlled admin provisioning failed", {
      reason: error.message
    });
  } else {
    logger.error("Controlled admin provisioning failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }

  process.exitCode = 1;
});
