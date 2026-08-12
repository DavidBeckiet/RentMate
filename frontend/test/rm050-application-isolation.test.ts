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
const publicAndFavoriteProduction = [
  "features/listings/listing-card.tsx",
  "features/listings/listing-detail.tsx",
  "features/favorites/favorites-page.tsx"
] as const;
const browserAutocompleteAttribute =
  /(<[A-Za-z][^<>]*?)\s+autocomplete\s*=\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|\{[^}\r\n]*\})/gi;

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8");
}

function hasUnsupportedOwnerProviderBehavior(source: string): boolean {
  const semanticSource = source.replace(browserAutocompleteAttribute, "$1");
  return (
    /nominatim|cloudinary|upload.?preset|cloudinary.?public.?id|signed.?upload|api[_-]?(?:key|secret)|cloud_name/i.test(
      semanticSource
    ) ||
    /reverse.?geocod|autocomplete|typeahead/i.test(semanticSource) ||
    /navigator\.geolocation/i.test(semanticSource) ||
    /from\s+["'](?:leaflet|react-leaflet)["']/i.test(semanticSource) ||
    /on(?:MapClick|MarkerMove)\s*=\s*\{[^}\r\n]*forwardGeocode/i.test(semanticSource)
  );
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

  it("keeps admin, favorites, and direct provider behavior outside the owner workflow", () => {
    const source = production.map(read).join("\n");
    expect(source).not.toMatch(/api\.admin|api\.favorites/);
    expect(source).not.toMatch(/\/admin|features\/favorites|from\s+["'][^"']*favorites/i);
    expect(hasUnsupportedOwnerProviderBehavior(source)).toBe(false);
    expect(
      hasUnsupportedOwnerProviderBehavior(`
        api.listings.forwardGeocode(body, signal);
        api.listings.uploadImage(listingId, input, signal);
        api.listings.deleteImage(listingId, imageId, signal);
        api.listings.reorderImages(listingId, body, signal);
        <MapBase onMapClick={onMapClick} onMarkerMove={onMarkerMove} markers={[{ draggable: true }]} />;
      `)
    ).toBe(false);
    for (const unsupported of [
      'fetch("https://nominatim.openstreetmap.org/search")',
      "new NominatimClient()",
      "reverseGeocode(point)",
      "addressAutocomplete(query)",
      "<MapBase onMapClick={() => api.listings.forwardGeocode(body)} />",
      "navigator.geolocation.getCurrentPosition(success)",
      'import { MapContainer } from "react-leaflet"',
      "cloudinary.v2.uploader.upload(file)",
      'const uploadPreset = "unsigned"',
      "mutateCloudinaryPublicId(image)"
    ]) {
      expect(hasUnsupportedOwnerProviderBehavior(unsupported)).toBe(true);
    }
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
    const publicAndFavorites = publicAndFavoriteProduction.map(read).join("\n");
    expect(owner).toContain("Vị trí chính xác của tin");
    expect(owner).toContain("detail.latitude");
    expect(owner).toContain("detail.longitude");
    expect(publicDetail).toContain("Vị trí xấp xỉ");
    expect(publicDetail).not.toContain("Vị trí chính xác của tin");
    expect(publicCard).not.toMatch(/addressText|landlordContact/);
    expect(favorites).not.toMatch(/addressText|landlordContact/);
    expect(publicAndFavorites).not.toMatch(
      /api\.listings\s*\.\s*(?:uploadImage|deleteImage|reorderImages|forwardGeocode)/
    );
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
