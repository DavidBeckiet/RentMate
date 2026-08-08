import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const listingsRoot = path.join(backendRoot, "src/modules/listings");

function gitDiff(...paths: string[]): string {
  return execFileSync("git", ["diff", "--name-only", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
}

describe("RM-025 application isolation", () => {
  it("keeps the exact 43-file listings inventory and one explicit submit route", async () => {
    expect((await readdir(listingsRoot)).sort()).toStrictEqual([
      "current-moderation-reason-repository.ts",
      "current-moderation-reason.ts",
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
      ["post", "/landlord/listings"],
      ["get", "/landlord/listings"],
      ["get", "/landlord/listings/:listingId"],
      ["patch", "/landlord/listings/:listingId"],
      ["post", "/landlord/listings/:listingId/submit"],
      ["post", "/landlord/listings/:listingId/deactivate"],
      ["post", "/landlord/listings/:listingId/reactivate"],
      ["delete", "/landlord/listings/:listingId"],
      ["post", "/landlord/listings/:listingId/images"],
      ["delete", "/landlord/listings/:listingId/images/:imageId"]
    ]);
    expect(routes.match(/"\/landlord\/listings\/:listingId\/submit"/g)).toHaveLength(1);
    expect(routes).not.toMatch(/geocod|favorite|admin|"\/listings"|images\/order/i);
  });

  it("keeps submit persistence fixed, transaction-bound, and free of adjacent writes", async () => {
    const repository = await readFile(path.join(listingsRoot, "listing-submit-repository.ts"), "utf8");
    const service = await readFile(path.join(listingsRoot, "listing-submit-service.ts"), "utf8");
    expect(repository).toMatch(/FOR UPDATE OF l/);
    expect(repository).toMatch(/SELECT NOT EXISTS[\s\S]*LEFT JOIN amenities/);
    expect(repository).toMatch(/SELECT EXISTS[\s\S]*FROM listing_images/);
    expect(repository.match(/UPDATE listings/g)).toHaveLength(1);
    expect(repository).toContain("SET status = 'PENDING', updated_at = CURRENT_TIMESTAMP");
    expect(repository).not.toMatch(/INSERT INTO|DELETE FROM|moderation_history|cloudinary|nominatim/i);
    expect(service).toContain("createOwnerListingReadService(ownerReadFactory(executor))");
    expect(service).not.toMatch(/listing-lifecycle-policy|moderation_history|cloudinary|nominatim/i);
  });

  it("leaves the significant-edit policy submit-free and adds no framework", async () => {
    const policy = await readFile(path.join(listingsRoot, "listing-lifecycle-policy.ts"), "utf8");
    const sources = await Promise.all(
      (await readdir(listingsRoot)).map((filename) => readFile(path.join(listingsRoot, filename), "utf8"))
    );
    expect(policy).not.toMatch(/submit|deactivate|reactivate|admin|moderation|image|transaction|sql/i);
    expect(sources.join("\n")).not.toMatch(
      /BaseRepository|GenericRepository|DIContainer|module.?registry|event.?bus|workflow.?engine|route.?discovery/i
    );
  });

  it("adds no schema, dependency, lockfile, fixture, frontend, or frozen-document change", async () => {
    expect(
      gitDiff(
        "backend/src/app.ts",
        "backend/src/config",
        "backend/src/modules/auth",
        "backend/src/modules/users",
        "backend/src/shared",
        "backend/src/db",
        "backend/migrations",
        "backend/test/helpers/listings-phase4-fixture.ts",
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
    const packageJson = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
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
});
