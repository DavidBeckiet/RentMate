import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export type IdentityMigrationMode = "clean" | "existing";

export interface IdentityMigrationFile {
  readonly version: number;
  readonly filename: string;
  readonly path: string;
}

export interface IdentityDeploymentVersionRecord {
  readonly appliedVersion: number;
}

export interface IdentityMigrationPlan {
  readonly mode: IdentityMigrationMode;
  readonly appliedVersion: number | null;
  readonly highestRepositoryVersion: number | null;
  readonly migrations: readonly IdentityMigrationFile[];
}

export interface IdentityMigrationCommand {
  readonly mode: IdentityMigrationMode;
  readonly manifestPath: string | null;
  readonly planOnly: boolean;
}

export interface IdentityMigrationClient {
  query(sql: string): Promise<unknown>;
  release(): void;
}

export interface IdentityMigrationPool {
  connect(): Promise<IdentityMigrationClient>;
}

export class IdentityMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityMigrationError";
  }
}

export class IdentityMigrationExecutionError extends Error {
  constructor(
    readonly failedMigration: IdentityMigrationFile,
    readonly lastSuccessfulMigration: IdentityMigrationFile | null,
    readonly rollbackFailed: boolean
  ) {
    const lastSuccessful = lastSuccessfulMigration
      ? `${lastSuccessfulMigration.version} (${lastSuccessfulMigration.filename})`
      : "none";
    super(
      `Identity migration ${failedMigration.version} (${failedMigration.filename}) failed; last successful migration: ${lastSuccessful}`
    );
    this.name = "IdentityMigrationExecutionError";
  }
}

const migrationFilenamePattern = /^([0-9]{4})_([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.sql$/;

function parseMigrationFilename(filename: string): number {
  const match = migrationFilenamePattern.exec(filename);
  if (!match) {
    throw new IdentityMigrationError(
      `Invalid Identity migration filename "${filename}"; expected 0001_descriptive_name.sql`
    );
  }

  const version = Number(match[1]);
  if (version < 1) {
    throw new IdentityMigrationError(`Identity migration version must be greater than zero: "${filename}"`);
  }
  return version;
}

function sortAndValidateMigrations(migrations: readonly IdentityMigrationFile[]): IdentityMigrationFile[] {
  const sorted = [...migrations].sort(
    (left, right) => left.version - right.version || left.filename.localeCompare(right.filename)
  );

  for (const [index, migration] of sorted.entries()) {
    const parsedVersion = parseMigrationFilename(migration.filename);
    if (parsedVersion !== migration.version) {
      throw new IdentityMigrationError(
        `Identity migration metadata version does not match filename: "${migration.filename}"`
      );
    }

    const expectedVersion = index + 1;
    if (migration.version !== expectedVersion) {
      throw new IdentityMigrationError(
        `Identity migration inventory must be contiguous from 0001; expected version ${expectedVersion}, found ${migration.version}`
      );
    }
  }

  return sorted;
}

export async function discoverIdentityMigrations(directory: string): Promise<IdentityMigrationFile[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new IdentityMigrationError("Identity migration directory could not be read");
  }

  const migrations: IdentityMigrationFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".sql")) continue;
    const version = parseMigrationFilename(entry.name);
    migrations.push({ version, filename: entry.name, path: path.resolve(directory, entry.name) });
  }
  return sortAndValidateMigrations(migrations);
}

export function parseIdentityMigrationCommand(args: readonly string[]): IdentityMigrationCommand {
  const [mode, ...options] = args;
  if (mode !== "clean" && mode !== "existing") {
    throw new IdentityMigrationError('Identity migration mode must be explicitly "clean" or "existing"');
  }

  let manifestPath: string | null = null;
  let planOnly = false;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === "--plan-only") {
      if (planOnly) throw new IdentityMigrationError("--plan-only may be specified only once");
      planOnly = true;
      continue;
    }
    if (option === "--manifest") {
      if (manifestPath) throw new IdentityMigrationError("--manifest may be specified only once");
      const value = options[index + 1];
      if (!value || value.startsWith("--")) {
        throw new IdentityMigrationError("--manifest requires a file path");
      }
      manifestPath = value;
      index += 1;
      continue;
    }
    throw new IdentityMigrationError(`Unknown Identity migration option: "${option}"`);
  }

  if (mode === "clean" && manifestPath) {
    throw new IdentityMigrationError("Clean Identity migration mode does not accept --manifest");
  }
  if (mode === "existing" && !manifestPath) {
    throw new IdentityMigrationError("Existing Identity migration mode requires --manifest");
  }
  return { mode, manifestPath, planOnly };
}

export function parseIdentityDeploymentVersionRecord(input: unknown): IdentityDeploymentVersionRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new IdentityMigrationError("Identity deployment version record must be a JSON object");
  }
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== "appliedVersion") {
    throw new IdentityMigrationError('Identity deployment version record must contain only the "appliedVersion" field');
  }
  const appliedVersion = (input as { readonly appliedVersion?: unknown }).appliedVersion;
  if (!Number.isInteger(appliedVersion) || (appliedVersion as number) < 1) {
    throw new IdentityMigrationError("Identity deployment appliedVersion must be a positive integer");
  }
  return { appliedVersion: appliedVersion as number };
}

export async function readIdentityDeploymentVersionRecord(
  manifestPath: string
): Promise<IdentityDeploymentVersionRecord> {
  let contents: string;
  try {
    contents = await readFile(manifestPath, "utf8");
  } catch {
    throw new IdentityMigrationError("Identity deployment version record could not be read");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new IdentityMigrationError("Identity deployment version record must contain valid JSON");
  }
  return parseIdentityDeploymentVersionRecord(parsed);
}

export function createIdentityMigrationPlan(
  mode: IdentityMigrationMode,
  repositoryMigrations: readonly IdentityMigrationFile[],
  deploymentRecord?: IdentityDeploymentVersionRecord
): IdentityMigrationPlan {
  const migrations = sortAndValidateMigrations(repositoryMigrations);
  const highestRepositoryVersion = migrations.at(-1)?.version ?? null;

  if (mode === "clean") {
    if (deploymentRecord) {
      throw new IdentityMigrationError("Clean Identity migration mode does not accept a deployment version record");
    }
    return { mode, appliedVersion: null, highestRepositoryVersion, migrations };
  }

  if (!deploymentRecord) {
    throw new IdentityMigrationError("Existing Identity migration mode requires a deployment version record");
  }
  const { appliedVersion } = parseIdentityDeploymentVersionRecord(deploymentRecord);
  if (highestRepositoryVersion === null) {
    throw new IdentityMigrationError("Existing Identity migration mode cannot use an empty inventory");
  }
  if (appliedVersion > highestRepositoryVersion) {
    throw new IdentityMigrationError(
      "Identity deployment appliedVersion is newer than the repository migration inventory"
    );
  }
  if (!migrations.some((migration) => migration.version === appliedVersion)) {
    throw new IdentityMigrationError("Identity deployment appliedVersion does not reference a repository migration");
  }

  return {
    mode,
    appliedVersion,
    highestRepositoryVersion,
    migrations: migrations.filter((migration) => migration.version > appliedVersion)
  };
}

async function rollback(client: IdentityMigrationClient): Promise<boolean> {
  try {
    await client.query("ROLLBACK");
    return false;
  } catch {
    return true;
  }
}

export async function executeIdentityMigrationPlan(
  pool: IdentityMigrationPool,
  plan: IdentityMigrationPlan
): Promise<readonly IdentityMigrationFile[]> {
  const completed: IdentityMigrationFile[] = [];

  for (const migration of plan.migrations) {
    let client: IdentityMigrationClient;
    try {
      client = await pool.connect();
    } catch {
      throw new IdentityMigrationExecutionError(migration, completed.at(-1) ?? null, false);
    }

    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      const sql = await readFile(migration.path, "utf8");
      if (!sql.trim()) throw new IdentityMigrationError("Identity migration SQL file must not be empty");
      await client.query(sql);
      await client.query("COMMIT");
      completed.push(migration);
    } catch {
      const rollbackFailed = transactionStarted ? await rollback(client) : false;
      throw new IdentityMigrationExecutionError(migration, completed.at(-1) ?? null, rollbackFailed);
    } finally {
      client.release();
    }
  }

  return Object.freeze(completed);
}
