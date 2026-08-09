import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const listingsRoot = path.join(sourceRoot, "modules/listings");
const rm037Production = [
  "public-listing-detail-controller.ts",
  "public-listing-detail-mapper.ts",
  "public-listing-detail-repository.ts",
  "public-listing-detail-service.ts"
] as const;

function gitDiff(...paths: string[]): string {
  return execFileSync("git", ["diff", "--name-only", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
}

describe("RM-037 application isolation", () => {
  it("adds exactly four detail files and exactly one public detail route", async () => {
    const files = (await readdir(listingsRoot)).sort();
    expect(files).toHaveLength(67);
    expect(files.filter((filename) => filename.startsWith("public-listing-detail"))).toStrictEqual(rm037Production);

    const routeFiles = ["auth", "favorites", "listings", "users"].map((module) =>
      path.join(sourceRoot, "modules", module, "routes.ts")
    );
    const routeSources = await Promise.all(routeFiles.map((filename) => readFile(filename, "utf8")));
    const pattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const listingsRoutes = [...routeSources[2]!.matchAll(pattern)].map((match) => [match[1], match[2]]);
    expect(listingsRoutes).toHaveLength(19);
    expect(routeSources.flatMap((source) => [...source.matchAll(pattern)])).toHaveLength(28);
    expect(listingsRoutes.filter(([method, route]) => method === "get" && route === "/listings")).toHaveLength(1);
    expect(
      listingsRoutes.filter(([method, route]) => method === "get" && route === "/listings/:listingId")
    ).toHaveLength(1);
  });

  it("uses optional authentication only on detail and keeps collection contact-free", async () => {
    const routes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    const composition = await readFile(path.join(sourceRoot, "server-composition.ts"), "utf8");
    const searchController = await readFile(path.join(listingsRoot, "public-listing-search-controller.ts"), "utf8");
    const detailRepository = await readFile(path.join(listingsRoot, "public-listing-detail-repository.ts"), "utf8");

    expect(routes).toMatch(
      /router\.get\(\s*"\/listings",\s*createPublicListingSearchHandler\(dependencies\.publicListingSearchService\)\s*\)/
    );
    expect(routes).toMatch(
      /router\.get\(\s*"\/listings\/:listingId",\s*dependencies\.optionalAuthenticationMiddleware,\s*createPublicListingDetailHandler/
    );
    expect(composition).toContain("createOptionalAuthenticationMiddleware");
    expect(composition).toContain("usersRepository.findAuthenticationAccountById");
    expect(searchController).not.toMatch(/auth|contact/i);
    expect(detailRepository).toContain("includeContact");
    expect(detailRepository).toContain("basePublicDetailQuery");
    expect(detailRepository).toContain("tenantPublicDetailQuery");
  });

  it("keeps schema, providers, frontend, search implementation, and later tasks out of scope", async () => {
    expect(
      gitDiff(
        "backend/src/server.ts",
        "backend/src/config/env.ts",
        "backend/migrations",
        "frontend",
        "docs",
        "AGENTS.md",
        ".env.example",
        "backend/package-lock.json",
        "package-lock.json",
        "backend/src/integrations",
        "backend/src/modules/listings/public-listing-search-repository.ts",
        "backend/src/modules/listings/public-listing-summary-mapper.ts",
        "backend/src/modules/listings/public-listing-search-bounding-box.ts"
      )
    ).toBe("");
    expect((await readdir(path.join(backendRoot, "migrations"))).filter((file) => file.endsWith(".sql"))).toHaveLength(
      12
    );
    expect((await readdir(path.join(sourceRoot, "modules"))).sort()).toStrictEqual([
      "auth",
      "favorites",
      "listings",
      "users"
    ]);
    const combined = (
      await Promise.all(rm037Production.map((filename) => readFile(path.join(listingsRoot, filename), "utf8")))
    ).join("\n");
    expect(combined).not.toMatch(/favorite|PostGIS|Cloudinary|Nominatim|FOR UPDATE|COUNT\s*\(|RM-038|RM-039/i);
  });

  it("routes the focused database suite only through database Vitest", async () => {
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const ordinaryVitest = await readFile(path.join(backendRoot, "vitest.config.mts"), "utf8");
    const databaseVitest = await readFile(path.join(backendRoot, "vitest.database.config.mts"), "utf8");
    expect(backendPackage.scripts["test:rm037"]).not.toContain(
      "rm037-public-listing-detail.database.integration.test.ts"
    );
    expect(backendPackage.scripts["test:rm037:database"]).toContain(
      "rm037-public-listing-detail.database.integration.test.ts"
    );
    expect(rootPackage.scripts["test:rm037"]).toBe("npm --prefix backend run test:rm037");
    expect(rootPackage.scripts["test:rm037:database"]).toBe("npm --prefix backend run test:rm037:database");
    expect(ordinaryVitest).toContain('"test/rm037-public-listing-detail.database.integration.test.ts"');
    expect(databaseVitest).toContain('"test/rm037-public-listing-detail.database.integration.test.ts"');
    expect(databaseVitest).toContain("fileParallelism: false");
  });
});
