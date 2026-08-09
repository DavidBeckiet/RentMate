import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const favoritesRoot = path.join(sourceRoot, "modules", "favorites");

function gitDiff(...paths: string[]): string {
  return execFileSync("git", ["diff", "--name-only", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
}

describe("RM-039 application isolation", () => {
  it("contains exactly four business modules and five favorite production files", async () => {
    expect((await readdir(path.join(sourceRoot, "modules"))).sort()).toStrictEqual([
      "auth",
      "favorites",
      "listings",
      "users"
    ]);
    expect((await readdir(favoritesRoot)).sort()).toStrictEqual([
      "favorite-controller.ts",
      "favorite-repository.ts",
      "favorite-service.ts",
      "favorite-validation.ts",
      "routes.ts"
    ]);
  });

  it("registers V1-23, V1-24, and V1-25 exactly once in the 25-route API", async () => {
    const modules = ["auth", "favorites", "listings", "users"];
    const sources = await Promise.all(
      modules.map((module) => readFile(path.join(sourceRoot, "modules", module, "routes.ts"), "utf8"))
    );
    const routePattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const routes = sources.flatMap((source) => [...source.matchAll(routePattern)].map((match) => [match[1], match[2]]));
    expect(routes).toHaveLength(25);
    expect(routes.filter(([method, route]) => method === "get" && route === "/favorites")).toHaveLength(1);
    expect(routes.filter(([method, route]) => method === "put" && route === "/favorites/:listingId")).toHaveLength(1);
    expect(routes.filter(([method, route]) => method === "delete" && route === "/favorites/:listingId")).toHaveLength(
      1
    );
    expect(routes.filter(([, route]) => route?.includes("favorites"))).toStrictEqual([
      ["get", "/favorites"],
      ["put", "/favorites/:listingId"],
      ["delete", "/favorites/:listingId"]
    ]);
  });

  it("keeps favorites narrow, parameterized, count-free, and provider-free", async () => {
    const files = await readdir(favoritesRoot);
    const sources = await Promise.all(files.map((file) => readFile(path.join(favoritesRoot, file), "utf8")));
    const combined = sources.join("\n");
    const repository = await readFile(path.join(favoritesRoot, "favorite-repository.ts"), "utf8");
    expect(repository).toContain("mapPublicListingSummaryRow");
    expect(repository).toMatch(/ON CONFLICT \(tenant_id, listing_id\)[\s\S]*DO NOTHING/);
    expect(repository).not.toMatch(/DO UPDATE|COUNT\s*\(|FOR\s+UPDATE|BEGIN|COMMIT|ROLLBACK/i);
    expect(combined).not.toMatch(
      /Cloudinary|Nominatim|notification|queue|worker|outbox|folder|ranking|favorite.?count|RM-040|RM-041/i
    );
  });

  it("adds no migration, dependency, lockfile, frontend, provider, shared, listing, or frozen-document change", async () => {
    expect((await readdir(path.join(backendRoot, "migrations"))).filter((file) => file.endsWith(".sql"))).toHaveLength(
      12
    );
    expect(
      gitDiff(
        "backend/src/server.ts",
        "backend/src/app.ts",
        "backend/src/modules/listings",
        "backend/src/shared",
        "backend/src/integrations",
        "backend/migrations",
        "frontend",
        "docs",
        "AGENTS.md",
        ".env.example",
        "backend/package-lock.json",
        "package-lock.json"
      )
    ).toBe("");
  });

  it("routes RM-039 suites through the correct serial Vitest configuration", async () => {
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const ordinary = await readFile(path.join(backendRoot, "vitest.config.mts"), "utf8");
    const database = await readFile(path.join(backendRoot, "vitest.database.config.mts"), "utf8");
    expect(backendPackage.scripts["test:rm039"]).toContain("rm039-favorite-http.integration.test.ts");
    expect(backendPackage.scripts["test:rm039"]).not.toContain("rm039-favorite.database.integration.test.ts");
    expect(backendPackage.scripts["test:rm039:database"]).toContain("rm039-favorite.database.integration.test.ts");
    expect(rootPackage.scripts["test:rm039"]).toBe("npm --prefix backend run test:rm039");
    expect(rootPackage.scripts["test:rm039:database"]).toBe("npm --prefix backend run test:rm039:database");
    expect(ordinary).toContain('"test/rm039-favorite.database.integration.test.ts"');
    expect(database).toContain('"test/rm039-favorite.database.integration.test.ts"');
    expect(database).toContain("fileParallelism: false");
  });
});
