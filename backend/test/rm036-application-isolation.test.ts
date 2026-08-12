import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const listingsRoot = path.join(sourceRoot, "modules/listings");
const publicListingProduction = [
  "public-listing-detail-controller.ts",
  "public-listing-detail-mapper.ts",
  "public-listing-detail-repository.ts",
  "public-listing-detail-service.ts",
  "public-listing-search-bounding-box.ts",
  "public-listing-search-controller.ts",
  "public-listing-search-repository.ts",
  "public-listing-search-service.ts",
  "public-listing-search-validation.ts",
  "public-listing-summary-mapper.ts"
] as const;

describe("RM-036 application isolation", () => {
  it("keeps the public collection and detail routes with the exact post-RM-037 listings inventory", async () => {
    const files = (await readdir(listingsRoot)).sort();
    expect(files).toHaveLength(71);
    expect(files.filter((filename) => filename.startsWith("public-listing"))).toStrictEqual(publicListingProduction);

    const routeFiles = ["auth", "favorites", "listings", "users"].map((module) =>
      path.join(sourceRoot, "modules", module, "routes.ts")
    );
    const routeSources = await Promise.all(routeFiles.map((filename) => readFile(filename, "utf8")));
    const pattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const listingsRoutes = [...routeSources[2]!.matchAll(pattern)].map((match) => [match[1], match[2]]);
    expect(listingsRoutes).toHaveLength(20);
    expect(routeSources.flatMap((source) => [...source.matchAll(pattern)])).toHaveLength(31);
    expect(listingsRoutes.filter(([method, route]) => method === "get" && route === "/listings")).toHaveLength(1);
    expect(listingsRoutes.some(([, route]) => /map|radius|bounds|favorite/.test(route))).toBe(false);
  });

  it("keeps HCMC scope and radius policy narrowed to the public search seam", async () => {
    const helper = await readFile(path.join(listingsRoot, "public-listing-search-bounding-box.ts"), "utf8");
    const service = await readFile(path.join(listingsRoot, "public-listing-search-service.ts"), "utf8");
    const repository = await readFile(path.join(listingsRoot, "public-listing-search-repository.ts"), "utf8");
    const composition = await readFile(path.join(backendRoot, "src/server-composition.ts"), "utf8");
    const server = await readFile(path.join(backendRoot, "src/server.ts"), "utf8");

    expect(helper).toContain('south: Number("10.633333333333333")');
    expect(helper).toContain('north: Number("11.166666666666667")');
    expect(helper).toContain('west: Number("106.36666666666666")');
    expect(helper).toContain('east: Number("106.93333333333334")');
    expect(helper).toContain("centerLatitudeRadians");
    expect(helper).toContain("radiusKm / 111.32");
    expect(service).toContain("maximumSearchRadiusKm");
    expect(service).toContain("isWithinDeploymentRegionScope");
    expect(service).toContain("findBoundsPage");
    expect(service).toContain("findRadiusPage");
    expect(repository).toContain("distance_candidates AS MATERIALIZED");
    expect(repository).toContain("6371.0088");
    expect(repository).not.toMatch(/PostGIS|geography|geometry|COUNT\s*\(/i);
    expect(composition).toContain("publicListingSearchConfig");
    expect(server).toContain("config.deployment.region");
    expect(server).toContain("config.deployment.maximumSearchRadiusKm");
  });

  it("keeps focused test routing and serial database execution explicit", async () => {
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const ordinaryVitest = await readFile(path.join(backendRoot, "vitest.config.mts"), "utf8");
    const databaseVitest = await readFile(path.join(backendRoot, "vitest.database.config.mts"), "utf8");

    expect(backendPackage.scripts["test:rm036"]).not.toContain("rm036-public-search.database.integration.test.ts");
    expect(backendPackage.scripts["test:rm036:database"]).toContain("rm036-public-search.database.integration.test.ts");
    expect(rootPackage.scripts["test:rm036"]).toBe("npm --prefix backend run test:rm036");
    expect(rootPackage.scripts["test:rm036:database"]).toBe("npm --prefix backend run test:rm036:database");
    expect(ordinaryVitest).toContain('"test/rm036-public-search.database.integration.test.ts"');
    expect(databaseVitest).toContain('"test/rm036-public-search.database.integration.test.ts"');
    expect(databaseVitest).toContain("fileParallelism: false");
  });
});
