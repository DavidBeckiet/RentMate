import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendDirectory = path.resolve(__dirname, "..");

describe("ROOMMATE-V1-06 E2E harness isolation", () => {
  it("uses development mode for local HTTP without weakening production validation", () => {
    const config = fs.readFileSync(path.join(frontendDirectory, "playwright.roommate-v1.config.ts"), "utf8");
    expect(config).toContain('command: "npm run dev -- --hostname localhost --port 3000"');
    expect(config).toContain('NODE_ENV: "development"');
    expect(config).toContain('NEXT_PUBLIC_API_BASE_URL: "http://localhost:4001"');
    expect(config).not.toContain("npm run build");
    expect(config).not.toContain("npm run start");
  });

  it("runs only the real Gateway release spec without API mocks or browser token storage", () => {
    const config = fs.readFileSync(path.join(frontendDirectory, "playwright.roommate-v1.config.ts"), "utf8");
    const spec = fs.readFileSync(path.join(frontendDirectory, "e2e/roommate-v1-release.spec.ts"), "utf8");
    expect(config).toContain("roommate-v1-release\\.spec\\.ts");
    expect(spec).toContain('const gatewayBaseUrl = "http://localhost:4001"');
    expect(spec).not.toContain("page.route(");
    expect(spec).not.toContain("localStorage");
    expect(spec).not.toContain("sessionStorage");
  });
});
