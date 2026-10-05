import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const sourceRevisionPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const migrationFilenamePattern = /^([0-9]{4})_[a-z][a-z0-9]*(?:_[a-z0-9]+)*\.sql$/;

const activeFiles = Object.freeze([
  ".nvmrc",
  "package.json",
  "package-lock.json",
  "frontend/package.json",
  "frontend/package-lock.json",
  "services/api-gateway/package.json",
  "services/shared/package.json",
  "services/shared/package-lock.json",
  "services/identity-service/package.json",
  "services/identity-service/package-lock.json",
  "services/listing-service/package.json",
  "services/listing-service/package-lock.json",
  "services/engagement-service/package.json",
  "services/engagement-service/package-lock.json",
  "services/verification-delivery-adapter/package.json",
  "services/verification-delivery-adapter/package-lock.json",
  "Dockerfile.microservices",
  "Dockerfile.gateway",
  "docker-compose.microservices.yml",
  "docker/postgres/init-microservices.sql"
]);

const migrationServices = Object.freeze([
  Object.freeze({ name: "identity", directory: "services/identity-service/migrations" }),
  Object.freeze({ name: "listing", directory: "services/listing-service/migrations" }),
  Object.freeze({ name: "engagement", directory: "services/engagement-service/migrations" })
]);

const activeImages = Object.freeze([
  Object.freeze({ name: "rentmate-identity", title: "rentmate-identity-service" }),
  Object.freeze({ name: "rentmate-listing", title: "rentmate-listing-service" }),
  Object.freeze({ name: "rentmate-engagement", title: "rentmate-engagement-service" }),
  Object.freeze({ name: "rentmate-verification-delivery", title: "rentmate-verification-delivery-adapter" }),
  Object.freeze({ name: "rentmate-gateway", title: "rentmate-gateway" })
]);
const imageIdPattern = /^sha256:[0-9a-f]{64}$/;

export class ReleaseEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseEvidenceError";
  }
}

export function validateReleaseIdentity(version, sourceRevision) {
  const normalizedVersion = version?.trim();
  const normalizedRevision = sourceRevision?.trim().toLowerCase();
  if (!normalizedVersion || !releaseVersionPattern.test(normalizedVersion)) {
    throw new ReleaseEvidenceError(
      "RENTMATE_RELEASE_VERSION must contain 1-128 letters, digits, periods, underscores, or hyphens."
    );
  }
  if (!normalizedRevision || !sourceRevisionPattern.test(normalizedRevision)) {
    throw new ReleaseEvidenceError("RENTMATE_SOURCE_REVISION must be an exact 40- or 64-character Git revision.");
  }
  return Object.freeze({ version: normalizedVersion, sourceRevision: normalizedRevision });
}

export function assertCleanSourceRevision(root, sourceRevision) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (head.status !== 0 || !head.stdout.trim()) {
    throw new ReleaseEvidenceError("Release evidence requires a readable Git checkout.");
  }
  if (head.stdout.trim().toLowerCase() !== sourceRevision) {
    throw new ReleaseEvidenceError("RENTMATE_SOURCE_REVISION must match the checked-out Git revision.");
  }

  const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8"
  });
  if (status.status !== 0) {
    throw new ReleaseEvidenceError("Release evidence could not verify the Git working tree.");
  }
  if (status.stdout.trim()) {
    throw new ReleaseEvidenceError("Release evidence requires a clean Git working tree.");
  }
}

function inspectDockerImage(reference) {
  const result = spawnSync("docker", ["image", "inspect", reference], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new ReleaseEvidenceError(`Required active image is unavailable: ${reference}.`);
  }
  try {
    const images = JSON.parse(result.stdout);
    if (!Array.isArray(images) || images.length !== 1) throw new Error("unexpected inspect result");
    return images[0];
  } catch {
    throw new ReleaseEvidenceError(`Docker returned invalid inspection data for ${reference}.`);
  }
}

export function collectLocalImageEvidence(identity, inspector = inspectDockerImage) {
  return Object.freeze(
    activeImages.map(({ name, title }) => {
      const reference = `${name}:${identity.version}`;
      const inspected = inspector(reference);
      const imageId = inspected?.Id;
      const labels = inspected?.Config?.Labels;
      if (typeof imageId !== "string" || !imageIdPattern.test(imageId)) {
        throw new ReleaseEvidenceError(`Active image has an invalid immutable image ID: ${reference}.`);
      }
      if (
        !labels ||
        labels["org.opencontainers.image.version"] !== identity.version ||
        labels["org.opencontainers.image.revision"] !== identity.sourceRevision ||
        labels["org.opencontainers.image.vendor"] !== "RentMate" ||
        labels["org.opencontainers.image.title"] !== title
      ) {
        throw new ReleaseEvidenceError(`Active image OCI labels do not match the release identity: ${reference}.`);
      }
      return Object.freeze({
        name,
        reference,
        imageId,
        oci: Object.freeze({
          title: labels["org.opencontainers.image.title"],
          version: labels["org.opencontainers.image.version"],
          revision: labels["org.opencontainers.image.revision"],
          vendor: labels["org.opencontainers.image.vendor"]
        })
      });
    })
  );
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function portablePath(value) {
  return value.split(path.sep).join("/");
}

async function fingerprintFile(root, relativePath) {
  let content;
  try {
    content = await readFile(path.join(root, relativePath));
  } catch {
    throw new ReleaseEvidenceError(`Required active release input is missing: ${portablePath(relativePath)}.`);
  }
  return Object.freeze({
    path: portablePath(relativePath),
    bytes: content.byteLength,
    sha256: sha256(content)
  });
}

async function collectMigrationInventory(root, service) {
  let entries;
  try {
    entries = await readdir(path.join(root, service.directory), { withFileTypes: true });
  } catch {
    throw new ReleaseEvidenceError(`Migration directory is missing for ${service.name}.`);
  }
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  if (filenames.length === 0) throw new ReleaseEvidenceError(`Migration inventory is empty for ${service.name}.`);

  const files = [];
  for (const [index, filename] of filenames.entries()) {
    const match = migrationFilenamePattern.exec(filename);
    const version = match ? Number(match[1]) : null;
    if (version !== index + 1) {
      throw new ReleaseEvidenceError(
        `Migration inventory for ${service.name} must be contiguous from 0001; found ${filename}.`
      );
    }
    files.push(await fingerprintFile(root, path.join(service.directory, filename)));
  }

  return Object.freeze({
    service: service.name,
    count: files.length,
    highestVersion: files.length,
    files: Object.freeze(files)
  });
}

export async function collectReleaseEvidence({
  root = repositoryRoot,
  version,
  sourceRevision,
  images,
  generatedAt = new Date().toISOString()
}) {
  const identity = validateReleaseIdentity(version, sourceRevision);
  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new ReleaseEvidenceError("Release evidence timestamp must be an ISO-8601 timestamp.");
  }
  if (!Array.isArray(images) || images.length !== activeImages.length) {
    throw new ReleaseEvidenceError("Release evidence requires all five inspected active images.");
  }

  const files = [];
  for (const relativePath of activeFiles) files.push(await fingerprintFile(root, relativePath));

  const migrations = [];
  for (const service of migrationServices) migrations.push(await collectMigrationInventory(root, service));

  const rootPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const nodeVersion = (await readFile(path.join(root, ".nvmrc"), "utf8")).trim();
  return Object.freeze({
    schemaVersion: 2,
    releaseVersion: identity.version,
    sourceRevision: identity.sourceRevision,
    generatedAt: new Date(generatedAt).toISOString(),
    topology: "active-microservices",
    toolchain: Object.freeze({ node: nodeVersion, packageManager: rootPackage.packageManager }),
    images: Object.freeze([...images]),
    files: Object.freeze(files),
    migrations: Object.freeze(migrations)
  });
}

export async function writeReleaseEvidence(evidence, outputRoot) {
  const releaseDirectory = path.join(outputRoot, evidence.releaseVersion);
  await mkdir(outputRoot, { recursive: true });
  try {
    await mkdir(releaseDirectory);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new ReleaseEvidenceError(`Release evidence already exists for ${evidence.releaseVersion}.`);
    }
    throw error;
  }
  const manifestPath = path.join(releaseDirectory, "release-manifest.json");
  const checksumPath = path.join(releaseDirectory, "release-manifest.sha256");
  const manifest = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(manifestPath, manifest, { encoding: "utf8", flag: "wx" });
  await writeFile(checksumPath, `${sha256(manifest)}  release-manifest.json\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  return Object.freeze({ manifestPath, checksumPath });
}

export async function generateReleaseEvidence(source = process.env) {
  const identity = validateReleaseIdentity(source.RENTMATE_RELEASE_VERSION, source.RENTMATE_SOURCE_REVISION);
  assertCleanSourceRevision(repositoryRoot, identity.sourceRevision);
  const images = collectLocalImageEvidence(identity);
  const evidence = await collectReleaseEvidence({ root: repositoryRoot, ...identity, images });
  const paths = await writeReleaseEvidence(evidence, path.join(repositoryRoot, "artifacts", "release-evidence"));
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      message: "Active release evidence generated",
      releaseVersion: evidence.releaseVersion,
      sourceRevision: evidence.sourceRevision,
      imageCount: evidence.images.length,
      fileCount: evidence.files.length,
      migrationCount: evidence.migrations.reduce((total, service) => total + service.count, 0),
      manifestPath: path.relative(repositoryRoot, paths.manifestPath),
      checksumPath: path.relative(repositoryRoot, paths.checksumPath)
    })}\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateReleaseEvidence().catch((error) => {
    const reason = error instanceof ReleaseEvidenceError ? error.message : "Unexpected release evidence failure.";
    process.stderr.write(`${JSON.stringify({ level: "error", message: reason })}\n`);
    process.exitCode = 1;
  });
}
