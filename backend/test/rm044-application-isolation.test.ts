import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const modulesRoot = path.join(sourceRoot, "modules");

const expectedRoutes = [
  "post:/auth/register/tenant",
  "post:/auth/register/landlord",
  "post:/auth/login",
  "post:/auth/logout",
  "get:/users/me",
  "patch:/users/me",
  "get:/lookups/property-types",
  "get:/lookups/amenities",
  "get:/listings",
  "get:/listings/:listingId",
  "post:/landlord/listings",
  "get:/landlord/listings",
  "get:/landlord/listings/:listingId",
  "patch:/landlord/listings/:listingId",
  "delete:/landlord/listings/:listingId",
  "post:/landlord/listings/:listingId/submit",
  "post:/landlord/listings/:listingId/deactivate",
  "post:/landlord/listings/:listingId/reactivate",
  "post:/landlord/listings/:listingId/images",
  "delete:/landlord/listings/:listingId/images/:imageId",
  "put:/landlord/listings/:listingId/images/order",
  "post:/geocoding/forward",
  "get:/favorites",
  "put:/favorites/:listingId",
  "delete:/favorites/:listingId",
  "get:/admin/listings",
  "get:/admin/listings/:listingId",
  "get:/admin/listings/:listingId/moderation-actions",
  "post:/admin/listings/:listingId/moderation-actions",
  "get:/admin/users",
  "patch:/admin/users/:userId/activation"
].sort();

async function routeInventory() {
  const modules = ["auth", "favorites", "listings", "users"] as const;
  const sources = await Promise.all(
    modules.map((module) => readFile(path.join(modulesRoot, module, "routes.ts"), "utf8"))
  );
  const pattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
  return Object.fromEntries(
    modules.map((module, index) => [
      module,
      [...sources[index]!.matchAll(pattern)].map((match) => `${match[1]}:${match[2]}`).sort()
    ])
  ) as Record<(typeof modules)[number], string[]>;
}

describe("RM-044 permanent application isolation", () => {
  it("keeps exactly four business modules and the committed RM-043 production inventories", async () => {
    expect((await readdir(modulesRoot)).sort()).toStrictEqual(["auth", "favorites", "listings", "users"]);
    await expect(readdir(path.join(modulesRoot, "admin"))).rejects.toThrow();
    expect((await readdir(path.join(modulesRoot, "listings"))).sort()).toHaveLength(71);
    expect((await readdir(path.join(modulesRoot, "users"))).sort()).toStrictEqual([
      "admin-user-controller.ts",
      "admin-user-repository.ts",
      "admin-user-service.ts",
      "admin-user-validation.ts",
      "routes.ts",
      "user-profile.ts",
      "user-validation.ts",
      "users-controller.ts",
      "users-repository.ts",
      "users-service.ts"
    ]);
  });

  it("registers V1-01 through V1-31 exactly once with no endpoint 32", async () => {
    const inventory = await routeInventory();
    expect(inventory.auth).toHaveLength(4);
    expect(inventory.favorites).toHaveLength(3);
    expect(inventory.listings).toHaveLength(20);
    expect(inventory.users).toHaveLength(4);
    const all = Object.values(inventory).flat().sort();
    expect(all).toHaveLength(31);
    expect(new Set(all).size).toBe(31);
    expect(all).toStrictEqual(expectedRoutes);
  });

  it("keeps schema, providers, and frontend at the frozen pre-RM-045 inventory", async () => {
    expect(
      (await readdir(path.join(backendRoot, "migrations"))).filter((file) => file.endsWith(".sql")).sort()
    ).toStrictEqual([
      "0001_create_enum_types.sql",
      "0002_create_users.sql",
      "0003_create_property_types.sql",
      "0004_create_amenities.sql",
      "0005_seed_property_types.sql",
      "0006_seed_amenities.sql",
      "0007_create_listings.sql",
      "0008_create_listing_images.sql",
      "0009_create_listing_amenities.sql",
      "0010_create_favorites.sql",
      "0011_create_moderation_history.sql",
      "0012_create_explicit_indexes.sql"
    ]);
    expect((await readdir(path.join(sourceRoot, "integrations"))).sort()).toStrictEqual([
      "cloudinary.client.ts",
      "nominatim.client.ts"
    ]);
    expect((await readdir(path.join(repositoryRoot, "frontend", "app"))).sort()).toStrictEqual([
      "globals.css",
      "layout.tsx",
      "page.test.tsx",
      "page.tsx"
    ]);
  });

  it("adds no blacklist, session/audit/visibility table, worker, queue, outbox, or provider surface", async () => {
    const migrationFiles = (await readdir(path.join(backendRoot, "migrations"))).filter((file) =>
      file.endsWith(".sql")
    );
    const migrations = (
      await Promise.all(migrationFiles.map((file) => readFile(path.join(backendRoot, "migrations", file), "utf8")))
    ).join("\n");
    expect(migrations).not.toMatch(
      /CREATE\s+TABLE\s+(?:sessions?|activation_history|audit|outbox|queue)|visibility\s+(?:boolean|text)/i
    );
    const scopedNames = [
      ...(await readdir(sourceRoot)),
      ...(await readdir(modulesRoot)),
      ...(await readdir(path.join(sourceRoot, "integrations")))
    ].join("\n");
    expect(scopedNames).not.toMatch(/blacklist|session-table|activation-history|worker|queue|outbox/i);
  });

  it("wires only the required ordinary and three-file database RM-044 suites", async () => {
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(rootPackage.dependencies).toBeUndefined();
    expect(rootPackage.scripts["test:rm044"]).toBe("npm --prefix backend run test:rm044");
    expect(rootPackage.scripts["test:rm044:database"]).toBe("npm --prefix backend run test:rm044:database");
    expect(backendPackage.scripts["test:rm044"]).toContain("rm044-admin-authorization-http.integration.test.ts");
    expect(backendPackage.scripts["test:rm044"]).toContain("rm044-application-isolation.test.ts");
    expect(backendPackage.scripts["test:rm044:database"]).toBe(
      "vitest run --config vitest.database.config.mts test/rm044-moderation-matrix.database.integration.test.ts test/rm044-moderation-concurrency.database.integration.test.ts test/rm044-activation-visibility.database.integration.test.ts"
    );
    expect(await readFile(path.join(backendRoot, "vitest.database.config.mts"), "utf8")).toContain(
      "fileParallelism: false"
    );
  });
});
