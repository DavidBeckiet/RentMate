import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createNominatimClient } from "../src/integrations/nominatim.client.js";
import {
  allowAllRateLimitStore,
  candidateData,
  createRecordingProvider,
  createRm034Fixture,
  geocodeRequest,
  jsonResponse,
  rm034Cookie
} from "./helpers/rm034-geocoding-fixture.js";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const listingsRoot = path.join(sourceRoot, "modules/listings");

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

async function joinedSource(files: readonly string[]): Promise<string> {
  return (await Promise.all(files.map((filename) => readFile(filename, "utf8")))).join("\n");
}

function relative(filename: string): string {
  return path.relative(backendRoot, filename).replaceAll("\\", "/");
}

describe("RM-034 permanent production inventory", () => {
  it("keeps the committed RM-033 route and listings inventory unchanged", async () => {
    expect((await readdir(listingsRoot)).sort()).toHaveLength(71);
    const routeFiles = ["auth", "favorites", "listings", "users"].map((module) =>
      path.join(sourceRoot, "modules", module, "routes.ts")
    );
    const routeSources = await Promise.all(routeFiles.map((filename) => readFile(filename, "utf8")));
    const routePattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const listingsRoutes = [...routeSources[2]!.matchAll(routePattern)].map((match) => [match[1], match[2]]);

    expect(listingsRoutes).toHaveLength(20);
    expect(listingsRoutes.filter(([method, route]) => method === "get" && route === "/listings")).toHaveLength(1);
    expect(routeSources.flatMap((source) => [...source.matchAll(routePattern)])).toHaveLength(31);
    expect(
      listingsRoutes.filter(([method, route]) => method === "post" && route === "/geocoding/forward")
    ).toHaveLength(1);
    expect(listingsRoutes.filter(([, route]) => route.includes("geocod"))).toStrictEqual([
      ["post", "/geocoding/forward"]
    ]);
  });

  it("keeps exactly the two committed integrations and listings ownership", async () => {
    expect((await readdir(path.join(sourceRoot, "integrations"))).sort()).toStrictEqual([
      "cloudinary.client.ts",
      "nominatim.client.ts"
    ]);
    expect((await readdir(path.join(sourceRoot, "modules"))).sort()).toStrictEqual([
      "auth",
      "favorites",
      "listings",
      "users"
    ]);
    expect(
      (await recursiveFiles(sourceRoot)).filter((filename) => /nominatim\.client\.ts$/.test(filename))
    ).toHaveLength(1);
    expect((await readdir(listingsRoot)).filter((filename) => /geocoding.*repository/i.test(filename))).toStrictEqual(
      []
    );
  });

  it("limits all production Nominatim/geocoding references to the committed RM-033 surface", async () => {
    const productionFiles = await recursiveFiles(sourceRoot);
    const matching: string[] = [];
    for (const filename of productionFiles) {
      if (/nominatim|geocod/i.test(await readFile(filename, "utf8"))) matching.push(relative(filename));
    }
    expect(matching).toStrictEqual([
      "src/config/env.ts",
      "src/integrations/nominatim.client.ts",
      "src/modules/listings/geocoding-controller.ts",
      "src/modules/listings/geocoding-service.ts",
      "src/modules/listings/geocoding-validation.ts",
      "src/modules/listings/routes.ts",
      "src/server-composition.ts",
      "src/server.ts"
    ]);

    const service = await readFile(path.join(listingsRoot, "geocoding-service.ts"), "utf8");
    expect(service.match(/nominatimClient\.forwardGeocode\(/g)).toHaveLength(1);
    for (const filename of productionFiles.filter((filename) => !/geocoding-service\.ts$/.test(filename))) {
      expect(await readFile(filename, "utf8")).not.toMatch(/nominatimClient\.forwardGeocode\(/);
    }
  });
});

describe("RM-034 explicit-only and side-effect isolation", () => {
  it("performs zero provider fetches during app construction and health", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const client = createNominatimClient({
      baseUrl: "https://provider.test",
      userAgent: "RentMate RM034",
      fetchImpl
    });
    const fixture = await createRm034Fixture({
      provider: createRecordingProvider((address) => client.forwardGeocode(address)),
      userStore: allowAllRateLimitStore(),
      providerStore: allowAllRateLimitStore()
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    await request(fixture.app).get("/api/health").expect(200);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("awaits the explicit provider call before completing V1-22", async () => {
    let resolveProvider: ((value: readonly ReturnType<typeof candidateData>[]) => void) | undefined;
    const provider = createRecordingProvider(
      () =>
        new Promise((resolve) => {
          resolveProvider = resolve;
        })
    );
    const fixture = await createRm034Fixture({
      provider,
      userStore: allowAllRateLimitStore(),
      providerStore: allowAllRateLimitStore()
    });
    let responseSettled = false;
    const pendingResponse = geocodeRequest(fixture.app, await rm034Cookie()).then((response) => {
      responseSettled = true;
      return response;
    });

    await vi.waitFor(() => expect(provider.forwardGeocode).toHaveBeenCalledOnce());
    expect(responseSettled).toBe(false);
    resolveProvider?.([candidateData("Candidate", 10, 106)]);
    const response = await pendingResponse;
    expect(response.status).toBe(200);
  });

  it("keeps every listing mutation and unrelated module free of provider invocation", async () => {
    const productionFiles = await recursiveFiles(sourceRoot);
    const mutationOrUnrelatedFiles = productionFiles.filter((filename) => {
      const normalized = relative(filename);
      return (
        normalized.startsWith("src/modules/auth/") ||
        normalized.startsWith("src/modules/users/") ||
        /listing-(?:create|update|submit|delete|lifecycle|image)/.test(normalized)
      );
    });
    const source = await joinedSource(mutationOrUnrelatedFiles);
    expect(source).not.toMatch(/nominatim|forwardGeocode|createNominatimClient/i);
  });

  it("keeps geocoding non-persistent, uncached, forward-only, retry-free, and unscheduled", async () => {
    const geocodingFiles = [
      path.join(sourceRoot, "integrations/nominatim.client.ts"),
      path.join(listingsRoot, "geocoding-controller.ts"),
      path.join(listingsRoot, "geocoding-service.ts"),
      path.join(listingsRoot, "geocoding-validation.ts")
    ];
    const source = await joinedSource(geocodingFiles);

    expect(source).not.toMatch(
      /\b(?:SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b|SqlExecutor|TransactionRunner/i
    );
    expect(source).not.toMatch(/autocomplete|typeahead|suggestion|reverse.?geocod|\/reverse/i);
    expect(source).not.toMatch(/\bretry\b|backoff|recursive|for\s*\([^)]*fetch|while\s*\(/i);
    expect(source).not.toMatch(/setInterval|setTimeout\s*\(|cron|worker|queue|outbox|background|fire-and-forget/i);
    expect(source).not.toMatch(/\b(?:Map|Redis|LRU)\b/);
    expect(source).not.toMatch(/memoiz|geocod(?:ing)?[_ -]?cache|geocod(?:ing)?[_ -]?history/i);
  });

  it("adds no frontend, migration, schema, or automatic coordinate-save surface", async () => {
    const productionFiles = await recursiveFiles(sourceRoot);
    const productionSource = await joinedSource(productionFiles);
    const migrations = await recursiveFiles(path.join(backendRoot, "migrations"));
    const migrationSource = await joinedSource(migrations);
    const frontendFiles = (await recursiveFiles(path.join(repositoryRoot, "frontend"))).filter(
      (filename) =>
        !/[\\/](?:node_modules|\.next)[\\/]/.test(filename) && /\.(?:ts|tsx|js|jsx|json|css|md)$/.test(filename)
    );
    const frontendSource = await joinedSource(frontendFiles);

    expect(productionFiles).not.toEqual(expect.arrayContaining([expect.stringMatching(/rm034/i)]));
    expect(productionSource).not.toMatch(/confirm.?geocod|save.?candidate|selected.?candidate|reverseGeocode/i);
    expect(migrationSource).not.toMatch(/nominatim|geocod/i);
    expect(frontendSource).not.toMatch(/nominatim|geocod|autocomplete|typeahead|rm034|rm035/i);
  }, 15_000);
});
