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

describe("RM-020 application isolation", () => {
  it("contains only the RM-019 lookup boundary and five RM-020 production files", async () => {
    const modules = (await readdir(path.resolve(backendRoot, "src/modules"))).sort();
    const listingsFiles = (await readdir(listingsRoot)).sort();

    expect(modules).toStrictEqual(["auth", "listings", "users"]);
    expect(listingsFiles).toStrictEqual([
      "listing-create-controller.ts",
      "listing-create-repository.ts",
      "listing-create-service.ts",
      "listing-create-validation.ts",
      "lookup-controller.ts",
      "lookup-mapper.ts",
      "lookup-repository.ts",
      "owner-listing-mapper.ts",
      "routes.ts"
    ]);
  });

  it("registers exactly two public lookups and one protected landlord create route", async () => {
    const routes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    const routeMatches = [...routes.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)].map((match) => [
      match[1],
      match[2]
    ]);

    expect(routeMatches).toStrictEqual([
      ["get", "/lookups/property-types"],
      ["get", "/lookups/amenities"],
      ["post", "/landlord/listings"]
    ]);
    expect(routes).toMatch(
      /router\.post\([\s\S]*"\/landlord\/listings"[\s\S]*authenticationMiddleware[\s\S]*landlordRoleMiddleware[\s\S]*createListingDraftHandler/
    );
    const lookupRegistrations = [...routes.matchAll(/router\.get\([\s\S]*?\);/g)].map((match) => match[0]);
    expect(lookupRegistrations).toHaveLength(2);
    expect(lookupRegistrations.join("\n")).not.toMatch(/authenticationMiddleware|landlordRoleMiddleware/);
    expect(routes).not.toMatch(/listings\/:|router\.(?:patch|put|delete)|submit|deactivate|reactivate|geocod|admin/i);
  });

  it("limits writes to one DRAFT listing insert and one set-based amenity insert", async () => {
    const repository = await readFile(path.join(listingsRoot, "listing-create-repository.ts"), "utf8");
    const sources = await Promise.all(
      (await readdir(listingsRoot)).map((filename) => readFile(path.join(listingsRoot, filename), "utf8"))
    );
    const combined = sources.join("\n");
    const inserts = [...combined.matchAll(/INSERT INTO\s+([a-z_]+)/gi)].map((match) => match[1]);

    expect(inserts.sort()).toStrictEqual(["listing_amenities", "listings"]);
    expect(repository).toContain("VALUES ($1, $2, 'DRAFT'");
    expect(repository).toContain("UNNEST($2::smallint[])");
    expect(combined).not.toMatch(/\b(?:UPDATE|DELETE|FOR UPDATE)\s+(?:listings|listing_amenities)\b/i);
    expect(combined).not.toMatch(/cloudinary|nominatim|upload|public.?search|favorite|moderation_history/i);
    expect(combined).not.toMatch(
      /BaseRepository|GenericRepository|Container|Decorator|route.?discovery|auto.?discover/i
    );
  });

  it("keeps schema, dependencies, lockfiles, frontend, and frozen documents unchanged", async () => {
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

  it("changes only the narrow production composition seam outside listings", async () => {
    const composition = await readFile(path.resolve(backendRoot, "src/server-composition.ts"), "utf8");
    const server = await readFile(path.resolve(backendRoot, "src/server.ts"), "utf8");

    expect(composition).toContain("readonly transactionRunner?: TransactionRunner");
    expect(composition).toContain("options.transactionRunner ?? unavailableTransactionRunner");
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
