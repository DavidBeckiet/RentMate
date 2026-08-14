import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();
const productionRoots = ["app", "components", "features", "lib", "types"] as const;
const browserTestPackageImport =
  /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["'](?:@playwright\/test|playwright(?:-core)?)(?:\/[^"']*)?["']/;

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (["node_modules", ".next", "coverage"].includes(entry)) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry) || /\.(?:test|spec)\.(ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}

function productionSourceFiles(): readonly string[] {
  return productionRoots.flatMap((root) => sourceFiles(join(frontendRoot, root)));
}

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8");
}

describe("RM-045 application isolation", () => {
  it("keeps all 31 frozen endpoint wrappers on the single shared client surface", () => {
    const sources = ["auth", "users", "lookups", "listings", "favorites", "admin"]
      .map((name) => read(`lib/api/${name}.ts`))
      .join("\n");
    const wrapperNames = [
      "registerTenant",
      "registerLandlord",
      "login",
      "logout",
      "getCurrent",
      "updateCurrent",
      "listPropertyTypes",
      "listAmenities",
      "searchPublic",
      "getPublicDetail",
      "createDraft",
      "listOwned",
      "getOwned",
      "updateOwned",
      "deleteOwned",
      "submit",
      "deactivate",
      "reactivate",
      "uploadImage",
      "deleteImage",
      "reorderImages",
      "forwardGeocode",
      "list",
      "add",
      "remove",
      "listListings",
      "getListing",
      "listHistory",
      "moderate",
      "listUsers",
      "setActivation"
    ];

    expect(wrapperNames).toHaveLength(31);
    wrapperNames.forEach((name) => expect(sources).toMatch(new RegExp(`\\b${name}:`)));
    expect(read("lib/api/client.ts")).toContain("health:");
  });

  it("centralizes raw browser fetch and cookie credentials in transport", () => {
    const productionFiles = productionSourceFiles();
    const transportPath = join(frontendRoot, "lib", "api", "transport.ts");
    const rawFetchOutsideTransport = productionFiles
      .filter((path) => path !== transportPath)
      .filter((path) => /\bfetch\s*\(|globalThis\.fetch/.test(readFileSync(path, "utf8")))
      .map((path) => relative(frontendRoot, path));
    const transport = read("lib/api/transport.ts");

    expect(rawFetchOutsideTransport).toEqual([]);
    expect(transport).toContain('credentials: "include"');
    expect(transport).not.toContain("Authorization");
    expect(transport).not.toContain("Origin");
  });

  it("keeps tokens, browser storage, backend types, and middleware auth outside frontend production", () => {
    const production = productionSourceFiles()
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(production).not.toMatch(/Bearer|decodeJWT|decodeJwt|localStorage|sessionStorage|setToken/);
    expect(production).not.toMatch(/from\s+["'][^"']*backend|from\s+["'][^"']*src\/modules/);
    expect(production).not.toMatch(browserTestPackageImport);
    expect(existsSync(join(frontendRoot, "middleware.ts"))).toBe(false);
    expect(existsSync(join(frontendRoot, "middleware.tsx"))).toBe(false);
  });

  it("keeps the shell navigation bounded to existing routes and the root layout server-side", () => {
    const shell = read("components/ui/app-shell.tsx");
    const layout = read("app/layout.tsx");
    const hrefs = [...shell.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

    expect(existsSync(join(frontendRoot, "app", "page.tsx"))).toBe(true);
    expect(hrefs).toContain("#main-content");
    expect(hrefs).toContain("/");
    expect(hrefs.every((href) => href.startsWith("/") || href.startsWith("#"))).toBe(true);
    expect(layout.startsWith('"use client"')).toBe(false);
    expect(read("lib/auth/auth-guard.tsx")).toContain("backend authorization remains authoritative");
  });
});
