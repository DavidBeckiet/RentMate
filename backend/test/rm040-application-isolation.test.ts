import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const favoritesRoot = path.join(sourceRoot, "modules", "favorites");

describe("RM-040 application isolation", () => {
  it("preserves the four business modules and five RM-039 favorite production files", async () => {
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

  it("preserves exactly 31 routes and only V1-23, V1-24, and V1-25 for favorites", async () => {
    const sources = await Promise.all(
      ["auth", "favorites", "listings", "users"].map((module) =>
        readFile(path.join(sourceRoot, "modules", module, "routes.ts"), "utf8")
      )
    );
    const routePattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const routes = sources.flatMap((source) => [...source.matchAll(routePattern)].map((match) => [match[1], match[2]]));
    expect(routes).toHaveLength(31);
    expect(routes.filter(([, route]) => route?.includes("favorites"))).toStrictEqual([
      ["get", "/favorites"],
      ["put", "/favorites/:listingId"],
      ["delete", "/favorites/:listingId"]
    ]);
    expect(routes.filter(([method, route]) => method === "post" && route?.includes("favorites"))).toHaveLength(0);
    expect(routes.filter(([, route]) => route?.startsWith("/admin"))).toStrictEqual([
      ["post", "/admin/listings/:listingId/moderation-actions"],
      ["get", "/admin/listings"],
      ["get", "/admin/listings/:listingId/moderation-actions"],
      ["get", "/admin/listings/:listingId"],
      ["get", "/admin/users"],
      ["patch", "/admin/users/:userId/activation"]
    ]);
  });

  it("proves the frozen SQL shapes without production instrumentation", async () => {
    const repository = await readFile(path.join(favoritesRoot, "favorite-repository.ts"), "utf8");
    expect(repository).toMatch(/f\.tenant_id = \$1[\s\S]*l\.status = 'APPROVED'[\s\S]*landlord\.is_active = true/);
    expect(repository).toMatch(/ORDER BY f\.created_at DESC, f\.listing_id DESC/);
    expect(repository).toMatch(/LIMIT \$2[\s\S]*OFFSET \$3/);
    expect(repository).toMatch(/ORDER BY display_order ASC, id ASC/);
    expect(repository).toMatch(/ORDER BY a\.label ASC, a\.code ASC/);
    expect(repository).toMatch(/WITH visible_target AS MATERIALIZED[\s\S]*INSERT INTO favorites/);
    expect(repository).toMatch(/ON CONFLICT \(tenant_id, listing_id\)[\s\S]*DO NOTHING/);
    expect(repository).toMatch(/DELETE FROM favorites[\s\S]*tenant_id = \$1[\s\S]*listing_id = \$2/);
    expect(repository).not.toMatch(
      /COUNT\s*\(|address_text|landlord\.email|phone_e164|moderation|cloudinary_public_id|password_hash|DO UPDATE|FOR\s+UPDATE/i
    );
    expect(repository).not.toMatch(/CountingExecutor|RM-040|analytics|notification|queue|worker|outbox/i);
  });

  it("preserves favorites architecture while isolating operator deployment tooling", async () => {
    expect((await readdir(path.join(backendRoot, "migrations"))).filter((file) => file.endsWith(".sql"))).toHaveLength(
      12
    );
    const sourceEntries = await readdir(sourceRoot, { withFileTypes: true });
    const allowedSourceRoots = new Set([
      "app.ts",
      "config",
      "db",
      "deployment",
      "integrations",
      "modules",
      "server-composition.ts",
      "server.ts",
      "shared",
      "shutdown.ts"
    ]);
    expect(sourceEntries.map((entry) => entry.name).filter((name) => !allowedSourceRoots.has(name))).toStrictEqual([]);
    expect(sourceEntries.find((entry) => entry.name === "deployment")?.isDirectory()).toBe(true);

    const deploymentSources = await Promise.all(
      (await readdir(path.join(sourceRoot, "deployment"))).map((file) =>
        readFile(path.join(sourceRoot, "deployment", file), "utf8")
      )
    );
    expect(deploymentSources.join("\n")).not.toMatch(
      /from "\.\.\/modules\/|express|Router|router\.(?:get|post|patch|put|delete)/
    );
    const favoritesSources = await Promise.all(
      (await readdir(favoritesRoot)).map((file) => readFile(path.join(favoritesRoot, file), "utf8"))
    );
    expect(favoritesSources.join("\n")).not.toMatch(/(?:\.\.\/){2}deployment\/|src\/deployment/);
    const runtimeSources = await Promise.all(
      ["app.ts", "server.ts", "server-composition.ts"].map((file) => readFile(path.join(sourceRoot, file), "utf8"))
    );
    expect(runtimeSources.join("\n")).not.toMatch(/(?:\.\/|\.\.\/)deployment\//);
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
    const composition = await readFile(path.join(sourceRoot, "server-composition.ts"), "utf8");
    expect(composition).toContain("createAdminListingReadRepository");
    expect(composition).toContain("createAdminListingReadService");
    expect(composition).toContain("adminListingReadService");
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

  it("contains exactly four RM-040 tests and routes database suites through serial Vitest", async () => {
    expect(
      (await readdir(path.join(backendRoot, "test"))).filter((file) => file.startsWith("rm040-")).sort()
    ).toStrictEqual([
      "rm040-application-isolation.test.ts",
      "rm040-favorite-concurrency.database.integration.test.ts",
      "rm040-favorite-http.integration.test.ts",
      "rm040-favorite.database.integration.test.ts"
    ]);
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const ordinary = await readFile(path.join(backendRoot, "vitest.config.mts"), "utf8");
    const database = await readFile(path.join(backendRoot, "vitest.database.config.mts"), "utf8");
    expect(backendPackage.scripts["test:rm040"]).toContain("rm040-favorite-http.integration.test.ts");
    expect(backendPackage.scripts["test:rm040"]).toContain("rm040-application-isolation.test.ts");
    expect(backendPackage.scripts["test:rm040:database"]).toContain("rm040-favorite.database.integration.test.ts");
    expect(backendPackage.scripts["test:rm040:database"]).toContain(
      "rm040-favorite-concurrency.database.integration.test.ts"
    );
    expect(rootPackage.scripts["test:rm040"]).toBe("npm --prefix backend run test:rm040");
    expect(rootPackage.scripts["test:rm040:database"]).toBe("npm --prefix backend run test:rm040:database");
    for (const file of [
      "rm040-favorite.database.integration.test.ts",
      "rm040-favorite-concurrency.database.integration.test.ts"
    ]) {
      expect(ordinary).toContain(`"test/${file}"`);
      expect(database).toContain(`"test/${file}"`);
    }
    expect(database).toContain("fileParallelism: false");
  });
});
