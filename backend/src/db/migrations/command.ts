import { readFile } from "node:fs/promises";
import {
  MigrationCommandError,
  MigrationPlanError,
  type DeploymentVersionRecord,
  type MigrationMode
} from "./types.js";
import { parseDeploymentVersionRecord } from "./planning.js";

export interface MigrationCommandArguments {
  readonly mode: MigrationMode;
  readonly manifestPath: string | null;
  readonly planOnly: boolean;
}

export function parseMigrationCommandArguments(args: readonly string[]): MigrationCommandArguments {
  const [modeArgument, ...options] = args;

  if (modeArgument !== "clean" && modeArgument !== "existing") {
    throw new MigrationCommandError('Migration mode is required and must be either "clean" or "existing"');
  }

  let manifestPath: string | null = null;
  let planOnly = false;

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];

    if (option === "--plan-only") {
      if (planOnly) {
        throw new MigrationCommandError("--plan-only may be specified only once");
      }

      planOnly = true;
      continue;
    }

    if (option === "--manifest") {
      if (manifestPath) {
        throw new MigrationCommandError("--manifest may be specified only once");
      }

      const value = options[index + 1];
      if (!value || value.startsWith("--")) {
        throw new MigrationCommandError("--manifest requires a file path");
      }

      manifestPath = value;
      index += 1;
      continue;
    }

    throw new MigrationCommandError(`Unknown migration option: "${option}"`);
  }

  if (modeArgument === "clean" && manifestPath) {
    throw new MigrationCommandError("Clean migration mode does not accept --manifest");
  }

  if (modeArgument === "existing" && !manifestPath) {
    throw new MigrationCommandError("Existing migration mode requires --manifest");
  }

  return {
    mode: modeArgument,
    manifestPath,
    planOnly
  };
}

export async function readDeploymentVersionRecord(manifestPath: string): Promise<DeploymentVersionRecord> {
  let contents: string;

  try {
    contents = await readFile(manifestPath, "utf8");
  } catch {
    throw new MigrationPlanError("Deployment version record could not be read");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new MigrationPlanError("Deployment version record must contain valid JSON");
  }

  return parseDeploymentVersionRecord(parsed);
}
