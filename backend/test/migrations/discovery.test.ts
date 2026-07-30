import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverMigrations, parseMigrationFilename } from "../../src/db/migrations/discovery.js";
import { MigrationDiscoveryError } from "../../src/db/migrations/types.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "rentmate-rm004-discovery-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("migration discovery", () => {
  it("discovers valid SQL files in deterministic numeric order", async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, "0010_tenth.sql"), "SELECT 10;", "utf8");
    await writeFile(path.join(directory, "0002_second.sql"), "SELECT 2;", "utf8");
    await writeFile(path.join(directory, "0001_first.sql"), "SELECT 1;", "utf8");

    const migrations = await discoverMigrations(directory);

    expect(migrations.map(({ version, filename }) => ({ version, filename }))).toStrictEqual([
      { version: 1, filename: "0001_first.sql" },
      { version: 2, filename: "0002_second.sql" },
      { version: 10, filename: "0010_tenth.sql" }
    ]);
  });

  it("rejects malformed SQL filenames", async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, "1_not_fixed_width.sql"), "SELECT 1;", "utf8");

    await expect(discoverMigrations(directory)).rejects.toThrowError(MigrationDiscoveryError);
  });

  it("rejects an uppercase SQL extension instead of silently ignoring it", async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, "0001_uppercase_extension.SQL"), "SELECT 1;", "utf8");

    await expect(discoverMigrations(directory)).rejects.toThrowError(MigrationDiscoveryError);
  });

  it("rejects duplicate numeric versions", async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, "0001_first.sql"), "SELECT 1;", "utf8");
    await writeFile(path.join(directory, "0001_duplicate.sql"), "SELECT 2;", "utf8");

    await expect(discoverMigrations(directory)).rejects.toThrowError("Duplicate migration version: 1");
  });

  it("ignores non-SQL files and nested directories explicitly", async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, "README.md"), "Policy only", "utf8");
    await writeFile(path.join(directory, "notes.txt"), "Ignored", "utf8");
    await mkdir(path.join(directory, "nested"));
    await writeFile(path.join(directory, "nested", "0001_nested.sql"), "SELECT 1;", "utf8");

    await expect(discoverMigrations(directory)).resolves.toStrictEqual([]);
  });

  it("returns an empty inventory for an empty directory", async () => {
    const directory = await createTemporaryDirectory();

    await expect(discoverMigrations(directory)).resolves.toStrictEqual([]);
  });

  it("parses only the approved naming convention", () => {
    expect(parseMigrationFilename("0042_descriptive_name.sql")).toStrictEqual({
      version: 42,
      filename: "0042_descriptive_name.sql"
    });
    expect(() => parseMigrationFilename("0000_invalid.sql")).toThrowError(
      "Migration version must be greater than zero"
    );
    expect(() => parseMigrationFilename("0001_Uppercase.sql")).toThrowError(MigrationDiscoveryError);
  });
});
