import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const listingsRoot = path.join(sourceRoot, "modules/listings");
const rm035Production = [
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

async function recursiveFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await recursiveFiles(absolute)));
    else files.push(absolute);
  }
  return files.sort();
}

function gitDiff(...paths: string[]): string {
  return execFileSync("git", ["diff", "--name-only", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
}

describe("RM-035 application isolation", () => {
  it("keeps exactly 60 listings files, sixteen listings routes, and 22 total API routes", async () => {
    const files = (await readdir(listingsRoot)).sort();
    expect(files).toHaveLength(60);
    expect(files.filter((filename) => filename.startsWith("public-listing"))).toStrictEqual(rm035Production);
    const routeFiles = ["auth", "listings", "users"].map((module) =>
      path.join(sourceRoot, "modules", module, "routes.ts")
    );
    const sources = await Promise.all(routeFiles.map((filename) => readFile(filename, "utf8")));
    const pattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const listingsRoutes = [...sources[1]!.matchAll(pattern)].map((match) => [match[1], match[2]]);
    expect(listingsRoutes).toHaveLength(16);
    expect(sources.flatMap((source) => [...source.matchAll(pattern)])).toHaveLength(22);
    expect(listingsRoutes.filter(([method, route]) => method === "get" && route === "/listings")).toHaveLength(1);
    expect(
      listingsRoutes.filter(([method, route]) => method === "get" && route === "/listings/:listingId")
    ).toHaveLength(1);
    expect(listingsRoutes.some(([, route]) => /map|radius|favorite|admin/.test(route))).toBe(false);
  });

  it("keeps V1-09 public and limits geographic work to the public search policy", async () => {
    const routes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    const publicRegistration = routes.match(/router\.get\("\/listings"[^;]+;/s)?.[0] ?? "";
    expect(publicRegistration).toContain("createPublicListingSearchHandler");
    expect(publicRegistration).not.toMatch(/authentication|optionalAuthentication|RoleMiddleware/);

    const repository = await readFile(path.join(listingsRoot, "public-listing-search-repository.ts"), "utf8");
    const service = await readFile(path.join(listingsRoot, "public-listing-search-service.ts"), "utf8");
    const validator = await readFile(path.join(listingsRoot, "public-listing-search-validation.ts"), "utf8");
    expect(validator).toMatch(/mode: "bounds"/);
    expect(validator).toMatch(/mode: "radius"/);
    expect(validator).toContain('"distance_asc"');
    expect(service).toContain("findBoundsPage");
    expect(service).toContain("findRadiusPage");
    expect(repository).toContain("distance_candidates AS MATERIALIZED");
    expect(repository).toContain("6371.0088");
    expect(repository).toContain("LEAST");
  });

  it("keeps the public projection aggregate, narrow, and free of adjacent discovery features", async () => {
    const sources = await Promise.all(
      rm035Production.map((filename) => readFile(path.join(listingsRoot, filename), "utf8"))
    );
    const searchSources = sources.slice(4);
    const combined = searchSources.join("\n");
    const repository = searchSources[2];
    expect(repository).toMatch(/WITH page_candidates AS/);
    expect(repository).toMatch(/LEFT JOIN LATERAL[\s\S]*jsonb_agg/);
    expect(repository).not.toMatch(/address_text|password_hash|cloudinary_public_id|moderation_history|COUNT\s*\(/i);
    expect(combined).not.toMatch(
      /landlordContact|favorite|public.?detail|PostGIS|trigram|to_tsvector|websearch_to_tsquery/i
    );
    expect(combined).not.toMatch(/Cloudinary|Nominatim|queue|worker|outbox/i);
  });

  it("adds no schema, dependency, provider, server, frozen-document, or frontend change", async () => {
    expect(gitDiff("backend/package-lock.json", "package-lock.json")).toBe("");
    expect(
      gitDiff(
        "backend/migrations",
        "frontend",
        "docs",
        "AGENTS.md",
        ".env.example",
        "backend/src/config/env.ts",
        "backend/src/integrations/cloudinary.client.ts",
        "backend/src/integrations/nominatim.client.ts"
      )
    ).toBe("");
    const migrations = (await readdir(path.join(backendRoot, "migrations"))).filter((name) => name.endsWith(".sql"));
    expect(migrations).toHaveLength(12);
    expect(migrations.some((name) => name.startsWith("0013"))).toBe(false);
    expect((await readdir(path.join(sourceRoot, "integrations"))).sort()).toStrictEqual([
      "cloudinary.client.ts",
      "nominatim.client.ts"
    ]);
    expect(
      (await recursiveFiles(path.join(repositoryRoot, "frontend"))).some((filename) => /rm035/i.test(filename))
    ).toBe(false);
  });
});
