import path from "node:path";
import { EnvironmentConfigurationError, loadEnvironment } from "../shared/src/runtime/config/env.js";
import { closeDatabasePool, createPostgresPool } from "../shared/src/runtime/db/pool.js";
import { createLogger } from "../shared/src/runtime/shared/logging/logger.js";
import { applyDatabaseOverrides } from "../shared/database-overrides.js";
import {
  createMigrationRunner,
  MigrationError,
  MigrationExecutionError,
  type MigrationPlan
} from "../shared/src/runtime/migrations/migration-runner.js";

const migrationRunner = createMigrationRunner("Engagement");

function logPlan(plan: MigrationPlan): void {
  const logger = createLogger("info");
  logger.info("Engagement migration plan prepared", {
    mode: plan.mode,
    appliedVersion: plan.appliedVersion,
    highestRepositoryVersion: plan.highestRepositoryVersion,
    selectedCount: plan.migrations.length
  });
  for (const migration of plan.migrations) {
    logger.info("Engagement migration selected", {
      version: migration.version,
      filename: migration.filename
    });
  }
}

async function migrate(): Promise<void> {
  applyDatabaseOverrides("ENGAGEMENT");
  process.env.PORT = process.env.ENGAGEMENT_SERVICE_PORT ?? "4300";
  const command = migrationRunner.parseCommand(process.argv.slice(2));
  const migrationsDirectory = path.resolve(__dirname, "migrations");
  const migrations = await migrationRunner.discover(migrationsDirectory);
  const invocationDirectory = process.env.INIT_CWD || process.cwd();
  const deploymentRecord = command.manifestPath
    ? await migrationRunner.readDeploymentVersionRecord(path.resolve(invocationDirectory, command.manifestPath))
    : undefined;
  const plan = migrationRunner.createPlan(command.mode, migrations, deploymentRecord);
  logPlan(plan);

  if (command.planOnly || plan.migrations.length === 0) return;

  const config = loadEnvironment();
  const logger = createLogger(config.logLevel);
  const pool = createPostgresPool(config.database, logger);

  try {
    const completed = await migrationRunner.executePlan(pool, plan);
    logger.info("Engagement migration plan completed", {
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
    logger.error("Engagement migration configuration failed", { reason: error.message });
  } else if (error instanceof MigrationExecutionError) {
    logger.error("Engagement migration execution failed", {
      failedVersion: error.failedMigration.version,
      failedFilename: error.failedMigration.filename,
      lastSuccessfulVersion: error.lastSuccessfulMigration?.version ?? null,
      rollbackFailed: error.rollbackFailed
    });
  } else if (error instanceof MigrationError) {
    logger.error("Engagement migration command validation failed", { reason: error.message });
  } else {
    logger.error("Engagement migration failed", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
  }
  process.exitCode = 1;
});
