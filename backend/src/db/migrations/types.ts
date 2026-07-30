export type MigrationMode = "clean" | "existing";

export interface MigrationFile {
  readonly version: number;
  readonly filename: string;
  readonly path: string;
}

export interface DeploymentVersionRecord {
  readonly appliedVersion: number;
}

export interface MigrationPlan {
  readonly mode: MigrationMode;
  readonly appliedVersion: number | null;
  readonly highestRepositoryVersion: number | null;
  readonly migrations: readonly MigrationFile[];
}

export interface MigrationExecutionResult {
  readonly completedMigrations: readonly MigrationFile[];
  readonly lastSuccessfulMigration: MigrationFile | null;
}

export class MigrationDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationDiscoveryError";
  }
}

export class MigrationPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationPlanError";
  }
}

export class MigrationCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationCommandError";
  }
}

export class MigrationExecutionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationExecutionInputError";
  }
}

export class MigrationExecutionError extends Error {
  constructor(
    readonly failedMigration: MigrationFile,
    readonly lastSuccessfulMigration: MigrationFile | null,
    readonly rollbackFailed: boolean
  ) {
    const lastSuccessful = lastSuccessfulMigration
      ? `${lastSuccessfulMigration.version} (${lastSuccessfulMigration.filename})`
      : "none";
    super(
      `Migration ${failedMigration.version} (${failedMigration.filename}) failed; last successful migration: ${lastSuccessful}`
    );
    this.name = "MigrationExecutionError";
  }
}
