import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupRoot = path.join(repositoryRoot, "artifacts", "backups");
const disposablePrefix = "rentmate_restore_check_";

export function isDisposableDatabaseName(value) {
  return /^rentmate_restore_check_[0-9a-f]{12}$/.test(value);
}

export function validateManifestEntryPath(manifestDirectory, fileName) {
  const resolvedDirectory = path.resolve(manifestDirectory);
  const resolvedFile = path.resolve(resolvedDirectory, fileName);
  if (!resolvedFile.startsWith(`${resolvedDirectory}${path.sep}`)) {
    throw new Error("Backup manifest contains a path outside its directory.");
  }
  return resolvedFile;
}

function runDockerCompose(arguments_, stdinFile) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "-f", "docker-compose.microservices.yml", ...arguments_], {
      cwd: repositoryRoot,
      shell: false,
      stdio: [stdinFile ? "pipe" : "ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    if (stdinFile) createReadStream(stdinFile).pipe(child.stdin);
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Restore command failed with exit code ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });
}

async function sha256File(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

async function latestManifest() {
  const directories = await readdir(backupRoot, { withFileTypes: true });
  const names = directories
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  if (names.length === 0) throw new Error("No local backup manifest exists. Run backup:local first.");
  return path.join(backupRoot, names[0], "manifest.json");
}

export async function rehearseDatabaseRestore(manifestArgument) {
  const manifestPath = path.resolve(manifestArgument ?? (await latestManifest()));
  const manifestDirectory = path.dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error("Unsupported or empty backup manifest.");
  }

  const results = [];
  for (const entry of manifest.entries) {
    if (typeof entry.file !== "string" || typeof entry.sha256 !== "string" || typeof entry.database !== "string") {
      throw new Error("Backup manifest entry is invalid.");
    }
    const backupFile = validateManifestEntryPath(manifestDirectory, entry.file);
    if ((await sha256File(backupFile)) !== entry.sha256) {
      throw new Error(`Backup checksum mismatch for ${entry.file}.`);
    }

    const disposableDatabase = `${disposablePrefix}${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    if (!isDisposableDatabaseName(disposableDatabase)) throw new Error("Generated restore database name is unsafe.");
    try {
      await runDockerCompose(["exec", "-T", "postgres", "createdb", "--username=rentmate", disposableDatabase]);
      await runDockerCompose(
        [
          "exec",
          "-T",
          "postgres",
          "pg_restore",
          "--exit-on-error",
          "--no-owner",
          "--no-privileges",
          "--username=rentmate",
          `--dbname=${disposableDatabase}`
        ],
        backupFile
      );
      const tableCount = await runDockerCompose([
        "exec",
        "-T",
        "postgres",
        "psql",
        "--username=rentmate",
        `--dbname=${disposableDatabase}`,
        "--tuples-only",
        "--no-align",
        "--command=SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
      ]);
      if (!/^\d+$/.test(tableCount) || Number(tableCount) === 0) {
        throw new Error(`Restored database ${entry.database} contains no public tables.`);
      }
      results.push({ sourceDatabase: entry.database, tableCount: Number(tableCount) });
    } finally {
      await runDockerCompose([
        "exec",
        "-T",
        "postgres",
        "dropdb",
        "--username=rentmate",
        "--if-exists",
        "--force",
        disposableDatabase
      ]);
    }
  }
  return { manifestPath, results };
}

function parseManifestArgument(arguments_) {
  const index = arguments_.indexOf("--manifest");
  if (index === -1) return undefined;
  const value = arguments_[index + 1];
  if (!value) throw new Error("--manifest requires a file path.");
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rehearseDatabaseRestore(parseManifestArgument(process.argv.slice(2)))
    .then(({ manifestPath, results }) => {
      process.stdout.write(`Restore rehearsal passed for ${manifestPath}\n`);
      for (const result of results) {
        process.stdout.write(`- ${result.sourceDatabase}: ${result.tableCount} public tables\n`);
      }
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Restore rehearsal failed."}\n`);
      process.exitCode = 1;
    });
}
