import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const listingsRoot = path.resolve(backendRoot, "src/modules/listings");

function git(...arguments_: string[]): string {
  return execFileSync("git", arguments_, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

describe("RM-022 application isolation", () => {
  it("keeps the exact RM-021 production listings inventory and Phase 4 routes", async () => {
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
    expect(routes).not.toMatch(/favorite|admin/i);
  });

  it("adds no production, migration, dependency, lockfile, frontend, or frozen-document change", async () => {
    expect(
      git(
        "diff",
        "--name-only",
        "--",
        "backend/src/app.ts",
        "backend/src/config",
        "backend/src/modules/auth",
        "backend/src/modules/users",
        "backend/src/shared",
        "backend/src/db",
        "backend/migrations",
        "package-lock.json",
        "frontend",
        "docs",
        "AGENTS.md",
        ".env.example"
      )
    ).toBe("");
    const migrations = (await readdir(path.resolve(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(migrations.some((filename) => filename.startsWith("0013"))).toBe(false);

    const packageJson = JSON.parse(await readFile(path.resolve(backendRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies).toStrictEqual({
      bcrypt: "6.0.0",
      cloudinary: "^2.10.0",
      cors: "2.8.5",
      dotenv: "16.5.0",
      express: "5.1.0",
      jose: "6.2.6",
      multer: "^2.2.0",
      pg: "8.16.0"
    });
  });

  it("keeps the committed RM-022 Phase 4 verification surface", () => {
    expect(
      git(
        "ls-files",
        "--",
        "backend/test/helpers/listings-phase4-fixture.ts",
        "backend/test/rm022-application-isolation.test.ts",
        "backend/test/rm022-phase4-contract.integration.test.ts",
        "backend/test/rm022-phase4.database.integration.test.ts"
      )
        .split(/\r?\n/)
        .filter(Boolean)
        .sort()
    ).toStrictEqual(
      [
        "backend/test/helpers/listings-phase4-fixture.ts",
        "backend/test/rm022-application-isolation.test.ts",
        "backend/test/rm022-phase4-contract.integration.test.ts",
        "backend/test/rm022-phase4.database.integration.test.ts"
      ].sort()
    );
  });

  it("keeps production free of RM-023 behavior and generic frameworks", async () => {
    const sources = await Promise.all(
      (await readdir(listingsRoot)).map((filename) => readFile(path.join(listingsRoot, filename), "utf8"))
    );
    const combined = sources.join("\n");
    expect(combined).not.toMatch(
      /BaseRepository|GenericRepository|Container|Decorator|module.?registry|route.?discovery|auto.?discover/i
    );
    expect(combined).not.toMatch(/bulk.?upload|image.?replacement|queue|worker|outbox/i);
  });
});
