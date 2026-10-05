import { applyDatabaseOverrides } from "../shared/database-overrides.js";
import { EnvironmentConfigurationError, loadEnvironment } from "../shared/src/runtime/config/env.js";
import { closeDatabasePool, createPostgresPool } from "../shared/src/runtime/db/pool.js";
import { createLogger } from "../shared/src/runtime/shared/logging/logger.js";
import { AdminProvisioningInputError, readAdminProvisioningInput } from "./src/admin-provisioning/input.js";
import {
  AdminProvisioningConflictError,
  AdminProvisioningError,
  provisionAdmin
} from "./src/admin-provisioning/provision-admin.js";
import { createPasswordService } from "./src/modules/auth/password.js";

async function runAdminProvisioning(): Promise<void> {
  if (process.argv.slice(2).length > 0) {
    throw new AdminProvisioningInputError("Admin provisioning does not accept command-line arguments.");
  }

  applyDatabaseOverrides("IDENTITY");
  process.env.PORT = process.env.IDENTITY_SERVICE_PORT ?? "4100";
  const config = loadEnvironment();
  const logger = createLogger(config.logLevel);
  const pool = createPostgresPool(config.database, logger);

  try {
    const result = await provisionAdmin(
      pool,
      createPasswordService({ bcryptCost: config.auth.bcryptCost }),
      readAdminProvisioningInput()
    );
    logger.info("Controlled Identity admin provisioning completed", {
      outcome: result.outcome,
      userId: result.userId
    });
  } finally {
    await closeDatabasePool(pool);
  }
}

void runAdminProvisioning().catch((error: unknown) => {
  const logger = createLogger("info");
  const knownError =
    error instanceof AdminProvisioningInputError ||
    error instanceof AdminProvisioningConflictError ||
    error instanceof AdminProvisioningError ||
    error instanceof EnvironmentConfigurationError;
  logger.error("Controlled Identity admin provisioning failed", {
    reason: knownError ? error.message : "Unexpected admin provisioning failure."
  });
  process.exitCode = 1;
});
