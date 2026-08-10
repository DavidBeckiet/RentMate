import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const listingsRoot = path.join(sourceRoot, "modules", "listings");

describe("RM-042 application isolation", () => {
  it("keeps four modules and exactly 71 listings production files", async () => {
    expect((await readdir(path.join(sourceRoot, "modules"))).sort()).toStrictEqual([
      "auth",
      "favorites",
      "listings",
      "users"
    ]);
    expect((await readdir(listingsRoot)).sort()).toHaveLength(71);
    expect((await readdir(listingsRoot)).filter((name) => name.startsWith("moderation-action-")).sort()).toStrictEqual([
      "moderation-action-controller.ts",
      "moderation-action-repository.ts",
      "moderation-action-service.ts",
      "moderation-action-validation.ts"
    ]);
    await expect(readdir(path.join(sourceRoot, "modules", "admin"))).rejects.toThrow();
  });

  it("registers 29 API routes, 20 listings routes, and V1-29 exactly once", async () => {
    const sources = await Promise.all(
      ["auth", "favorites", "listings", "users"].map((module) =>
        readFile(path.join(sourceRoot, "modules", module, "routes.ts"), "utf8")
      )
    );
    const pattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const all = sources.flatMap((source) => [...source.matchAll(pattern)].map((match) => [match[1], match[2]]));
    const listings = [...sources[2]!.matchAll(pattern)].map((match) => [match[1], match[2]]);
    expect(all).toHaveLength(29);
    expect(listings).toHaveLength(20);
    expect(listings.filter((route) => route[1] === "/admin/listings/:listingId/moderation-actions")).toStrictEqual([
      ["post", "/admin/listings/:listingId/moderation-actions"],
      ["get", "/admin/listings/:listingId/moderation-actions"]
    ]);
    expect(all.some(([, route]) => route === "/admin/users" || route === "/admin/users/:userId/activation")).toBe(
      false
    );
  });

  it("keeps moderation bounded to listing/history SQL without generic endpoints or providers", async () => {
    const files = (await readdir(listingsRoot)).filter((name) => name.startsWith("moderation-action-"));
    const combined = (await Promise.all(files.map((name) => readFile(path.join(listingsRoot, name), "utf8")))).join(
      "\n"
    );
    expect(combined).toContain("FOR UPDATE OF l");
    expect(combined).toContain("INSERT INTO moderation_history");
    expect(combined).not.toMatch(/cloudinary|nominatim|favorites|listing_images|listing_amenities|password_hash/i);
    const routes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    expect(routes).not.toMatch(/admin\/listings\/:listingId\/(?:approve|reject|hide|restore)|admin\/users/i);
  });

  it("does not add schema, frontend, provider, dependency, or RM-043/RM-044 artifacts", async () => {
    expect((await readdir(path.join(backendRoot, "migrations"))).filter((file) => file.endsWith(".sql"))).toHaveLength(
      12
    );
    expect((await readdir(path.join(sourceRoot, "integrations"))).sort()).toStrictEqual([
      "cloudinary.client.ts",
      "nominatim.client.ts"
    ]);
    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(rootPackage.dependencies).toBeUndefined();
    expect(backendPackage.scripts["test:rm042"]).toContain("rm042-moderation-action-http.integration.test.ts");
    expect(backendPackage.scripts["test:rm042:database"]).toContain(
      "rm042-moderation-action.database.integration.test.ts"
    );
    expect(await readFile(path.join(backendRoot, "vitest.database.config.mts"), "utf8")).toContain(
      "fileParallelism: false"
    );
  });
});
