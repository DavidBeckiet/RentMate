import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = basename(process.cwd()) === "frontend" ? process.cwd() : join(process.cwd(), "frontend");
const repositoryRoot = join(frontendRoot, "..");
const readFrontend = (path: string) => readFileSync(join(frontendRoot, path), "utf8");
const readRepository = (path: string) => readFileSync(join(repositoryRoot, path), "utf8");

describe("RM-054 application isolation", () => {
  it("keeps Playwright test-only and configures a deterministic local browser topology", () => {
    const packageJson = JSON.parse(readFrontend("package.json")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const config = readFrontend("playwright.config.ts");
    expect(packageJson.devDependencies["@playwright/test"]).toBe("1.62.1");
    expect(packageJson.dependencies["@playwright/test"]).toBeUndefined();
    expect(packageJson.scripts["test:rm054:e2e"]).toContain("playwright test");
    expect(config).toContain('testDir: "./e2e"');
    expect(config).toContain("workers: 1");
    expect(config).toContain("retries: 0");
    expect(config).toContain('url: "http://localhost:4100/api/health"');
    expect(config).toContain('NEXT_PUBLIC_API_BASE_URL: "http://localhost:4100"');
    expect(config).toContain('command: "npm run dev -- --hostname localhost --port 3100"');
    expect(config).toContain('NODE_ENV: "development"');
    expect(config).not.toContain("npm run build && npm run start");
    expect(config).toContain("reuseExistingServer: false");
  });

  it("does not introduce browser test imports or test-control paths into frontend production roots", () => {
    const production = [
      "app/layout.tsx",
      "components/ui/app-shell.tsx",
      "lib/api/client.ts",
      "lib/api/transport.ts",
      "features/listings/search-page.tsx",
      "features/listings/listing-detail.tsx",
      "features/listings/owner-listing-detail.tsx",
      "features/auth/admin-users-page.tsx"
    ]
      .map(readFrontend)
      .join("\n");
    expect(production).not.toMatch(/@playwright\/test|playwright|__rm054|e2e\//i);
    expect(production).not.toMatch(
      /localStorage|sessionStorage|document\.cookie|Authorization|Bearer|rentmate_session/i
    );
  });

  it("keeps browser support on real UI cookies, real RentMate API calls, and mocked provider boundaries only", () => {
    const support = readFrontend("e2e/support/rm054-fixtures.ts");
    const transport = readFrontend("lib/api/transport.ts");
    expect(transport).toContain('credentials: "include"');
    expect(support).not.toMatch(
      /localStorage\.setItem|sessionStorage\.setItem|storageState|addCookies|Authorization|Bearer/i
    );
    expect(support).not.toMatch(/route\([^\n]*api\/v1|fulfill\([^\n]*api\/v1/i);
    expect(support).toContain("openstreetmap");
    expect(support).toContain("cloudinary");
    expect(support).not.toMatch(/https?:\/\/(?:www\.)?nominatim/i);
    expect(support).not.toMatch(/fetch\s*\(/i);
  });

  it("keeps the test-only backend control outside the public API and preserves the frozen application entry points", () => {
    const server = readRepository("backend/test/rm054-browser-server.ts");
    const fixture = readRepository("backend/test/helpers/rm054-browser-fixture.ts");
    const composition = readRepository("backend/src/server-composition.ts");
    expect(server).toContain('app.post("/__rm054/reset"');
    expect(server).not.toContain('"/api/v1/__rm054');
    expect(fixture).toContain("createBackendApp");
    expect(fixture).toContain("rentmate_test_rm054");
    expect(fixture).not.toMatch(/https?:\/\/(?:www\.)?nominatim|cloudinary\.v2|globalThis\.fetch/i);
    expect(composition).toContain("export async function createBackendApp");
  });

  it("registers explicit non-browser and browser RM-054 commands without implying that E2E was skipped", () => {
    const rootPackage = JSON.parse(readRepository("package.json")) as { scripts: Record<string, string> };
    expect(rootPackage.scripts["test:rm054"]).toContain("rm054-browser-fixture.test.ts");
    expect(rootPackage.scripts["test:rm054"]).toContain("rm054-application-isolation.test.ts");
    expect(rootPackage.scripts["test:rm054:e2e"]).toBe("npm --prefix frontend run test:rm054:e2e");
  });
});
