import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();
const production = [
  "features/auth/landlord-profile.tsx",
  "features/listings/owner-query.ts",
  "features/listings/owner-listing-card.tsx",
  "features/listings/owner-listings-page.tsx",
  "features/listings/owner-listing-detail.tsx",
  "features/listings/owner-listing-editor.tsx",
  "features/listings/owner-lifecycle-actions.tsx"
] as const;

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8");
}

describe("RM-050 application isolation", () => {
  it("uses only shared users/lookups/listings clients and no browser-held credentials", () => {
    const source = production.map(read).join("\n");
    expect(source).toMatch(/api\.users\s*\.updateCurrent/);
    expect(source).toMatch(/api\.lookups\s*\.listPropertyTypes/);
    expect(source).toMatch(/api\.lookups\s*\.listAmenities/);
    expect(source).toMatch(/api\.listings\s*\.listOwned/);
    expect(source).toMatch(/api\.listings\s*\.getOwned/);
    expect(source).toMatch(/api\.listings\s*\.updateOwned/);
    expect(source).not.toMatch(/\bfetch\s*\(|globalThis\.fetch|axios/i);
    expect(source).not.toMatch(/Authorization|Bearer|decodeJWT|decodeJwt|rentmate_session/i);
    expect(source).not.toMatch(/document\.cookie|localStorage|sessionStorage|indexedDB/i);
  });

  it("keeps admin, favorites, image mutation, geocoding, and browser-location workflows outside RM-050", () => {
    const source = production.map(read).join("\n");
    expect(source).not.toMatch(/api\.admin|api\.favorites/);
    expect(source).not.toMatch(/uploadImage|deleteImage|reorderImages|forwardGeocode/);
    expect(source).not.toMatch(/Nominatim|nominatim|geocod|navigator\.geolocation/i);
    expect(source).not.toMatch(/onMarkerMove|onMapClick|draggable\s*=/);
    expect(source).not.toMatch(/\/admin|\/landlord\/listings\/new|image uploader/i);
  });

  it("has no local lifecycle transition authority or background PATCH", () => {
    const editor = read("features/listings/owner-listing-editor.tsx");
    const actions = read("features/listings/owner-lifecycle-actions.tsx");
    expect(editor).not.toMatch(
      /setStatus|transitionReducer|nextStatus|status\s*:\s*["'](?:DRAFT|PENDING|APPROVED|REJECTED|HIDDEN|INACTIVE)/
    );
    expect(actions).not.toMatch(/setStatus|transitionReducer|nextStatus/);
    expect(actions).toContain("onDetailChange(returned)");
    expect(editor).toContain("api.listings.updateOwned");
    expect(editor).not.toMatch(/setTimeout|setInterval|debounce|autosave/i);
  });

  it("keeps exact coordinates in owner workflow and public privacy files untouched by composition", () => {
    const owner = read("features/listings/owner-listing-detail.tsx");
    const publicDetail = read("features/listings/listing-detail.tsx");
    const publicCard = read("features/listings/listing-card.tsx");
    const favorites = read("features/favorites/favorites-page.tsx");
    expect(owner).toContain("Vị trí chính xác của tin");
    expect(owner).toContain("detail.latitude");
    expect(owner).toContain("detail.longitude");
    expect(publicDetail).toContain("Vị trí xấp xỉ");
    expect(publicDetail).not.toContain("Vị trí chính xác của tin");
    expect(publicCard).not.toMatch(/addressText|landlordContact/);
    expect(favorites).not.toMatch(/addressText|landlordContact/);
  });

  it("registers only the three RM-050 routes and focused suite without dependency drift", () => {
    const dashboard = read("app/(landlord)/landlord/page.tsx");
    const profile = read("app/(landlord)/landlord/profile/page.tsx");
    const detail = read("app/(landlord)/landlord/listings/[listingId]/page.tsx");
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(dashboard).toContain("<OwnerListingsPage />");
    expect(profile).toContain("<LandlordProfile />");
    expect(detail).toContain("<OwnerListingDetail listingId={listingId} />");
    expect(packageJson.scripts["test:rm050"]).toContain("test/rm050-application-isolation.test.ts");
    const packages = { ...packageJson.dependencies, ...packageJson.devDependencies };
    for (const dependency of [
      "@tanstack/react-query",
      "swr",
      "zustand",
      "react-hook-form",
      "zod",
      "@playwright/test"
    ]) {
      expect(packages).not.toHaveProperty(dependency);
    }
  });
});
