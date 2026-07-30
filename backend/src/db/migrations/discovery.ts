import { readdir } from "node:fs/promises";
import path from "node:path";
import { MigrationDiscoveryError, type MigrationFile } from "./types.js";

const migrationFilenamePattern = /^([0-9]{4})_([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.sql$/;

function compareFilenames(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

export function parseMigrationFilename(filename: string): Pick<MigrationFile, "version" | "filename"> {
  const match = migrationFilenamePattern.exec(filename);

  if (!match) {
    throw new MigrationDiscoveryError(`Invalid migration filename "${filename}"; expected 0001_descriptive_name.sql`);
  }

  const version = Number(match[1]);
  if (version < 1) {
    throw new MigrationDiscoveryError(`Migration version must be greater than zero: "${filename}"`);
  }

  return {
    version,
    filename
  };
}

export function sortAndValidateMigrations(migrations: readonly MigrationFile[]): MigrationFile[] {
  const sorted = [...migrations].sort(
    (left, right) => left.version - right.version || compareFilenames(left.filename, right.filename)
  );
  const versions = new Set<number>();

  for (const migration of sorted) {
    const parsed = parseMigrationFilename(migration.filename);

    if (parsed.version !== migration.version) {
      throw new MigrationDiscoveryError(`Migration metadata version does not match filename: "${migration.filename}"`);
    }

    if (versions.has(migration.version)) {
      throw new MigrationDiscoveryError(`Duplicate migration version: ${migration.version}`);
    }

    versions.add(migration.version);
  }

  return sorted;
}

export async function discoverMigrations(directory: string): Promise<MigrationFile[]> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new MigrationDiscoveryError("Migration directory could not be read");
  }

  const migrations: MigrationFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".sql")) {
      continue;
    }

    const parsed = parseMigrationFilename(entry.name);
    migrations.push({
      ...parsed,
      path: path.resolve(directory, entry.name)
    });
  }

  return sortAndValidateMigrations(migrations);
}
