import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const browserTestPackageImport =
  /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["'](?:@playwright\/test|playwright(?:-core)?)(?:\/[^"']*)?["']/;
const production = [
  "features/listings/admin-listings-page.tsx",
  "features/listings/admin-listing-detail.tsx",
  "features/listings/moderation-history.tsx",
  "features/listings/moderation-actions.tsx",
  "features/auth/admin-users-page.tsx",
  "features/auth/admin-user-detail.tsx"
] as const;
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("RM-052 application isolation", () => {
  it("uses only the established typed admin API wrappers", () => {
    const source = production.map(read).join("\n");
    for (const call of ["listListings", "getListing", "listHistory", "moderate", "listUsers", "setActivation"])
      expect(source).toMatch(new RegExp(`api\\.admin\\s*\\.\\s*${call}`));
    expect(source).not.toMatch(/\bfetch\s*\(|axios|XMLHttpRequest/);
    expect(source).not.toMatch(browserTestPackageImport);
  });

  it("does not add token, cookie, storage, owner mutation, or provider behavior", () => {
    const source = production.map(read).join("\n");
    expect(source).not.toMatch(
      /Authorization|Bearer|rentmate_session|document\.cookie|localStorage|sessionStorage|indexedDB/i
    );
    expect(source).not.toMatch(/api\.listings\.(?:updateOwned|uploadImage|deleteImage|reorderImages|forwardGeocode)/);
    expect(source).not.toMatch(/cloudinary|nominatim|reverse.?geocod/i);
  });

  it("keeps moderation and activation explicit without optimistic or automatic retry machinery", () => {
    const actions = read("features/listings/moderation-actions.tsx");
    const users = read("features/auth/admin-user-detail.tsx");
    expect(actions).toContain('title: "Duyệt tin này?"');
    expect(actions).toContain('aria-haspopup="dialog"');
    expect(users).toContain("title={`${actionLabel(detail)} tài khoản?`}");
    expect(`${actions}\n${users}`).not.toMatch(/setInterval|backoff|retryCount|optimistic/i);
    expect(users).toContain("{ isActive: !detail.isActive }");
    expect(actions).toContain("apiError?.status === 409");
    expect(actions).toContain('apiError?.code === "NETWORK_ERROR"');
    expect(actions).toContain("onReloadCanonical(false)");
  });

  it("registers only the focused RM-052 suite without dependency drift", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(packageJson.scripts["test:rm052"]).toContain("rm052-application-isolation.test.ts");
    const packages = { ...packageJson.dependencies, ...packageJson.devDependencies };
    for (const dependency of ["@tanstack/react-query", "swr", "zustand"])
      expect(packages).not.toHaveProperty(dependency);
    for (const dependency of ["@playwright/test", "playwright", "playwright-core"])
      expect(packageJson.dependencies).not.toHaveProperty(dependency);
  });
});
