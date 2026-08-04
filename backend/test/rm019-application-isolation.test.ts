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

describe("RM-019 application isolation", () => {
  it("preserves the focused lookup boundary while allowing only RM-020 create and RM-021 read files", async () => {
    const modules = (await readdir(path.resolve(backendRoot, "src/modules"))).sort();
    const listingsFiles = (await readdir(listingsRoot)).sort();

    expect(modules).toStrictEqual(["auth", "listings", "users"]);
    expect(listingsFiles).toStrictEqual([
      "listing-create-controller.ts",
      "listing-create-repository.ts",
      "listing-create-service.ts",
      "listing-create-validation.ts",
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

  it("preserves exactly two public GET lookups and permits only the owner create and read routes", async () => {
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
      ["patch", "/landlord/listings/:listingId"]
    ]);
    const lookupRegistrations = [...routes.matchAll(/router\.get\([\s\S]*?\);/g)].map((match) => match[0]);
    expect(lookupRegistrations.slice(0, 2)).toHaveLength(2);
    expect(lookupRegistrations.slice(0, 2).join("\n")).not.toMatch(/authenticationMiddleware|landlordRoleMiddleware/);
    expect(routes).toMatch(/router\.post\([\s\S]*authenticationMiddleware[\s\S]*landlordRoleMiddleware/);
    expect(routes).not.toMatch(/optional|rate.?limit|cache|admin|router\.(?:put|delete)/i);
  });

  it("keeps RM-019 lookup sources read-only and isolates the only allowed RM-020 writes", async () => {
    const sources = await Promise.all(
      ["lookup-controller.ts", "lookup-mapper.ts", "lookup-repository.ts"].map((filename) =>
        readFile(path.join(listingsRoot, filename), "utf8")
      )
    );
    const combined = sources.join("\n");

    expect(combined).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|FOR UPDATE)\b/);
    expect(combined).not.toMatch(
      /createRoleMiddleware|createOptionalAuthenticationMiddleware|createRateLimitMiddleware/
    );
    expect(combined).not.toMatch(/cloudinary|nominatim|geocod|favorite|moderation|lifecycle|image|public.?search/i);
    expect(combined).not.toMatch(
      /BaseRepository|GenericRepository|Container|Decorator|route.?discovery|auto.?discover/i
    );
    expect(combined).not.toMatch(/SELECT \*|sort_order|includeInactive|response\.json/);

    const createSources = await Promise.all(
      [
        "listing-create-controller.ts",
        "listing-create-repository.ts",
        "listing-create-service.ts",
        "listing-create-validation.ts",
        "owner-listing-mapper.ts"
      ].map((filename) => readFile(path.join(listingsRoot, filename), "utf8"))
    );
    const createCombined = createSources.join("\n");
    expect([...createCombined.matchAll(/INSERT INTO\s+([a-z_]+)/gi)].map((match) => match[1]).sort()).toStrictEqual([
      "listing_amenities",
      "listings"
    ]);
    expect(createCombined).not.toMatch(
      /\b(?:UPDATE|DELETE)\s+listings\b|cloudinary|nominatim|favorite|moderation_history/i
    );
  });

  it("preserves schema, dependencies, lockfiles, frontend, and frozen documents", async () => {
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
      cors: "2.8.5",
      dotenv: "16.5.0",
      express: "5.1.0",
      jose: "6.2.6",
      pg: "8.16.0"
    });
    expect(gitDiff("backend/package-lock.json", "package-lock.json")).toBe("");
    expect(gitDiff("backend/migrations", "frontend", "docs", "AGENTS.md")).toBe("");
  });

  it("changes composition and only the narrow server transaction seam outside listings", async () => {
    const composition = await readFile(path.resolve(backendRoot, "src/server-composition.ts"), "utf8");
    const server = await readFile(path.resolve(backendRoot, "src/server.ts"), "utf8");

    expect(composition.match(/registerListingsRoutes\(/g)).toHaveLength(1);
    expect(composition).toContain("createLookupRepository(options.sqlExecutor)");
    expect(composition).toContain("registerAuthRoutes");
    expect(composition).toContain("registerUsersRoutes");
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
