import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const favoritesRoot = path.join(sourceRoot, "modules", "favorites");

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
    expect(routes).toHaveLength(31);
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

  it("preserves the current migration, provider, listing, and frozen-document inventories", async () => {
    expect((await readdir(path.join(backendRoot, "migrations"))).filter((file) => file.endsWith(".sql"))).toHaveLength(
      12
    );
    expect((await readdir(sourceRoot)).sort()).toStrictEqual([
      "app.ts",
      "config",
      "db",
      "integrations",
      "modules",
      "server-composition.ts",
      "server.ts",
      "shared",
      "shutdown.ts"
    ]);
    expect((await readdir(path.join(sourceRoot, "integrations"))).sort()).toStrictEqual([
      "cloudinary.client.ts",
      "nominatim.client.ts"
    ]);
    const listingsRoot = path.join(sourceRoot, "modules", "listings");
    expect((await readdir(listingsRoot)).sort()).toHaveLength(71);
    const listingsRoutes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    const routePattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    expect(
      [...listingsRoutes.matchAll(routePattern)]
        .map((match) => [match[1], match[2]])
        .filter(([, route]) => route?.startsWith("/admin"))
    ).toStrictEqual([
      ["post", "/admin/listings/:listingId/moderation-actions"],
      ["get", "/admin/listings"],
      ["get", "/admin/listings/:listingId/moderation-actions"],
      ["get", "/admin/listings/:listingId"]
    ]);
    const frozenDocuments = await Promise.all(
      [
        "AGENTS.md",
        "docs/requirements/REQUIREMENTS.md",
        "docs/architecture/ARCHITECTURE.md",
        "docs/database/DATABASE_DESIGN.md",
        "docs/api/API_SPECIFICATION.md",
        "docs/implementation/IMPLEMENTATION_ROADMAP.md"
      ].map((filename) => readFile(path.join(repositoryRoot, filename), "utf8"))
    );
    expect(frozenDocuments.every((document) => document.length > 0)).toBe(true);
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
