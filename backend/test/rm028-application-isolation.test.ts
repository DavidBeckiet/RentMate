import { execFileSync } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const listingsRoot = path.join(backendRoot, "src/modules/listings");
const rm028Files = [
  "backend/test/rm028-application-isolation.test.ts",
  "backend/test/rm028-listing-concurrency.database.integration.test.ts",
  "backend/test/rm028-listing-lifecycle-contract.integration.test.ts",
  "backend/test/rm028-listing-lifecycle.database.integration.test.ts"
] as const;
const expectedFocusedTests = [
  "test/rm028-listing-lifecycle-contract.integration.test.ts",
  "test/rm028-application-isolation.test.ts",
  "test/rm009-transaction.test.ts",
  "test/rm023-listing-update-validation.test.ts",
  "test/rm023-listing-update-state.test.ts",
  "test/rm023-listing-update-repository.test.ts",
  "test/rm023-listing-update-service.test.ts",
  "test/rm023-listing-update-http.integration.test.ts",
  "test/rm023-application-isolation.test.ts",
  "test/rm024-listing-lifecycle-policy.test.ts",
  "test/rm024-current-moderation-reason.test.ts",
  "test/rm024-current-moderation-reason-repository.test.ts",
  "test/rm024-application-isolation.test.ts",
  "test/rm025-listing-completeness.test.ts",
  "test/rm025-listing-submit-repository.test.ts",
  "test/rm025-listing-submit-service.test.ts",
  "test/rm025-listing-submit-http.integration.test.ts",
  "test/rm025-application-isolation.test.ts",
  "test/rm026-listing-lifecycle-action-repository.test.ts",
  "test/rm026-listing-lifecycle-action-service.test.ts",
  "test/rm026-listing-lifecycle-action-http.integration.test.ts",
  "test/rm026-application-isolation.test.ts",
  "test/rm027-listing-delete-repository.test.ts",
  "test/rm027-listing-delete-service.test.ts",
  "test/rm027-listing-delete-http.integration.test.ts",
  "test/rm027-application-isolation.test.ts"
] as const;

function git(...arguments_: string[]): string {
  return execFileSync("git", arguments_, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

describe("RM-028 application isolation and M3 acceptance inventory", () => {
  it("keeps the exact 55-file production listings inventory and fifteen routes", async () => {
    expect((await readdir(listingsRoot)).sort()).toStrictEqual([
      "current-moderation-reason-repository.ts",
      "current-moderation-reason.ts",
      "geocoding-controller.ts",
      "geocoding-service.ts",
      "geocoding-validation.ts",
      "listing-completeness.ts",
      "listing-create-controller.ts",
      "listing-create-repository.ts",
      "listing-create-service.ts",
      "listing-create-validation.ts",
      "listing-delete-cleanup.ts",
      "listing-delete-cloudinary-cleanup.ts",
      "listing-delete-controller.ts",
      "listing-delete-repository.ts",
      "listing-delete-service.ts",
      "listing-image-delete-controller.ts",
      "listing-image-delete-repository.ts",
      "listing-image-delete-service.ts",
      "listing-image-order-controller.ts",
      "listing-image-order-repository.ts",
      "listing-image-order-service.ts",
      "listing-image-order-validation.ts",
      "listing-image-upload-controller.ts",
      "listing-image-upload-multipart.ts",
      "listing-image-upload-repository.ts",
      "listing-image-upload-service.ts",
      "listing-image-upload-validation.ts",
      "listing-lifecycle-action-controller.ts",
      "listing-lifecycle-action-repository.ts",
      "listing-lifecycle-action-service.ts",
      "listing-lifecycle-policy.ts",
      "listing-submit-controller.ts",
      "listing-submit-repository.ts",
      "listing-submit-service.ts",
      "listing-update-controller.ts",
      "listing-update-repository.ts",
      "listing-update-service.ts",
      "listing-update-state.ts",
      "listing-update-validation.ts",
      "lookup-controller.ts",
      "lookup-mapper.ts",
      "lookup-repository.ts",
      "owner-image-mapper.ts",
      "owner-listing-mapper.ts",
      "owner-listing-read-controller.ts",
      "owner-listing-read-repository.ts",
      "owner-listing-read-service.ts",
      "owner-listing-read-validation.ts",
      "owner-listing-summary-mapper.ts",
      "public-listing-detail-controller.ts",
      "public-listing-detail-mapper.ts",
      "public-listing-detail-repository.ts",
      "public-listing-detail-service.ts",
      "public-listing-search-bounding-box.ts",
      "public-listing-search-controller.ts",
      "public-listing-search-repository.ts",
      "public-listing-search-service.ts",
      "public-listing-search-validation.ts",
      "public-listing-summary-mapper.ts",
      "routes.ts"
    ]);
    const routes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    const registrations = [...routes.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)].map((match) => [
      match[1],
      match[2]
    ]);
    expect(registrations).toStrictEqual([
      ["get", "/lookups/property-types"],
      ["get", "/lookups/amenities"],
      ["get", "/listings"],
      ["get", "/listings/:listingId"],
      ["post", "/landlord/listings"],
      ["get", "/landlord/listings"],
      ["get", "/landlord/listings/:listingId"],
      ["patch", "/landlord/listings/:listingId"],
      ["post", "/landlord/listings/:listingId/submit"],
      ["post", "/landlord/listings/:listingId/deactivate"],
      ["post", "/landlord/listings/:listingId/reactivate"],
      ["delete", "/landlord/listings/:listingId"],
      ["post", "/landlord/listings/:listingId/images"],
      ["delete", "/landlord/listings/:listingId/images/:imageId"],
      ["put", "/landlord/listings/:listingId/images/order"],
      ["post", "/geocoding/forward"]
    ]);
    expect(routes).not.toMatch(/favorite|admin|moderation-actions/i);
  });

  it("contains exactly four RM-028 suites and the exact 26-file focused script", async () => {
    for (const file of rm028Files) await access(path.join(repositoryRoot, file));
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    const focusedFiles = backendPackage.scripts["test:rm028"]!.match(/test\/[\w.-]+\.test\.ts/g) ?? [];
    expect(focusedFiles).toStrictEqual(expectedFocusedTests);
    expect(focusedFiles).toHaveLength(26);
    expect(backendPackage.scripts["test:rm028:database"]).toBe(
      "vitest run --config vitest.database.config.mts test/rm028-listing-lifecycle.database.integration.test.ts test/rm028-listing-concurrency.database.integration.test.ts"
    );
    expect(backendPackage.dependencies).toStrictEqual({
      bcrypt: "6.0.0",
      cloudinary: "^2.10.0",
      cors: "2.8.5",
      dotenv: "16.5.0",
      express: "5.1.0",
      jose: "6.2.6",
      multer: "^2.2.0",
      pg: "8.16.0"
    });

    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(rootPackage.scripts["test:rm028"]).toBe("npm --prefix backend run test:rm028");
    expect(rootPackage.scripts["test:rm028:database"]).toBe("npm --prefix backend run test:rm028:database");
  });

  it("keeps ordinary/database Vitest routing exact and database files serial", async () => {
    const ordinary = await readFile(path.join(backendRoot, "vitest.config.mts"), "utf8");
    const database = await readFile(path.join(backendRoot, "vitest.database.config.mts"), "utf8");
    for (const filename of [
      "rm028-listing-lifecycle.database.integration.test.ts",
      "rm028-listing-concurrency.database.integration.test.ts"
    ]) {
      expect(ordinary).toContain(`"test/${filename}"`);
      expect(database).toContain(`"test/${filename}"`);
    }
    expect(database).toContain("fileParallelism: false");
  });

  it("adds no schema, dependency lock, fixture, historical test, frontend, or frozen-document change", async () => {
    expect(
      git(
        "diff",
        "--name-only",
        "--",
        "backend/migrations",
        "backend/test/helpers/listings-phase4-fixture.ts",
        "backend/test/support/test-database.ts",
        "package-lock.json",
        "frontend",
        "docs",
        "AGENTS.md",
        ".env.example"
      )
    ).toBe("");
    const migrations = (await readdir(path.join(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(migrations).not.toContain("0013.sql");
  });

  it("represents all frozen M3 lifecycle and real-lock acceptance concerns without RM-029 work", async () => {
    const lifecycle = await readFile(
      path.join(backendRoot, "test/rm028-listing-lifecycle.database.integration.test.ts"),
      "utf8"
    );
    const concurrency = await readFile(
      path.join(backendRoot, "test/rm028-listing-concurrency.database.integration.test.ts"),
      "utf8"
    );
    const contract = await readFile(
      path.join(backendRoot, "test/rm028-listing-lifecycle-contract.integration.test.ts"),
      "utf8"
    );
    for (const status of ["DRAFT", "PENDING", "REJECTED", "APPROVED", "INACTIVE", "HIDDEN"]) {
      expect(lifecycle).toContain(status);
    }
    expect(lifecycle).toMatch(/retired lookup|submit source-state|delete state\/history|rolls back/i);
    expect(contract).toMatch(/missing PATCH body|path, query, body precedence|never sets a session cookie/i);
    expect(concurrency).toContain("SELECT pg_backend_pid()::integer AS pid");
    expect(concurrency).toContain("SELECT pg_blocking_pids($1::integer) AS blockers");
    expect(concurrency).toMatch(/submit first|delete first|PATCH first|deactivate first/i);
    expect(concurrency).not.toMatch(/setTimeout|sleep\(/i);
    expect([...lifecycle, ...concurrency, ...contract].join("")).not.toMatch(
      /cloudinary\.v2|destroy\(|upload\(|queue|worker|RM-029/i
    );
  });
});
