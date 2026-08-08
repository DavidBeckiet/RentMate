import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const listingsRoot = path.resolve(backendRoot, "src/modules/listings");

function gitDiff(...paths: string[]): string {
  return execFileSync("git", ["diff", "--name-only", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
}

describe("RM-021 application isolation", () => {
  it("contains only the RM-019, RM-020, and RM-021 listings production files", async () => {
    expect((await readdir(path.resolve(backendRoot, "src/modules"))).sort()).toStrictEqual([
      "auth",
      "listings",
      "users"
    ]);
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
      "routes.ts"
    ]);
  });

  it("registers exactly two public lookups, one owner create, and two owner reads", async () => {
    const routes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    const routeMatches = [...routes.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)].map((match) => [
      match[1],
      match[2]
    ]);

    expect(routeMatches).toStrictEqual([
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
      ["delete", "/landlord/listings/:listingId/images/:imageId"],
      ["put", "/landlord/listings/:listingId/images/order"],
      ["post", "/geocoding/forward"]
    ]);
    expect(routes).toMatch(
      /router\.get\([\s\S]*"\/landlord\/listings"[\s\S]*dependencies\.authenticationMiddleware[\s\S]*dependencies\.landlordRoleMiddleware[\s\S]*createListOwnerListingsHandler/
    );
    expect(routes).toMatch(
      /router\.get\([\s\S]*"\/landlord\/listings\/:listingId"[\s\S]*dependencies\.authenticationMiddleware[\s\S]*dependencies\.landlordRoleMiddleware[\s\S]*createGetOwnerListingDetailHandler/
    );
    const lookupRegistrations = routeMatches.filter(([, route]) => route?.startsWith("/lookups/"));
    expect(lookupRegistrations).toHaveLength(2);
    expect(routes).not.toMatch(/admin/i);
    expect(routes).not.toMatch(/"\/listings(?:\/|"|\?)/);
  });

  it("keeps RM-021 reads free of writes, locks, total counts, provider IDs, and N+1 loops", async () => {
    const readFiles = [
      "current-moderation-reason-repository.ts",
      "current-moderation-reason.ts",
      "owner-image-mapper.ts",
      "owner-listing-read-controller.ts",
      "owner-listing-read-repository.ts",
      "owner-listing-read-service.ts",
      "owner-listing-read-validation.ts",
      "owner-listing-summary-mapper.ts"
    ];
    const sources = await Promise.all(readFiles.map((filename) => readFile(path.join(listingsRoot, filename), "utf8")));
    const combined = sources.join("\n");
    const repository = sources[4]!;

    expect(combined).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|FOR UPDATE)\b/i);
    expect(repository).not.toMatch(/count\s*\(|SELECT\s+\*/i);
    expect(repository).not.toMatch(/cloudinary_public_id|is_active|public.?visibility/i);
    expect(combined).not.toMatch(/cloudinaryPublicId|cloudinary_public_id/);
    expect(repository).not.toMatch(/for\s*\([^)]*\)\s*\{[\s\S]*executor\.query/i);
    expect(combined).not.toMatch(/nominatim|geocod|favorite|lifecycle|upload|reorder/i);
    expect(combined).not.toMatch(/BaseRepository|GenericRepository|Container|Decorator|route.?discovery/i);
  });

  it("keeps schema, dependencies, locks, frontend, and frozen documents unchanged", async () => {
    const migrations = (await readdir(path.resolve(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    const backendPackage = JSON.parse(await readFile(path.resolve(backendRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };

    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(migrations.some((filename) => filename.startsWith("0013"))).toBe(false);
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
    expect(gitDiff("package-lock.json")).toBe("");
    expect(gitDiff("backend/migrations", "frontend", "docs", "AGENTS.md")).toBe("");
  });

  it("changes only composition outside the listings module production boundary", async () => {
    const composition = await readFile(path.resolve(backendRoot, "src/server-composition.ts"), "utf8");
    const server = await readFile(path.resolve(backendRoot, "src/server.ts"), "utf8");

    expect(composition).toContain("createOwnerListingReadRepository(options.sqlExecutor)");
    expect(composition).toContain("createOwnerListingReadService(ownerListingReadRepository)");
    expect(composition.match(/registerListingsRoutes\(/g)).toHaveLength(1);
    expect(server).toContain("withTransaction(databasePool, logger, operation)");
    expect(
      gitDiff(
        "backend/src/app.ts",
        "backend/src/config/env.ts",
        ".env.example",
        "backend/src/modules/auth",
        "backend/src/modules/users",
        "backend/src/shared",
        "backend/src/db"
      )
    ).toBe("");
  });
});
