import path from "node:path";
import { EnvironmentConfigurationError, loadEnvironment } from "../../config/env.js";
import { closeDatabasePool, createDatabasePool } from "../pool.js";
import { createLogger } from "../../shared/logging/logger.js";
import { parseMigrationCommandArguments, readDeploymentVersionRecord } from "./command.js";
import { discoverMigrations } from "./discovery.js";
import { executeMigrationPlan } from "./execution.js";
import { createMigrationPlan } from "./planning.js";
import {
  MigrationCommandError,
  MigrationDiscoveryError,
  MigrationExecutionError,
  MigrationExecutionInputError,
  MigrationPlanError,
  type DeploymentVersionRecord,
  type MigrationPlan
} from "./types.js";

const migrationsDirectory = path.resolve(__dirname, "../../../migrations");

function logPlan(plan: MigrationPlan): void {
  const logger = createLogger("info");

  logger.info("Migration plan prepared", {
    mode: plan.mode,
    appliedVersion: plan.appliedVersion,
    highestRepositoryVersion: plan.highestRepositoryVersion,
    selectedCount: plan.migrations.length
  });

  for (const migration of plan.migrations) {
    logger.info("Migration selected", {
      version: migration.version,
      filename: migration.filename
    });
  }
}

async function runMigrationCommand(): Promise<void> {
  const command = parseMigrationCommandArguments(process.argv.slice(2));
  const migrations = await discoverMigrations(migrationsDirectory);
  const invocationDirectory = process.env.INIT_CWD || process.cwd();
  let deploymentRecord: DeploymentVersionRecord | undefined;

  if (command.manifestPath) {
    deploymentRecord = await readDeploymentVersionRecord(path.resolve(invocationDirectory, command.manifestPath));
  }

  const plan = createMigrationPlan(command.mode, migrations, deploymentRecord);
  logPlan(plan);

  if (command.planOnly || plan.migrations.length === 0) {
    return;
  }

  const config = loadEnvironment();
  const logger = createLogger(config.logLevel);
  const pool = createDatabasePool(config.database, logger);

  try {
    const result = await executeMigrationPlan(pool, plan);
    logger.info("Migration plan completed", {
      completedCount: result.completedMigrations.length,
      lastSuccessfulVersion: result.lastSuccessfulMigration?.version ?? null
    });
  } finally {
    await closeDatabasePool(pool);
  }
}

void runMigrationCommand().catch((error: unknown) => {
  const logger = createLogger("info");

  if (error instanceof MigrationExecutionError) {
    logger.error("Migration execution failed", {
      failedVersion: error.failedMigration.version,
      failedFilename: error.failedMigration.filename,
      lastSuccessfulVersion: error.lastSuccessfulMigration?.version ?? null,
      rollbackFailed: error.rollbackFailed
    });
  } else if (error instanceof EnvironmentConfigurationError) {
    logger.error("Migration database configuration is invalid", {
      reason: error.message
    });
  } else if (
    error instanceof MigrationCommandError ||
    error instanceof MigrationDiscoveryError ||
    error instanceof MigrationExecutionInputError ||
    error instanceof MigrationPlanError
  ) {
    logger.error("Migration command validation failed", {
      reason: error.message
    });
  } else {
    logger.error("Migration command failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }

  process.exitCode = 1;
});
