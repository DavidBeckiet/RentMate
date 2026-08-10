import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const listingsRoot = path.join(sourceRoot, "modules", "listings");

describe("RM-038 verification-only application isolation", () => {
  it("keeps the RM-037 listings inventory and current route inventory", async () => {
    expect(await readdir(listingsRoot)).toHaveLength(71);
    const routeFiles = ["auth", "favorites", "listings", "users"].map((module) =>
      path.join(sourceRoot, "modules", module, "routes.ts")
    );
    const routeSources = await Promise.all(routeFiles.map((file) => readFile(file, "utf8")));
    const routePattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const listingRoutes = [...routeSources[2]!.matchAll(routePattern)];
    const allV1Routes = routeSources.flatMap((source) => [...source.matchAll(routePattern)]);
    expect(listingRoutes).toHaveLength(20);
    expect(allV1Routes).toHaveLength(31);
    expect(listingRoutes.filter((match) => match[1] === "get" && match[2] === "/listings")).toHaveLength(1);
    expect(listingRoutes.filter((match) => match[1] === "get" && match[2] === "/listings/:listingId")).toHaveLength(1);
  });

  it("keeps every RM-039-protected current repository inventory intact", async () => {
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
    expect((await readdir(listingsRoot)).sort()).toHaveLength(71);
    expect((await readdir(path.join(backendRoot, "migrations"))).filter((file) => file.endsWith(".sql"))).toHaveLength(
      12
    );

    const routes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    const routePattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const adminRoutes = [...routes.matchAll(routePattern)]
      .map((match) => [match[1], match[2]])
      .filter(([, route]) => route?.startsWith("/admin"));
    expect(adminRoutes).toStrictEqual([
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

  it("proves discovery SQL is read-only, count-free, provider-free, narrowly projected, and reuses one distance stage", async () => {
    const searchRepository = await readFile(path.join(listingsRoot, "public-listing-search-repository.ts"), "utf8");
    const detailRepository = await readFile(path.join(listingsRoot, "public-listing-detail-repository.ts"), "utf8");
    const discovery = `${searchRepository}\n${detailRepository}`;

    expect(discovery).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|FOR\s+UPDATE)\b/i);
    expect(discovery).not.toMatch(/COUNT\s*\(/i);
    expect(discovery).not.toMatch(/Cloudinary|Nominatim|favorite|view counter|analytics/i);
    expect(searchRepository).not.toMatch(
      /address_text|\bl\.description\b|landlord\.email|phone_e164|moderation|cloudinary_public_id/i
    );
    expect(detailRepository.match(/landlord\.email AS landlord_email/g)).toHaveLength(1);
    expect(detailRepository.match(/landlord\.phone_e164 AS landlord_phone/g)).toHaveLength(1);
    expect(searchRepository.match(/6371\.0088/g)).toHaveLength(1);
    expect(searchRepository.match(/AS distance_km/g)).toHaveLength(1);
    expect(searchRepository).toContain("LEAST(\n              1.0,");
    expect(searchRepository).toContain("WHERE distance_km <=");
    expect(searchRepository).toContain("ORDER BY distance_km ASC, id ASC");
  });

  it("contains no later-task production, provider wiring, schema object, or test-only production instrumentation", async () => {
    expect((await readdir(path.join(backendRoot, "migrations"))).filter((file) => file.endsWith(".sql"))).toHaveLength(
      12
    );
    expect((await readdir(path.join(sourceRoot, "modules"))).sort()).toStrictEqual([
      "auth",
      "favorites",
      "listings",
      "users"
    ]);
    const production = (
      await Promise.all((await readdir(listingsRoot)).map((file) => readFile(path.join(listingsRoot, file), "utf8")))
    ).join("\n");
    expect(production).not.toMatch(/RM-038|RM-039|RM-040|CountingExecutor|PostGIS/i);
  });

  it("routes RM-038 suites through the correct Vitest configurations and preserves serial database execution", async () => {
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const ordinaryConfig = await readFile(path.join(backendRoot, "vitest.config.mts"), "utf8");
    const databaseConfig = await readFile(path.join(backendRoot, "vitest.database.config.mts"), "utf8");

    expect(backendPackage.scripts["test:rm038"]).toContain("rm038-public-discovery-validation.test.ts");
    expect(backendPackage.scripts["test:rm038"]).toContain("rm038-public-discovery-http.integration.test.ts");
    expect(backendPackage.scripts["test:rm038"]).toContain("rm038-application-isolation.test.ts");
    expect(backendPackage.scripts["test:rm038"]).not.toContain("rm038-public-discovery.database.integration.test.ts");
    expect(backendPackage.scripts["test:rm038:database"]).toContain(
      "rm038-public-discovery.database.integration.test.ts"
    );
    expect(rootPackage.scripts["test:rm038"]).toBe("npm --prefix backend run test:rm038");
    expect(rootPackage.scripts["test:rm038:database"]).toBe("npm --prefix backend run test:rm038:database");
    expect(ordinaryConfig).toContain('"test/rm038-public-discovery.database.integration.test.ts"');
    expect(databaseConfig).toContain('"test/rm038-public-discovery.database.integration.test.ts"');
    expect(databaseConfig).toContain("fileParallelism: false");
  });
});
