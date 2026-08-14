import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();
const browserTestPackageImport =
  /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["'](?:@playwright\/test|playwright(?:-core)?)(?:\/[^"']*)?["']/;
const rm048Production = [
  "features/listings/format.ts",
  "features/listings/listing-card.tsx",
  "features/listings/listing-detail.tsx",
  "features/listings/radius-controls.tsx",
  "features/listings/search-filters.tsx",
  "features/listings/search-map.tsx",
  "features/listings/search-page.tsx",
  "features/listings/search-query.ts"
] as const;

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8");
}

describe("RM-048 application isolation", () => {
  it("uses the shared lookup/listing client and keeps raw transport outside RM-048", () => {
    const source = rm048Production.map(read).join("\n");
    const searchPage = read("features/listings/search-page.tsx");
    const detail = read("features/listings/listing-detail.tsx");

    expect(searchPage).toMatch(/api\.lookups\s*\.listPropertyTypes/);
    expect(searchPage).toMatch(/api\.lookups\s*\.listAmenities/);
    expect(searchPage).toMatch(/api\.listings\s*\.searchPublic/);
    expect(detail).toMatch(/api\.listings\s*\.getPublicDetail/);
    expect(source).not.toMatch(/\bfetch\s*\(|globalThis\.fetch|axios/i);
    expect(source).not.toMatch(/from\s+["'][^"']*backend|from\s+["'][^"']*src\/modules/);
  });

  it("keeps provider, auth-token, storage, and later actor behavior outside public discovery", () => {
    const source = rm048Production.map(read).join("\n");
    expect(source).not.toMatch(/Nominatim|reverse.?geocod|typeahead/i);
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|rentmate_session/i);
    expect(source).not.toMatch(/Authorization|Bearer|decodeJWT|decodeJwt|setToken/i);
    expect(source).not.toMatch(/api\.favorites|api\.admin|createDraft|updateOwned|forwardGeocode|uploadImage/i);
    expect(source).not.toMatch(/\/favorites|\/landlord|\/admin/);
    expect(source).not.toMatch(browserTestPackageImport);
  });

  it("keeps map presentation API-free and search movement explicit", () => {
    const map = read("features/listings/search-map.tsx");
    const page = read("features/listings/search-page.tsx");
    expect(map).toContain("MapBase");
    expect(map).toContain("MapSearchControl");
    expect(map).not.toMatch(/api\.|\bfetch\s*\(|useRouter|useSearchParams/);
    expect(page).toContain("onViewportChange={setPendingViewport}");
    expect(page).toContain("onSearchBounds");
  });

  it("renders detail contact only from the returned landlordContact field", () => {
    const detail = read("features/listings/listing-detail.tsx");
    expect(detail).toContain("detail.landlordContact ?");
    expect(detail).toContain("detail.landlordContact.email");
    expect(detail).toContain("detail.landlordContact.phone");
    expect(detail).not.toMatch(/authStatus\s*===\s*["']authenticated["'][\s\S]{0,80}(?:email|phone)/);
    expect(detail).not.toMatch(/user\.(?:email|phone)/);
  });

  it("adds one focused script without adding runtime browser-test tooling or a future route", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const detailRoute = read("app/listings/[listingId]/page.tsx");
    const script = packageJson.scripts["test:rm048"];
    expect(script).toContain("test/rm048-application-isolation.test.ts");
    expect(script).toContain("features/listings/search-query.test.ts");
    const packages = { ...packageJson.dependencies, ...packageJson.devDependencies };
    for (const dependency of [
      "@tanstack/react-query",
      "swr",
      "zustand",
      "nuqs",
      "query-string",
      "react-hook-form",
      "zod"
    ]) {
      expect(packages).not.toHaveProperty(dependency);
    }
    for (const dependency of ["@playwright/test", "playwright", "playwright-core"])
      expect(packageJson.dependencies).not.toHaveProperty(dependency);
    expect(read("app/page.tsx")).toContain("<SearchPage />");
    expect(detailRoute).toContain("<ListingDetail");
    expect(detailRoute).toMatch(/<ListingDetail\b[^>]*\blistingId\s*=\s*\{\s*listingId\s*\}/);
  });
});
