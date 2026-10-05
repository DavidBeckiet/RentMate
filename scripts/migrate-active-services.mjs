import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const serviceDefinitions = Object.freeze([
  {
    name: "identity",
    directory: "services/identity-service",
    manifestOption: "--identity-manifest",
    manifestEnvironment: "IDENTITY_MIGRATION_MANIFEST"
  },
  {
    name: "listing",
    directory: "services/listing-service",
    manifestOption: "--listing-manifest",
    manifestEnvironment: "LISTING_MIGRATION_MANIFEST"
  },
  {
    name: "engagement",
    directory: "services/engagement-service",
    manifestOption: "--engagement-manifest",
    manifestEnvironment: "ENGAGEMENT_MIGRATION_MANIFEST"
  }
]);

export class ActiveMigrationCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = "ActiveMigrationCommandError";
  }
}

export function parseActiveMigrationCommand(args, source = {}) {
  const [mode, ...options] = args;
  if (mode !== "clean" && mode !== "existing") {
    throw new ActiveMigrationCommandError('Migration mode must be explicitly "clean" or "existing".');
  }

  let planOnly = false;
  const manifests = new Map();
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === "--plan-only") {
      if (planOnly) throw new ActiveMigrationCommandError("--plan-only may be supplied only once.");
      planOnly = true;
      continue;
    }

    const service = serviceDefinitions.find((candidate) => candidate.manifestOption === option);
    if (!service) throw new ActiveMigrationCommandError(`Unknown active migration option: ${option}`);
    if (mode === "clean") throw new ActiveMigrationCommandError("Clean migration mode does not accept manifests.");
    if (manifests.has(service.name)) {
      throw new ActiveMigrationCommandError(`${option} may be supplied only once.`);
    }
    const manifestPath = options[index + 1];
    if (!manifestPath || manifestPath.startsWith("--")) {
      throw new ActiveMigrationCommandError(`${option} requires a file path.`);
    }
    manifests.set(service.name, manifestPath);
    index += 1;
  }

  if (mode === "existing") {
    for (const service of serviceDefinitions) {
      const environmentManifest = source[service.manifestEnvironment]?.trim();
      if (!manifests.has(service.name) && environmentManifest) {
        manifests.set(service.name, environmentManifest);
      }
      if (!manifests.has(service.name)) {
        throw new ActiveMigrationCommandError(
          `${service.manifestOption} or ${service.manifestEnvironment} is required in existing mode.`
        );
      }
    }
  }

  return Object.freeze({ mode, planOnly, manifests });
}

export function buildActiveMigrationInvocations(command) {
  return serviceDefinitions.map((service) => {
    const migrationArgs = [command.mode];
    const manifest = command.manifests.get(service.name);
    if (manifest) migrationArgs.push("--manifest", manifest);
    if (command.planOnly) migrationArgs.push("--plan-only");
    return Object.freeze({
      service: service.name,
      command: process.execPath,
      args: [
        path.join(service.directory, "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(service.directory, "migrate.ts"),
        ...migrationArgs
      ]
    });
  });
}

export function runActiveMigrations(args = process.argv.slice(2)) {
  const command = parseActiveMigrationCommand(args, process.env);
  for (const invocation of buildActiveMigrationInvocations(command)) {
    process.stdout.write(
      `Running ${invocation.service} migration ${command.mode}${command.planOnly ? " plan" : ""}.\n`
    );
    const result = spawnSync(invocation.command, invocation.args, { stdio: "inherit", env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new ActiveMigrationCommandError(
        `${invocation.service} migration stopped the active migration sequence with exit code ${result.status ?? 1}.`
      );
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runActiveMigrations();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unexpected active migration failure.";
    process.stderr.write(`${reason}\n`);
    process.exitCode = 1;
  }
}
