import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseMigrationCommandArguments, readDeploymentVersionRecord } from "../../src/db/migrations/command.js";
import { MigrationCommandError, MigrationPlanError } from "../../src/db/migrations/types.js";

const temporaryDirectories: string[] = [];

async function writeManifest(contents: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "rentmate-rm004-manifest-"));
  temporaryDirectories.push(directory);
  const manifestPath = path.join(directory, "deployment-version.json");
  await writeFile(manifestPath, contents, "utf8");
  return manifestPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("migration command validation", () => {
  it("parses explicit clean and existing modes", () => {
    expect(parseMigrationCommandArguments(["clean", "--plan-only"])).toStrictEqual({
      mode: "clean",
      manifestPath: null,
      planOnly: true
    });
    expect(
      parseMigrationCommandArguments(["existing", "--manifest", "deployment-version.json", "--plan-only"])
    ).toStrictEqual({
      mode: "existing",
      manifestPath: "deployment-version.json",
      planOnly: true
    });
  });

  it.each([
    [[], "mode is required"],
    [["unknown"], "mode is required"],
    [["existing"], "requires --manifest"],
    [["clean", "--manifest", "record.json"], "does not accept --manifest"],
    [["existing", "--manifest"], "requires a file path"],
    [["clean", "--unknown"], "Unknown migration option"],
    [["clean", "--plan-only", "--plan-only"], "may be specified only once"]
  ])("rejects invalid command input", (args, expectedMessage) => {
    expect(() => parseMigrationCommandArguments(args)).toThrowError(expectedMessage);
  });

  it("reads the exact external deployment record format", async () => {
    const manifestPath = await writeManifest('{"appliedVersion":2}');

    await expect(readDeploymentVersionRecord(manifestPath)).resolves.toStrictEqual({
      appliedVersion: 2
    });
  });

  it("rejects missing and malformed manifest files safely", async () => {
    await expect(readDeploymentVersionRecord("missing-record.json")).rejects.toThrowError(MigrationPlanError);

    const manifestPath = await writeManifest("{not-json");
    await expect(readDeploymentVersionRecord(manifestPath)).rejects.toThrowError("must contain valid JSON");
  });

  it("uses a specific command error type", () => {
    expect(() => parseMigrationCommandArguments([])).toThrowError(MigrationCommandError);
  });
});
