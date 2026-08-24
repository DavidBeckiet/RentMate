import path from "node:path";
import { applyDatabaseOverrides } from "../shared/database-overrides.js";
import { EnvironmentConfigurationError, loadEnvironment } from "../shared/src/runtime/config/env.js";
import { closeDatabasePool, createPostgresPool } from "../shared/src/runtime/db/pool.js";
import { createLogger } from "../shared/src/runtime/shared/logging/logger.js";
import {
  createIdentityMigrationPlan,
  discoverIdentityMigrations,
  executeIdentityMigrationPlan,
  IdentityMigrationError,
  IdentityMigrationExecutionError,
  parseIdentityMigrationCommand,
  readIdentityDeploymentVersionRecord,
  type IdentityDeploymentVersionRecord,
  type IdentityMigrationPlan
} from "./src/migrations/runner.js";

function logPlan(plan: IdentityMigrationPlan): void {
  const logger = createLogger("info");
  logger.info("Identity migration plan prepared", {
    mode: plan.mode,
    appliedVersion: plan.appliedVersion,
    highestRepositoryVersion: plan.highestRepositoryVersion,
    selectedCount: plan.migrations.length
  });
  for (const migration of plan.migrations) {
    logger.info("Identity migration selected", {
      version: migration.version,
      filename: migration.filename
    });
  }
}

async function migrate(): Promise<void> {
  applyDatabaseOverrides("IDENTITY");
  process.env.PORT = process.env.IDENTITY_SERVICE_PORT ?? "4100";
  const command = parseIdentityMigrationCommand(process.argv.slice(2));
  const migrationsDirectory = path.resolve(__dirname, "migrations");
  const migrations = await discoverIdentityMigrations(migrationsDirectory);
  const invocationDirectory = process.env.INIT_CWD || process.cwd();
  let deploymentRecord: IdentityDeploymentVersionRecord | undefined;
  if (command.manifestPath) {
    deploymentRecord = await readIdentityDeploymentVersionRecord(
      path.resolve(invocationDirectory, command.manifestPath)
    );
  }
  const plan = createIdentityMigrationPlan(command.mode, migrations, deploymentRecord);
  logPlan(plan);

  if (command.planOnly || plan.migrations.length === 0) return;

  const config = loadEnvironment();
  const logger = createLogger(config.logLevel);
  const pool = createPostgresPool(config.database, logger);
  try {
    const completed = await executeIdentityMigrationPlan(pool, plan);
    logger.info("Identity migration plan completed", {
      completedCount: completed.length,
      lastSuccessfulVersion: completed.at(-1)?.version ?? null
    });
  } finally {
    await closeDatabasePool(pool);
  }
}

void migrate().catch((error: unknown) => {
  const logger = createLogger("info");
  if (error instanceof EnvironmentConfigurationError) {
    logger.error("Identity migration configuration failed", { reason: error.message });
  } else if (error instanceof IdentityMigrationExecutionError) {
    logger.error("Identity migration execution failed", {
      failedVersion: error.failedMigration.version,
      failedFilename: error.failedMigration.filename,
      lastSuccessfulVersion: error.lastSuccessfulMigration?.version ?? null,
      rollbackFailed: error.rollbackFailed
    });
  } else if (error instanceof IdentityMigrationError) {
    logger.error("Identity migration command validation failed", { reason: error.message });
  } else {
    logger.error("Identity migration failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }
  process.exitCode = 1;
});
