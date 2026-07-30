import {
  MigrationPlanError,
  type DeploymentVersionRecord,
  type MigrationFile,
  type MigrationMode,
  type MigrationPlan
} from "./types.js";
import { sortAndValidateMigrations } from "./discovery.js";

export function parseDeploymentVersionRecord(input: unknown): DeploymentVersionRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new MigrationPlanError("Deployment version record must be a JSON object");
  }

  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "appliedVersion") {
    throw new MigrationPlanError('Deployment version record must contain only the "appliedVersion" field');
  }

  const appliedVersion = (input as { appliedVersion?: unknown }).appliedVersion;
  if (!Number.isInteger(appliedVersion) || (appliedVersion as number) < 1) {
    throw new MigrationPlanError("Deployment appliedVersion must be a positive integer");
  }

  return {
    appliedVersion: appliedVersion as number
  };
}

export function createMigrationPlan(
  mode: MigrationMode,
  repositoryMigrations: readonly MigrationFile[],
  deploymentRecord?: DeploymentVersionRecord
): MigrationPlan {
  const migrations = sortAndValidateMigrations(repositoryMigrations);
  const highestRepositoryVersion = migrations.at(-1)?.version ?? null;

  if (mode === "clean") {
    if (deploymentRecord) {
      throw new MigrationPlanError("Clean deployment mode does not accept a deployment version record");
    }

    return {
      mode,
      appliedVersion: null,
      highestRepositoryVersion,
      migrations
    };
  }

  if (!deploymentRecord) {
    throw new MigrationPlanError("Existing deployment mode requires an explicit deployment version record");
  }

  const { appliedVersion } = parseDeploymentVersionRecord(deploymentRecord);

  if (highestRepositoryVersion === null) {
    throw new MigrationPlanError("Existing deployment mode cannot reference an empty migration inventory");
  }

  if (appliedVersion > highestRepositoryVersion) {
    throw new MigrationPlanError("Deployment appliedVersion is newer than the repository migration inventory");
  }

  if (!migrations.some((migration) => migration.version === appliedVersion)) {
    throw new MigrationPlanError("Deployment appliedVersion does not reference a repository migration");
  }

  return {
    mode,
    appliedVersion,
    highestRepositoryVersion,
    migrations: migrations.filter((migration) => migration.version > appliedVersion)
  };
}
