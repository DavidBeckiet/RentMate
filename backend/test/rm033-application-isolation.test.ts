import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const listingsRoot = path.join(backendRoot, "src/modules/listings");
const browserAutocompleteAttribute =
  /(<[A-Za-z][^<>]*?)\s+autocomplete\s*=\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|\{[^}\r\n]*\})/gi;
const directProviderOrReverseGeocoding = /nominatim|reverse.?geocod/i;
const geocodingContext = /geocod|address|location/i;
const automaticGeocodingBehavior = /autocomplete|typeahead/i;

function hasUnsupportedFrontendGeocoding(relativePath: string, source: string): boolean {
  const semanticSource = source.replace(browserAutocompleteAttribute, "$1");
  const surface = `${relativePath}\n${semanticSource}`;
  return (
    directProviderOrReverseGeocoding.test(surface) ||
    (geocodingContext.test(surface) && automaticGeocodingBehavior.test(surface))
  );
}

async function recursiveFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (["node_modules", ".next", "coverage"].includes(entry.name)) continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await recursiveFiles(absolute)));
    else files.push(absolute);
  }
  return files.sort();
}

async function source(filename: string): Promise<string> {
  return readFile(path.join(listingsRoot, filename), "utf8");
}

describe("RM-033 application isolation", () => {
  it("keeps the geocoding inventory alongside the current route set", async () => {
    const files = (await readdir(listingsRoot)).sort();
    expect(files).toHaveLength(71);
    expect(files.filter((filename) => filename.startsWith("geocoding-"))).toStrictEqual([
      "geocoding-controller.ts",
      "geocoding-service.ts",
      "geocoding-validation.ts"
    ]);

    const moduleRouteFiles = ["auth", "favorites", "listings", "users"].map((module) =>
      path.join(backendRoot, "src/modules", module, "routes.ts")
    );
    const routeSources = await Promise.all(moduleRouteFiles.map((filename) => readFile(filename, "utf8")));
    const routePattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const listingsRoutes = [...routeSources[2]!.matchAll(routePattern)].map((match) => [match[1], match[2]]);
    expect(listingsRoutes).toHaveLength(20);
    expect(listingsRoutes.filter((entry) => entry[0] === "get" && entry[1] === "/listings")).toHaveLength(1);
    expect(listingsRoutes.filter((entry) => entry[0] === "post" && entry[1] === "/geocoding/forward")).toHaveLength(1);
    expect(routeSources.flatMap((routeSource) => [...routeSource.matchAll(routePattern)])).toHaveLength(31);
    for (const route of [
      "/landlord/listings/:listingId/images",
      "/landlord/listings/:listingId/images/:imageId",
      "/landlord/listings/:listingId/images/order"
    ]) {
      expect(listingsRoutes.some((entry) => entry[1] === route)).toBe(true);
    }
  });

  it("keeps exactly two narrow provider clients and no fifth business module", async () => {
    expect((await readdir(path.join(backendRoot, "src/integrations"))).sort()).toStrictEqual([
      "cloudinary.client.ts",
      "nominatim.client.ts"
    ]);
    expect((await readdir(path.join(backendRoot, "src/modules"))).sort()).toStrictEqual([
      "auth",
      "favorites",
      "listings",
      "users"
    ]);
    const productionFiles = await recursiveFiles(path.join(backendRoot, "src"));
    expect(productionFiles.filter((filename) => /nominatim\.client\.ts$/.test(filename))).toHaveLength(1);
    expect(productionFiles).not.toEqual(expect.arrayContaining([expect.stringMatching(/modules[\\/]geocoding/)]));
    expect((await readdir(listingsRoot)).filter((filename) => /geocoding.*repository/i.test(filename))).toStrictEqual(
      []
    );
  });

  it("keeps geocoding explicit, provider-only, non-persistent, and retry-free", async () => {
    const geocoding = [
      await source("geocoding-controller.ts"),
      await source("geocoding-service.ts"),
      await source("geocoding-validation.ts"),
      await readFile(path.join(backendRoot, "src/integrations/nominatim.client.ts"), "utf8")
    ].join("\n");
    expect(geocoding).not.toMatch(
      /\b(?:SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b|SqlExecutor|TransactionRunner/i
    );
    expect(geocoding).not.toMatch(/cache|autocomplete|reverse.?geocod|retry|queue|worker|outbox|background/i);
    for (const filename of [
      "listing-create-service.ts",
      "listing-update-service.ts",
      "listing-submit-service.ts",
      "listing-create-controller.ts",
      "listing-update-controller.ts",
      "listing-submit-controller.ts"
    ]) {
      expect(await source(filename)).not.toMatch(/nominatim|geocod/i);
    }
  });

  it("keeps the frozen dependency and migration inventory with providers behind the backend boundary", async () => {
    const packageJson = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies).toStrictEqual({
      bcrypt: "6.0.0",
      cloudinary: "^2.10.0",
      cors: "2.8.5",
      dotenv: "16.5.0",
      express: "5.1.0",
      jose: "6.2.6",
      multer: "^2.2.0",
      pg: "8.16.0"
    });
    const migrations = (await readdir(path.join(backendRoot, "migrations"))).filter((filename) =>
      filename.endsWith(".sql")
    );
    expect(migrations).toHaveLength(12);
    const productionFiles = await recursiveFiles(path.join(backendRoot, "src"));
    expect(productionFiles).not.toEqual(expect.arrayContaining([expect.stringMatching(/rm034/i)]));
    const frontendProductionFiles = (await recursiveFiles(path.join(repositoryRoot, "frontend"))).filter(
      (filename) => /\.(?:ts|tsx)$/.test(filename) && !/\.test\.(?:ts|tsx)$/.test(filename)
    );
    const unsupportedFrontendFiles: string[] = [];
    for (const filename of frontendProductionFiles) {
      const relativePath = path.relative(repositoryRoot, filename).replaceAll("\\", "/");
      if (hasUnsupportedFrontendGeocoding(relativePath, await readFile(filename, "utf8"))) {
        unsupportedFrontendFiles.push(relativePath);
      }
    }
    expect(unsupportedFrontendFiles).toStrictEqual([]);

    expect(hasUnsupportedFrontendGeocoding("frontend/features/auth-form.tsx", '<Input autoComplete="email" />')).toBe(
      false
    );
    expect(
      hasUnsupportedFrontendGeocoding("frontend/features/location-form.tsx", '<Input autoComplete="street-address" />')
    ).toBe(false);
    expect(hasUnsupportedFrontendGeocoding("frontend/lib/api/listings.ts", "forwardGeocode(body)")).toBe(false);
    for (const [relativePath, source] of [
      ["frontend/lib/nominatim.client.ts", "export class ProviderClient {}"],
      ["frontend/lib/provider.ts", 'fetch("https://nominatim.openstreetmap.org/search")'],
      ["frontend/lib/provider.ts", "new NominatimClient()"],
      ["frontend/features/location.ts", "reverseGeocode(point)"],
      ["frontend/features/address.ts", "addressAutocomplete(query)"],
      ["frontend/features/location.ts", "locationTypeahead(query)"],
      ["frontend/features/geocoding.ts", "geocodingAutocomplete(query)"],
      ["frontend/features/location.ts", 'const autoComplete = "provider"']
    ] as const) {
      expect(hasUnsupportedFrontendGeocoding(relativePath, source)).toBe(true);
    }
  });
});
