import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();
const production = [
  "features/listings/owner-location-controls.tsx",
  "features/listings/owner-image-manager.tsx",
  "features/listings/owner-listing-detail.tsx",
  "features/listings/owner-listing-editor.tsx"
] as const;
const publicAndFavorites = [
  "features/listings/listing-card.tsx",
  "features/listings/listing-detail.tsx",
  "features/favorites/favorites-page.tsx"
] as const;

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8");
}

describe("RM-051 application isolation", () => {
  it("uses only the existing shared listings wrappers for geocoding and image workflows", () => {
    const source = production.map(read).join("\n");
    expect(source).toMatch(/api\.listings\s*\.forwardGeocode/);
    expect(source).toMatch(/api\.listings\s*\.uploadImage/);
    expect(source).toMatch(/api\.listings\s*\.deleteImage/);
    expect(source).toMatch(/api\.listings\s*\.reorderImages/);
    expect(source).toMatch(/api\.listings\s*\.getOwned/);
    expect(source).toMatch(/api\.listings\s*\.updateOwned/);
    expect(source).not.toMatch(/\bfetch\s*\(|globalThis\.fetch|axios/i);
    expect(source).not.toMatch(/replaceImage|replace-image|image\/replace/i);
  });

  it("keeps provider credentials and direct provider integrations out of browser production", () => {
    const source = production.map(read).join("\n");
    expect(source).not.toMatch(/nominatim|openstreetmap\.org\/search|NominatimClient/i);
    expect(source).not.toMatch(/cloudinary|upload.?preset|cloud.?name|public.?id|api[_-]?(?:key|secret)/i);
    expect(source).not.toMatch(/Authorization|Bearer|decodeJWT|decodeJwt|rentmate_session/i);
    expect(source).not.toMatch(/document\.cookie|localStorage|sessionStorage|indexedDB/i);
  });

  it("has explicit forward geocoding and manual pin placement without adjacent location workflows", () => {
    const location = read("features/listings/owner-location-controls.tsx");
    expect(location).toContain("Tìm vị trí từ địa chỉ");
    expect(location).toContain("api.listings.forwardGeocode");
    expect(location).toContain("onMapClick");
    expect(location).toContain("onMarkerMove");
    expect(location).toContain("draggable: !disabled");
    expect(location).not.toMatch(/reverse.?geocod|typeahead|addressAutocomplete/i);
    expect(location).not.toMatch(/navigator\.geolocation/i);
    expect(location).not.toMatch(/setTimeout|setInterval|debounce|autosave/i);
    expect(location).not.toMatch(/from\s+["'](?:leaflet|react-leaflet)["']/i);
    expect(location).not.toMatch(/useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*forwardGeocode/);
  });

  it("keeps image operations explicit, non-atomic, and free of automatic mutation retry machinery", () => {
    const manager = read("features/listings/owner-image-manager.tsx");
    expect(manager).toContain("Thay ảnh gồm nhiều bước. Nếu bước sau lỗi, thay đổi của bước trước vẫn được giữ.");
    expect(manager).toContain("Xóa ảnh cũ để hoàn tất");
    expect(manager).toContain("Tải ảnh mới để hoàn tất");
    expect(manager).toContain("Tải lại tin");
    expect(manager).not.toMatch(/retry\s*\(|retryCount|retryDelay|exponential|backoff/i);
    expect(manager).not.toMatch(/Promise\.all|rollback|transaction/i);
    expect(manager).not.toMatch(/createObjectURL|canvas|crop|compress|imageEditor/i);
    expect(manager).not.toMatch(/window\.confirm|alert\s*\(/i);
  });

  it("does not introduce owner mutations into public listings, favorites, or admin workflow", () => {
    const source = publicAndFavorites.map(read).join("\n");
    expect(source).not.toMatch(
      /api\.listings\s*\.\s*(?:forwardGeocode|uploadImage|deleteImage|reorderImages|updateOwned|getOwned)/
    );
    const owner = production.map(read).join("\n");
    expect(owner).not.toMatch(/api\.admin|\/admin|moderationHistory/i);
    expect(owner).not.toMatch(/api\.favorites|features\/favorites/i);
  });

  it("registers the focused suite without dependency drift", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const focused = packageJson.scripts["test:rm051"];
    expect(focused).toContain("owner-location-controls.test.tsx");
    expect(focused).toContain("owner-image-manager.test.tsx");
    expect(focused).toContain("owner-listing-editor.test.tsx");
    expect(focused).toContain("owner-listing-detail.test.tsx");
    expect(focused).toContain("rm051-application-isolation.test.ts");
    const packages = { ...packageJson.dependencies, ...packageJson.devDependencies };
    for (const dependency of [
      "@dnd-kit/core",
      "react-dropzone",
      "react-easy-crop",
      "cloudinary",
      "@tanstack/react-query",
      "swr",
      "zustand"
    ]) {
      expect(packages).not.toHaveProperty(dependency);
    }
  });
});
