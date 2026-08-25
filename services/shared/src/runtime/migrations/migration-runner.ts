import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

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

export interface MigrationCommand {
  readonly mode: MigrationMode;
  readonly manifestPath: string | null;
  readonly planOnly: boolean;
}

export interface MigrationClient {
  query(sql: string): Promise<unknown>;
  release(): void;
}

export interface MigrationPool {
  connect(): Promise<MigrationClient>;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
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

const migrationFilenamePattern = /^([0-9]{4})_([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.sql$/;

export interface MigrationRunner {
  readonly discover: (directory: string) => Promise<MigrationFile[]>;
  readonly parseCommand: (args: readonly string[]) => MigrationCommand;
  readonly parseDeploymentVersionRecord: (input: unknown) => DeploymentVersionRecord;
  readonly readDeploymentVersionRecord: (manifestPath: string) => Promise<DeploymentVersionRecord>;
  readonly createPlan: (
    mode: MigrationMode,
    repositoryMigrations: readonly MigrationFile[],
    deploymentRecord?: DeploymentVersionRecord
  ) => MigrationPlan;
  readonly executePlan: (pool: MigrationPool, plan: MigrationPlan) => Promise<readonly MigrationFile[]>;
}

export function createMigrationRunner(serviceName: string): MigrationRunner {
  const label = `${serviceName} migration`;

  function parseMigrationFilename(filename: string): number {
    const match = migrationFilenamePattern.exec(filename);
    if (!match) {
      throw new MigrationError(`Invalid ${label} filename "${filename}"; expected 0001_descriptive_name.sql`);
    }

    const version = Number(match[1]);
    if (version < 1) throw new MigrationError(`${label} version must be greater than zero: "${filename}"`);
    return version;
  }

  function sortAndValidateMigrations(migrations: readonly MigrationFile[]): MigrationFile[] {
    const sorted = [...migrations].sort(
      (left, right) => left.version - right.version || left.filename.localeCompare(right.filename)
    );

    for (const [index, migration] of sorted.entries()) {
      const parsedVersion = parseMigrationFilename(migration.filename);
      if (parsedVersion !== migration.version) {
        throw new MigrationError(`${label} metadata version does not match filename: "${migration.filename}"`);
      }

      const expectedVersion = index + 1;
      if (migration.version !== expectedVersion) {
        throw new MigrationError(
          `${label} inventory must be contiguous from 0001; expected version ${expectedVersion}, found ${migration.version}`
        );
      }
    }

    return sorted;
  }

  async function discover(directory: string): Promise<MigrationFile[]> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      throw new MigrationError(`${label} directory could not be read`);
    }

    const migrations: MigrationFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".sql")) continue;
      const version = parseMigrationFilename(entry.name);
      migrations.push({ version, filename: entry.name, path: path.resolve(directory, entry.name) });
    }
    return sortAndValidateMigrations(migrations);
  }

  function parseCommand(args: readonly string[]): MigrationCommand {
    const [mode, ...options] = args;
    if (mode !== "clean" && mode !== "existing") {
      throw new MigrationError(`${label} mode must be explicitly "clean" or "existing"`);
    }

    let manifestPath: string | null = null;
    let planOnly = false;
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      if (option === "--plan-only") {
        if (planOnly) throw new MigrationError("--plan-only may be specified only once");
        planOnly = true;
        continue;
      }
      if (option === "--manifest") {
        if (manifestPath) throw new MigrationError("--manifest may be specified only once");
        const value = options[index + 1];
        if (!value || value.startsWith("--")) throw new MigrationError("--manifest requires a file path");
        manifestPath = value;
        index += 1;
        continue;
      }
      throw new MigrationError(`Unknown ${label} option: "${option}"`);
    }

    if (mode === "clean" && manifestPath) {
      throw new MigrationError(`Clean ${label} mode does not accept --manifest`);
    }
    if (mode === "existing" && !manifestPath) {
      throw new MigrationError(`Existing ${label} mode requires --manifest`);
    }
    return { mode, manifestPath, planOnly };
  }

  function parseDeploymentVersionRecord(input: unknown): DeploymentVersionRecord {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new MigrationError(`${label} deployment version record must be a JSON object`);
    }
    const keys = Object.keys(input);
    if (keys.length !== 1 || keys[0] !== "appliedVersion") {
      throw new MigrationError(`Deployment version record must contain only the "appliedVersion" field`);
    }
    const appliedVersion = (input as { readonly appliedVersion?: unknown }).appliedVersion;
    if (!Number.isInteger(appliedVersion) || (appliedVersion as number) < 1) {
      throw new MigrationError(`${label} deployment appliedVersion must be a positive integer`);
    }
    return { appliedVersion: appliedVersion as number };
  }

  async function readDeploymentVersionRecord(manifestPath: string): Promise<DeploymentVersionRecord> {
    let contents: string;
    try {
      contents = await readFile(manifestPath, "utf8");
    } catch {
      throw new MigrationError(`${label} deployment version record could not be read`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      throw new MigrationError(`${label} deployment version record must contain valid JSON`);
    }
    return parseDeploymentVersionRecord(parsed);
  }

  function createPlan(
    mode: MigrationMode,
    repositoryMigrations: readonly MigrationFile[],
    deploymentRecord?: DeploymentVersionRecord
  ): MigrationPlan {
    const migrations = sortAndValidateMigrations(repositoryMigrations);
    const highestRepositoryVersion = migrations.at(-1)?.version ?? null;

    if (mode === "clean") {
      if (deploymentRecord) throw new MigrationError(`Clean ${label} mode does not accept a deployment version record`);
      return { mode, appliedVersion: null, highestRepositoryVersion, migrations };
    }

    if (!deploymentRecord) throw new MigrationError(`Existing ${label} mode requires a deployment version record`);
    const { appliedVersion } = parseDeploymentVersionRecord(deploymentRecord);
    if (highestRepositoryVersion === null)
      throw new MigrationError(`Existing ${label} mode cannot use an empty inventory`);
    if (appliedVersion > highestRepositoryVersion) {
      throw new MigrationError(`${label} deployment appliedVersion is newer than the repository migration inventory`);
    }
    if (!migrations.some((migration) => migration.version === appliedVersion)) {
      throw new MigrationError(`${label} deployment appliedVersion does not reference a repository migration`);
    }

    return {
      mode,
      appliedVersion,
      highestRepositoryVersion,
      migrations: migrations.filter((migration) => migration.version > appliedVersion)
    };
  }

  async function rollback(client: MigrationClient): Promise<boolean> {
    try {
      await client.query("ROLLBACK");
      return false;
    } catch {
      return true;
    }
  }

  async function executePlan(pool: MigrationPool, plan: MigrationPlan): Promise<readonly MigrationFile[]> {
    const completed: MigrationFile[] = [];

    for (const migration of plan.migrations) {
      let client: MigrationClient;
      try {
        client = await pool.connect();
      } catch {
        throw new MigrationExecutionError(migration, completed.at(-1) ?? null, false);
      }

      let transactionStarted = false;
      try {
        await client.query("BEGIN");
        transactionStarted = true;
        const sql = await readFile(migration.path, "utf8");
        if (!sql.trim()) throw new MigrationError(`${label} SQL file must not be empty`);
        await client.query(sql);
        await client.query("COMMIT");
        completed.push(migration);
      } catch {
        const rollbackFailed = transactionStarted ? await rollback(client) : false;
        throw new MigrationExecutionError(migration, completed.at(-1) ?? null, rollbackFailed);
      } finally {
        client.release();
      }
    }

    return Object.freeze(completed);
  }

  return Object.freeze({
    discover,
    parseCommand,
    parseDeploymentVersionRecord,
    readDeploymentVersionRecord,
    createPlan,
    executePlan
  });
}
