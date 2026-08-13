import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const frontendRoot = path.join(repositoryRoot, "frontend");
const modulesRoot = path.join(backendRoot, "src", "modules");
const migrationsRoot = path.join(backendRoot, "migrations");

const expectedRoutes = [
  "post:/auth/register/tenant",
  "post:/auth/register/landlord",
  "post:/auth/login",
  "post:/auth/logout",
  "get:/users/me",
  "patch:/users/me",
  "get:/lookups/property-types",
  "get:/lookups/amenities",
  "get:/listings",
  "get:/listings/:listingId",
  "post:/landlord/listings",
  "get:/landlord/listings",
  "get:/landlord/listings/:listingId",
  "patch:/landlord/listings/:listingId",
  "delete:/landlord/listings/:listingId",
  "post:/landlord/listings/:listingId/submit",
  "post:/landlord/listings/:listingId/deactivate",
  "post:/landlord/listings/:listingId/reactivate",
  "post:/landlord/listings/:listingId/images",
  "delete:/landlord/listings/:listingId/images/:imageId",
  "put:/landlord/listings/:listingId/images/order",
  "post:/geocoding/forward",
  "get:/favorites",
  "put:/favorites/:listingId",
  "delete:/favorites/:listingId",
  "get:/admin/listings",
  "get:/admin/listings/:listingId",
  "get:/admin/listings/:listingId/moderation-actions",
  "post:/admin/listings/:listingId/moderation-actions",
  "get:/admin/users",
  "patch:/admin/users/:userId/activation"
].sort();

const rm053ArtifactPaths = [
  "test/rm053-contract-inventory.test.ts",
  "test/rm053-authorization-matrix.test.ts",
  "test/rm053-fresh-backend.database.integration.test.ts",
  "test/rm053-lifecycle-visibility.database.integration.test.ts",
  "test/helpers/rm053-backend-fixture.ts",
  "test/verification/RM053_CONTRACT_INVENTORY.md"
] as const;

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => !["node_modules", "dist", "coverage"].includes(entry.name))
      .map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
      })
  );
  return files.flat();
}

async function routeInventory(): Promise<string[]> {
  const modules = ["auth", "favorites", "listings", "users"] as const;
  const sources = await Promise.all(
    modules.map((module) => readFile(path.join(modulesRoot, module, "routes.ts"), "utf8"))
  );
  const pattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
  return sources.flatMap((source) => [...source.matchAll(pattern)].map((match) => `${match[1]}:${match[2]}`)).sort();
}

describe("RM-053 application isolation", () => {
  it("keeps the frozen 31-endpoint API inventory without an RM-053 production route", async () => {
    const routes = await routeInventory();
    expect(routes).toHaveLength(31);
    expect(new Set(routes).size).toBe(31);
    expect(routes).toStrictEqual(expectedRoutes);
    const backendFiles = await filesUnder(backendRoot);
    const markedProductionFiles = backendFiles
      .filter((file) => /rm053/i.test(path.basename(file)))
      .map((file) => path.relative(backendRoot, file).replaceAll("\\", "/"))
      .filter((file) => file.startsWith("src/"));
    expect(markedProductionFiles).toStrictEqual([]);
  });

  it("limits RM-053 artifacts to the requested test-only scope without frontend or migration artifacts", async () => {
    const backendFiles = await filesUnder(backendRoot);
    const markedBackendFiles = backendFiles
      .filter((file) => /rm053/i.test(path.basename(file)))
      .map((file) => path.relative(backendRoot, file).replaceAll("\\", "/"))
      .sort();
    expect(markedBackendFiles).toStrictEqual(
      [
        "test/helpers/rm053-backend-fixture.ts",
        "test/rm053-application-isolation.test.ts",
        "test/rm053-authorization-matrix.test.ts",
        "test/rm053-contract-inventory.test.ts",
        "test/rm053-fresh-backend.database.integration.test.ts",
        "test/rm053-lifecycle-visibility.database.integration.test.ts",
        "test/verification/RM053_CONTRACT_INVENTORY.md"
      ].sort()
    );
    const frontendRm053Artifacts = (await filesUnder(frontendRoot)).filter((file) =>
      /rm053/i.test(path.basename(file))
    );
    const migrationRm053Artifacts = (await filesUnder(migrationsRoot)).filter((file) =>
      /rm053/i.test(path.basename(file))
    );
    expect(frontendRm053Artifacts).toStrictEqual([]);
    expect(migrationRm053Artifacts).toStrictEqual([]);
  });

  it("routes only the three ordinary and two guarded database RM-053 suites", async () => {
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(backendPackage.scripts["test:rm053"]).toBe(
      "vitest run --config vitest.config.mts test/rm053-contract-inventory.test.ts test/rm053-authorization-matrix.test.ts test/rm053-application-isolation.test.ts"
    );
    expect(backendPackage.scripts["test:rm053:database"]).toBe(
      "vitest run --config vitest.database.config.mts test/rm053-fresh-backend.database.integration.test.ts test/rm053-lifecycle-visibility.database.integration.test.ts"
    );
    expect(rootPackage.scripts["test:rm053"]).toBe("npm --prefix backend run test:rm053");
    expect(rootPackage.scripts["test:rm053:database"]).toBe("npm --prefix backend run test:rm053:database");
    const ordinaryConfig = await readFile(path.join(backendRoot, "vitest.config.mts"), "utf8");
    const databaseConfig = await readFile(path.join(backendRoot, "vitest.database.config.mts"), "utf8");
    for (const databaseFile of [
      "test/rm053-fresh-backend.database.integration.test.ts",
      "test/rm053-lifecycle-visibility.database.integration.test.ts"
    ]) {
      expect(ordinaryConfig).toContain(databaseFile);
      expect(databaseConfig).toContain(databaseFile);
    }
    expect(databaseConfig).toContain("fileParallelism: false");
  });

  it("uses guarded test-database and injected provider seams without logging secrets or adding browser tooling", async () => {
    const sources = await Promise.all(
      rm053ArtifactPaths.map(async (relativePath) => readFile(path.join(backendRoot, relativePath), "utf8"))
    );
    const joined = sources.join("\n");
    const helperSource = sources[4]!;
    expect(helperSource).toContain("createTestDatabasePool(source");
    expect(helperSource).toContain("current_database()");
    expect(helperSource).not.toMatch(/\bDATABASE_URL\b/);
    expect(helperSource).toContain("createRecordingCloudinary");
    expect(helperSource).toContain("createRecordingProvider");
    expect(helperSource).toContain("cloudinaryClient");
    expect(helperSource).toContain("nominatimClient");
    expect(joined).not.toMatch(/\b(?:playwright|testcontainers)\b/i);
    expect(joined).not.toMatch(/\bfetch\s*\(|https?:\/\/nominatim|cloudinary\.v2/i);
    expect(joined).not.toMatch(/console\.(?:log|info|warn|error)|process\.(?:stdout|stderr)/i);
    expect(joined).not.toMatch(/TEST_DATABASE_URL\s*=/);
  });
});
