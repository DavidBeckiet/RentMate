import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { localDatabases } from "./backup-local-databases.mjs";
import { ActiveDeploymentValidationError, validateActiveDeploymentEnvironment } from "./validate-active-deployment.mjs";
import { buildActiveMigrationInvocations, parseActiveMigrationCommand } from "./migrate-active-services.mjs";
import { isDisposableDatabaseName, validateManifestEntryPath } from "./rehearse-database-restore.mjs";
import {
  assertCleanSourceRevision,
  collectLocalImageEvidence,
  collectReleaseEvidence,
  validateReleaseIdentity,
  writeReleaseEvidence
} from "./generate-release-evidence.mjs";
import { readActiveSmokeConfiguration, runActiveSmoke } from "./smoke-active-topology.mjs";
import { readActiveStackVerificationConfiguration, runActiveStackVerification } from "./verify-active-stack.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepositoryFile(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("backup inventory includes every current microservice database", () => {
  assert.deepEqual(localDatabases, ["rentmate_identity", "rentmate_listing", "rentmate_engagement"]);
});

test("restore rehearsal only accepts generated disposable database names", () => {
  assert.equal(isDisposableDatabaseName("rentmate_restore_check_012345abcdef"), true);
  assert.equal(isDisposableDatabaseName("rentmate_identity"), false);
  assert.equal(isDisposableDatabaseName("rentmate_restore_check_012345abcdef_extra"), false);
});

test("manifest files cannot escape the selected backup directory", () => {
  const directory = path.resolve("artifacts", "backups", "test");
  assert.equal(validateManifestEntryPath(directory, "rentmate.dump"), path.join(directory, "rentmate.dump"));
  assert.throws(() => validateManifestEntryPath(directory, "../outside.dump"), /outside its directory/);
});

test("active runtime and CI do not depend on the retained compatibility backend", () => {
  const activeFiles = [
    "docker-compose.microservices.yml",
    "scripts/dev-microservices.mjs",
    "services/api-gateway/server.mjs",
    ".github/workflows/microservices.yml"
  ];

  for (const relativePath of activeFiles) {
    const source = readRepositoryFile(relativePath);
    assert.doesNotMatch(source, /BACKEND_URL|backend:4000|--prefix["', ]+backend|build backend/);
  }

  const compose = readRepositoryFile("docker-compose.microservices.yml");
  assert.doesNotMatch(compose, /^  backend:/m);
  assert.doesNotMatch(compose, /POSTGRES_DB:\s*rentmate\s*$/m);

  const rootPackage = JSON.parse(readRepositoryFile("package.json"));
  for (const scriptName of [
    "build",
    "typecheck",
    "lint",
    "test",
    "migrate:clean",
    "migrate:clean:plan",
    "migrate:existing",
    "migrate:existing:plan",
    "deploy:validate",
    "smoke:production",
    "verify:active-stack",
    "release:evidence"
  ]) {
    assert.doesNotMatch(rootPackage.scripts[scriptName], /backend/);
  }
});

function validProductionEnvironment() {
  return {
    NODE_ENV: "production",
    FRONTEND_ORIGIN: "https://app.rentmate.example",
    NEXT_PUBLIC_API_BASE_URL: "https://api.rentmate.example",
    COOKIE_SECURE: "true",
    POSTGRES_PASSWORD: "postgres-production-password",
    JWT_SECRET: "jwt-production-secret-with-32-bytes-minimum",
    SERVICE_INTERNAL_TOKEN: "internal-production-token-with-32-bytes",
    CLOUDINARY_CLOUD_NAME: "rentmate-production",
    CLOUDINARY_API_KEY: "cloudinary-production-key",
    CLOUDINARY_API_SECRET: "cloudinary-production-secret",
    NOMINATIM_USER_AGENT: "RentMate production ops@example.com",
    DEPLOYMENT_ENVIRONMENT: "production",
    RENTMATE_RELEASE_VERSION: "2026.09.27-abcdef",
    RENTMATE_IMAGE_TAG: "2026.09.27-abcdef",
    RENTMATE_SOURCE_REVISION: "a".repeat(40),
    RENTMATE_SMOKE_ALLOW_LOCAL: "false"
  };
}

test("active deployment validation rejects local, placeholder, shared, and short production secrets", () => {
  const valid = validateActiveDeploymentEnvironment(validProductionEnvironment());
  assert.equal(valid.apiOrigin, "https://api.rentmate.example");
  assert.equal(valid.validatedSecretCount, 3);

  assert.throws(
    () =>
      validateActiveDeploymentEnvironment({
        ...validProductionEnvironment(),
        FRONTEND_ORIGIN: "http://localhost:3000",
        POSTGRES_PASSWORD: "short",
        JWT_SECRET: "replace-with-a-secret",
        SERVICE_INTERNAL_TOKEN: "replace-with-a-secret"
      }),
    (error) =>
      error instanceof ActiveDeploymentValidationError &&
      error.issues.some((issue) => issue.includes("FRONTEND_ORIGIN")) &&
      error.issues.some((issue) => issue.includes("POSTGRES_PASSWORD")) &&
      error.issues.some((issue) => issue.includes("must be different"))
  );
  assert.throws(
    () =>
      validateActiveDeploymentEnvironment({
        ...validProductionEnvironment(),
        GOOGLE_OAUTH_CLIENT_ID: "configured-without-the-other-values"
      }),
    /Google OAuth configuration must provide/
  );
  assert.throws(
    () =>
      validateActiveDeploymentEnvironment({
        ...validProductionEnvironment(),
        RENTMATE_IMAGE_TAG: "different-release",
        RENTMATE_SOURCE_REVISION: "not-a-revision"
      }),
    /RENTMATE_IMAGE_TAG must exactly match/
  );
});

test("active deployment validation fails closed for incomplete authenticated smoke configuration", () => {
  assert.throws(
    () =>
      validateActiveDeploymentEnvironment({
        ...validProductionEnvironment(),
        RENTMATE_SMOKE_REQUIRE_AUTHENTICATED: "true",
        RENTMATE_SMOKE_TENANT_EMAIL: "tenant@example.com",
        RENTMATE_SMOKE_TENANT_PASSWORD: "tenant-password"
      }),
    /RENTMATE_SMOKE_LANDLORD_EMAIL/
  );

  const result = validateActiveDeploymentEnvironment({
    ...validProductionEnvironment(),
    RENTMATE_SMOKE_REQUIRE_AUTHENTICATED: "true",
    RENTMATE_SMOKE_TENANT_EMAIL: "tenant@example.com",
    RENTMATE_SMOKE_TENANT_PASSWORD: "tenant-password",
    RENTMATE_SMOKE_LANDLORD_EMAIL: "landlord@example.com",
    RENTMATE_SMOKE_LANDLORD_PASSWORD: "landlord-password",
    RENTMATE_SMOKE_ADMIN_EMAIL: "admin@example.com",
    RENTMATE_SMOKE_ADMIN_PASSWORD: "admin-password"
  });
  assert.equal(result.authenticatedSmokeRequired, true);
});

test("active migration orchestration requires one explicit manifest per owned database", () => {
  const clean = parseActiveMigrationCommand(["clean", "--plan-only"]);
  assert.equal(clean.mode, "clean");
  assert.equal(buildActiveMigrationInvocations(clean).length, 3);
  assert.ok(buildActiveMigrationInvocations(clean).every((invocation) => invocation.args.includes("--plan-only")));

  const existing = parseActiveMigrationCommand([
    "existing",
    "--identity-manifest",
    "identity.json",
    "--listing-manifest",
    "listing.json",
    "--engagement-manifest",
    "engagement.json"
  ]);
  const invocations = buildActiveMigrationInvocations(existing);
  assert.deepEqual(
    invocations.map((invocation) => invocation.args.at(-1)),
    ["identity.json", "listing.json", "engagement.json"]
  );
  assert.throws(
    () => parseActiveMigrationCommand(["existing", "--identity-manifest", "identity.json"]),
    /--listing-manifest or LISTING_MIGRATION_MANIFEST is required/
  );
  const environmentConfigured = parseActiveMigrationCommand(["existing", "--plan-only"], {
    IDENTITY_MIGRATION_MANIFEST: "identity.json",
    LISTING_MIGRATION_MANIFEST: "listing.json",
    ENGAGEMENT_MIGRATION_MANIFEST: "engagement.json"
  });
  assert.equal(environmentConfigured.manifests.get("listing"), "listing.json");
});

test("active production smoke remains read-only and verifies request IDs plus credentialed CORS", async () => {
  const configuration = readActiveSmokeConfiguration({
    FRONTEND_ORIGIN: "https://app.rentmate.example",
    NEXT_PUBLIC_API_BASE_URL: "https://api.rentmate.example"
  });
  const fetcher = async (input) => {
    const url = String(input);
    if (url === configuration.frontendOrigin) return new Response("<html>RentMate</html>", { status: 200 });
    if (url.endsWith("/api/health")) {
      return Response.json({ status: "ok" }, { headers: { "x-request-id": "smoke-health-1" } });
    }
    return Response.json(
      { data: [], pagination: { page: 1, pageSize: 1, hasNextPage: false } },
      {
        headers: {
          "x-request-id": "smoke-listings-1",
          "access-control-allow-origin": configuration.frontendOrigin,
          "access-control-allow-credentials": "true"
        }
      }
    );
  };

  assert.deepEqual(await runActiveSmoke(configuration, fetcher), { checkCount: 3, productWritesPerformed: false });
  assert.throws(
    () =>
      readActiveSmokeConfiguration({
        FRONTEND_ORIGIN: "http://localhost:3000",
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4001"
      }),
    /non-local HTTPS/
  );
});

test("authenticated production smoke requires a complete three-role credential set", () => {
  assert.throws(
    () =>
      readActiveSmokeConfiguration({
        FRONTEND_ORIGIN: "https://app.rentmate.example",
        NEXT_PUBLIC_API_BASE_URL: "https://api.rentmate.example",
        RENTMATE_SMOKE_REQUIRE_AUTHENTICATED: "true",
        RENTMATE_SMOKE_TENANT_EMAIL: "tenant@example.com",
        RENTMATE_SMOKE_TENANT_PASSWORD: "tenant-password"
      }),
    /RENTMATE_SMOKE_LANDLORD_EMAIL/
  );
});

test("authenticated production smoke verifies all roles and clears each isolated session", async () => {
  const configuration = readActiveSmokeConfiguration({
    FRONTEND_ORIGIN: "https://app.rentmate.example",
    NEXT_PUBLIC_API_BASE_URL: "https://api.rentmate.example",
    RENTMATE_SMOKE_REQUIRE_AUTHENTICATED: "true",
    RENTMATE_SMOKE_TENANT_EMAIL: "tenant@example.com",
    RENTMATE_SMOKE_TENANT_PASSWORD: "tenant-password",
    RENTMATE_SMOKE_LANDLORD_EMAIL: "landlord@example.com",
    RENTMATE_SMOKE_LANDLORD_PASSWORD: "landlord-password",
    RENTMATE_SMOKE_ADMIN_EMAIL: "admin@example.com",
    RENTMATE_SMOKE_ADMIN_PASSWORD: "admin-password"
  });
  const rolesByEmail = new Map([
    ["tenant@example.com", "TENANT"],
    ["landlord@example.com", "LANDLORD"],
    ["admin@example.com", "ADMIN"]
  ]);
  const sessionCookies = [];
  const corsHeaders = {
    "access-control-allow-origin": configuration.frontendOrigin,
    "access-control-allow-credentials": "true"
  };
  const fetcher = async (input, init = {}) => {
    const url = String(input);
    if (url === configuration.frontendOrigin) return new Response("<html>RentMate</html>");
    if (url.endsWith("/api/health")) {
      return Response.json({ status: "ok" }, { headers: { "x-request-id": "auth-health" } });
    }
    if (url.endsWith("/api/v1/listings?page=1&pageSize=1")) {
      return Response.json(
        { data: [], pagination: { page: 1, pageSize: 1, hasNextPage: false } },
        { headers: { ...corsHeaders, "x-request-id": "auth-public" } }
      );
    }
    if (url.endsWith("/api/v1/auth/login")) {
      const inputBody = JSON.parse(String(init.body));
      const role = rolesByEmail.get(inputBody.email);
      assert.ok(role);
      const cookie = `rentmate_session=${role.toLowerCase()}-session`;
      sessionCookies.push(cookie);
      return Response.json(
        { data: { role } },
        {
          headers: {
            ...corsHeaders,
            "x-request-id": `auth-login-${role}`,
            "set-cookie": `${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax`
          }
        }
      );
    }

    const headers = new Headers(init.headers);
    assert.match(headers.get("cookie") ?? "", /^rentmate_session=(tenant|landlord|admin)-session$/);
    if (url.endsWith("/api/v1/auth/logout")) {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders, "x-request-id": "auth-logout" }
      });
    }
    return Response.json(
      { data: [], pagination: { page: 1, pageSize: 1, hasNextPage: false } },
      { headers: { ...corsHeaders, "x-request-id": "auth-protected-read" } }
    );
  };

  assert.deepEqual(await runActiveSmoke(configuration, fetcher), { checkCount: 12, productWritesPerformed: false });
  assert.deepEqual(sessionCookies, [
    "rentmate_session=tenant-session",
    "rentmate_session=landlord-session",
    "rentmate_session=admin-session"
  ]);
});

test("clean-stack verification checks Gateway health and one read-only public collection", async () => {
  const configuration = readActiveStackVerificationConfiguration({
    RENTMATE_STACK_API_ORIGIN: "http://localhost:4401",
    FRONTEND_ORIGIN: "http://localhost:3000",
    RENTMATE_STACK_STARTUP_TIMEOUT_MS: "10000"
  });
  const requestedUrls = [];
  const fetcher = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.endsWith("/api/health")) {
      return Response.json({ status: "ok" }, { headers: { "x-request-id": "stack-health" } });
    }
    return Response.json(
      { data: [], pagination: { page: 1, pageSize: 1, hasNextPage: false } },
      {
        headers: {
          "x-request-id": "stack-listings",
          "access-control-allow-origin": configuration.frontendOrigin,
          "access-control-allow-credentials": "true"
        }
      }
    );
  };

  assert.deepEqual(await runActiveStackVerification(configuration, fetcher), {
    checkCount: 2,
    productWritesPerformed: false
  });
  assert.deepEqual(requestedUrls, [
    "http://localhost:4401/api/health",
    "http://localhost:4401/api/v1/listings?page=1&pageSize=1"
  ]);
  assert.throws(
    () =>
      readActiveStackVerificationConfiguration({
        RENTMATE_STACK_API_ORIGIN: "http://user:password@localhost:4401",
        FRONTEND_ORIGIN: "http://localhost:3000"
      }),
    /exact HTTP\(S\) origin/
  );
});

test("active application images and Compose services enforce a non-root bounded runtime", () => {
  const microservicesDockerfile = readRepositoryFile("Dockerfile.microservices");
  const gatewayDockerfile = readRepositoryFile("Dockerfile.gateway");
  assert.match(microservicesDockerfile, /^USER node$/m);
  assert.match(gatewayDockerfile, /^USER node$/m);
  for (const dockerfile of [microservicesDockerfile, gatewayDockerfile]) {
    assert.match(dockerfile, /org\.opencontainers\.image\.version/);
    assert.match(dockerfile, /org\.opencontainers\.image\.revision/);
  }

  const compose = readRepositoryFile("docker-compose.microservices.yml");
  assert.match(compose, /read_only: true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /pids_limit: 256/);
  assert.equal((compose.match(/<<: \*application-hardening/g) ?? []).length, 5);
  assert.equal(
    (compose.match(/^        RELEASE_VERSION: \$\{RENTMATE_RELEASE_VERSION:-development\}/gm) ?? []).length,
    5
  );
  assert.equal((compose.match(/^        SOURCE_REVISION: \$\{RENTMATE_SOURCE_REVISION:-unknown\}/gm) ?? []).length, 5);
});

test("security CI scans every active application image without building the compatibility backend", () => {
  const workflow = readRepositoryFile(".github/workflows/security.yml");
  assert.match(workflow, /branches: \[master\]/);
  for (const image of ["identity", "listing", "engagement", "verification", "gateway"]) {
    assert.match(workflow, new RegExp(`name: ${image}`));
  }
  assert.match(workflow, /image-ref:/);
  assert.match(workflow, /scan-type: image/);
  assert.doesNotMatch(workflow, /SERVICE=backend|Dockerfile\.backend|rentmate-backend/);
});

test("active CI tests the delivery adapter and proves clean migrations on a disposable stack", () => {
  const workflow = readRepositoryFile(".github/workflows/microservices.yml");
  assert.match(workflow, /branches: \[master\]/);
  const rootPackage = JSON.parse(readRepositoryFile("package.json"));
  assert.match(rootPackage.scripts["test:active"], /verification-delivery-adapter test/);
  assert.match(workflow, /npm ci --prefix services\/verification-delivery-adapter/);
  assert.match(workflow, /npm audit --prefix services\/verification-delivery-adapter/);
  assert.match(workflow, /Apply every active clean migration[\s\S]*npm run migrate:clean/);
  assert.match(workflow, /Start active application topology[\s\S]*--wait identity listing engagement gateway/);
  assert.match(workflow, /npm run verify:active-stack/);
  assert.match(workflow, /down --volumes --remove-orphans/);
  assert.doesNotMatch(workflow, /npm (?:ci|run)[^\n]*backend/);
});

test("release evidence inventories only active inputs with immutable migration checksums", async () => {
  assert.throws(() => validateReleaseIdentity("../unsafe", "a".repeat(40)), /RENTMATE_RELEASE_VERSION/);
  assert.throws(() => validateReleaseIdentity("2026.09.27", "not-a-git-revision"), /RENTMATE_SOURCE_REVISION/);
  assert.throws(() => assertCleanSourceRevision(repositoryRoot, "a".repeat(40)), /must match the checked-out/);

  const identity = validateReleaseIdentity("2026.09.27-test", "a".repeat(40));
  const images = collectLocalImageEvidence(identity, (reference) => ({
    Id: `sha256:${createHash("sha256").update(reference).digest("hex")}`,
    Config: {
      Labels: {
        "org.opencontainers.image.title": reference.startsWith("rentmate-gateway:")
          ? "rentmate-gateway"
          : reference.startsWith("rentmate-verification-delivery:")
            ? "rentmate-verification-delivery-adapter"
            : `${reference.split(":")[0]}-service`,
        "org.opencontainers.image.version": identity.version,
        "org.opencontainers.image.revision": identity.sourceRevision,
        "org.opencontainers.image.vendor": "RentMate"
      }
    }
  }));
  assert.equal(images.length, 5);
  assert.throws(
    () =>
      collectLocalImageEvidence(identity, () => ({
        Id: `sha256:${"b".repeat(64)}`,
        Config: { Labels: {} }
      })),
    /OCI labels do not match/
  );
  assert.throws(
    () =>
      collectLocalImageEvidence(identity, () => ({
        Id: `sha256:${"b".repeat(64)}`,
        Config: {
          Labels: {
            "org.opencontainers.image.title": "rentmate-wrong-service",
            "org.opencontainers.image.version": identity.version,
            "org.opencontainers.image.revision": identity.sourceRevision,
            "org.opencontainers.image.vendor": "RentMate"
          }
        }
      })),
    /OCI labels do not match/
  );

  const evidence = await collectReleaseEvidence({
    ...identity,
    images,
    generatedAt: "2026-09-27T00:00:00.000Z"
  });
  assert.equal(evidence.schemaVersion, 2);
  assert.equal(evidence.topology, "active-microservices");
  assert.ok(evidence.images.every((image) => /^sha256:[0-9a-f]{64}$/.test(image.imageId)));
  assert.deepEqual(
    evidence.migrations.map(({ service, count, highestVersion }) => ({ service, count, highestVersion })),
    [
      { service: "identity", count: 6, highestVersion: 6 },
      { service: "listing", count: 8, highestVersion: 8 },
      { service: "engagement", count: 21, highestVersion: 21 }
    ]
  );
  const inventoriedPaths = [
    ...evidence.files.map((file) => file.path),
    ...evidence.migrations.flatMap((service) => service.files.map((file) => file.path))
  ];
  assert.ok(inventoriedPaths.every((filePath) => !filePath.startsWith("backend/")));
  assert.ok(evidence.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256) && file.bytes > 0));

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "rentmate-release-evidence-"));
  try {
    const paths = await writeReleaseEvidence(evidence, temporaryRoot);
    const manifest = await readFile(paths.manifestPath, "utf8");
    const checksum = await readFile(paths.checksumPath, "utf8");
    assert.equal(checksum, `${createHash("sha256").update(manifest).digest("hex")}  release-manifest.json\n`);
    await assert.rejects(writeReleaseEvidence(evidence, temporaryRoot), /already exists/);
  } finally {
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    assert.ok(resolvedTemporaryRoot.startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    await rm(resolvedTemporaryRoot, { recursive: true, force: true });
  }

  const workflow = readRepositoryFile(".github/workflows/microservices.yml");
  assert.match(workflow, /npm run release:evidence/);
  assert.ok(workflow.indexOf("Generate active release evidence") < workflow.indexOf("Build frontend"));
  assert.match(workflow, /RENTMATE_IMAGE_TAG: ci-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /RENTMATE_SOURCE_REVISION: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /artifacts\/release-evidence\/ci-\$\{\{ github\.sha \}\}/);
});
