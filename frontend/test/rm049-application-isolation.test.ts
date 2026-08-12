import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();
const favoriteProduction = [
  "features/favorites/favorite-save-control.tsx",
  "features/favorites/favorite-remove-control.tsx",
  "features/favorites/favorites-page.tsx"
] as const;

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8");
}

describe("RM-049 application isolation", () => {
  it("uses only the shared favorites client and keeps transport/auth secrets outside the feature", () => {
    const source = favoriteProduction.map(read).join("\n");
    expect(source).toMatch(/api\.favorites\s*\.add/);
    expect(source).toMatch(/api\.favorites\s*\.remove/);
    expect(source).toMatch(/api\.favorites\s*\.list/);
    expect(source).not.toMatch(/\bfetch\s*\(|globalThis\.fetch|axios/i);
    expect(source).not.toMatch(/Authorization|Bearer|decodeJWT|decodeJwt|rentmate_session/i);
    expect(source).not.toMatch(/document\.cookie|localStorage|sessionStorage|indexedDB/i);
    expect(source).not.toMatch(/from\s+["'][^"']*backend|from\s+["'][^"']*src\/modules/);
  });

  it("keeps fake membership, hydration, maps, discovery filters, and later workflows out of favorites", () => {
    const source = favoriteProduction.map(read).join("\n");
    expect(source).not.toMatch(/isFavorited|favoriteIds|hydrateFavorites|membership/i);
    expect(source).not.toMatch(/MapBase|SearchMap|RadiusControls|navigator\.geolocation|api\.listings\.searchPublic/);
    expect(source).not.toMatch(/createDraft|updateOwned|forwardGeocode|uploadImage|api\.admin|\/landlord|\/admin/);
    expect(source).not.toMatch(/folders?|collections?|notifications?|recommendations?|compare|sharing/i);
  });

  it("keeps ListingDetail favorites-agnostic and composes the save action at the route", () => {
    const detail = read("features/listings/listing-detail.tsx");
    const detailRoute = read("app/listings/[listingId]/page.tsx");
    expect(detail).not.toMatch(/api\.favorites|features\/favorites|favorite-(?:save|remove)/i);
    expect(detailRoute).toContain("FavoriteSaveControl");
    expect(detailRoute).toMatch(/<ListingDetail\b[^>]*\blistingId\s*=\s*\{\s*listingId\s*\}/);
    expect(detailRoute).toMatch(/<ListingDetail\b[^>]*\bactions\s*=/);
  });

  it("registers the thin favorites route and focused script without dependency drift", () => {
    const route = read("app/(tenant)/favorites/page.tsx");
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(route).toContain("<FavoritesPage />");
    expect(route).toContain("<Suspense");
    expect(packageJson.scripts["test:rm049"]).toContain("features/favorites/favorites-page.test.tsx");
    const packages = { ...packageJson.dependencies, ...packageJson.devDependencies };
    for (const dependency of [
      "@tanstack/react-query",
      "swr",
      "zustand",
      "nuqs",
      "query-string",
      "react-hook-form",
      "zod",
      "@playwright/test"
    ]) {
      expect(packages).not.toHaveProperty(dependency);
    }
  });
});
