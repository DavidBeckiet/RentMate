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
  it("creates only the focused listings lookup boundary", async () => {
    const modules = (await readdir(path.resolve(backendRoot, "src/modules"))).sort();
    const listingsFiles = (await readdir(listingsRoot)).sort();

    expect(modules).toStrictEqual(["auth", "listings", "users"]);
    expect(listingsFiles).toStrictEqual([
      "lookup-controller.ts",
      "lookup-mapper.ts",
      "lookup-repository.ts",
      "routes.ts"
    ]);
  });

  it("registers exactly the two public GET lookup paths without middleware or aliases", async () => {
    const routes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    const routeMatches = [...routes.matchAll(/router\.(get|post|patch|put|delete)\("([^"]+)"/g)].map((match) => [
      match[1],
      match[2]
    ]);

    expect(routeMatches).toStrictEqual([
      ["get", "/lookups/property-types"],
      ["get", "/lookups/amenities"]
    ]);
    expect(routes).not.toMatch(/authentication|optional|role|rate.?limit|cache|admin|landlord|listings\/:|draft/i);
  });

  it("keeps listings sources read-only and free of adjacent roadmap behavior or generic frameworks", async () => {
    const sources = await Promise.all(
      ["lookup-controller.ts", "lookup-mapper.ts", "lookup-repository.ts", "routes.ts"].map((filename) =>
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

  it("changes composition without changing app/server, auth/users, shared, or database infrastructure", async () => {
    const composition = await readFile(path.resolve(backendRoot, "src/server-composition.ts"), "utf8");

    expect(composition.match(/registerListingsRoutes\(/g)).toHaveLength(1);
    expect(composition).toContain("createLookupRepository(options.sqlExecutor)");
    expect(composition).toContain("registerAuthRoutes");
    expect(composition).toContain("registerUsersRoutes");
    expect(
      gitDiff(
        "backend/src/app.ts",
        "backend/src/server.ts",
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
