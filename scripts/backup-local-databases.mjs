import { createHash } from "node:crypto";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const localDatabases = Object.freeze(["rentmate_identity", "rentmate_listing", "rentmate_engagement"]);

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function timestampDirectoryName(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

export async function sha256File(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

async function runDockerCompose(arguments_, outputFile) {
  const output = await open(outputFile, "wx");
  try {
    await new Promise((resolve, reject) => {
      const child = spawn("docker", ["compose", "-f", "docker-compose.microservices.yml", ...arguments_], {
        cwd: repositoryRoot,
        shell: false,
        stdio: ["ignore", output.fd, "pipe"]
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Database backup command failed with exit code ${code}: ${stderr.trim().slice(0, 500)}`));
      });
    });
  } finally {
    await output.close();
  }
}

export async function backupLocalDatabases(outputDirectory) {
  const destination = path.resolve(
    outputDirectory ?? path.join(repositoryRoot, "artifacts", "backups", timestampDirectoryName())
  );
  await mkdir(destination, { recursive: true });
  const entries = [];

  for (const database of localDatabases) {
    const fileName = `${database}.dump`;
    const filePath = path.join(destination, fileName);
    await runDockerCompose(
      [
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--username=rentmate",
        database
      ],
      filePath
    );
    const fileStat = await stat(filePath);
    entries.push({ database, file: fileName, bytes: fileStat.size, sha256: await sha256File(filePath) });
  }

  const manifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    source: "docker-compose.microservices.yml/postgres",
    entries
  };
  const manifestPath = path.join(destination, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return manifestPath;
}

function parseOutputArgument(arguments_) {
  const index = arguments_.indexOf("--output");
  if (index === -1) return undefined;
  const value = arguments_[index + 1];
  if (!value) throw new Error("--output requires a directory path.");
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  backupLocalDatabases(parseOutputArgument(process.argv.slice(2)))
    .then((manifestPath) => process.stdout.write(`Backup manifest created: ${manifestPath}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Database backup failed."}\n`);
      process.exitCode = 1;
    });
}
