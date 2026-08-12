import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8");
}

describe("RM-047 application isolation", () => {
  it("creates only the frozen public auth routes and never an admin registration or logout page", () => {
    const authRoot = join(frontendRoot, "app", "(auth)");
    expect(existsSync(join(authRoot, "login", "page.tsx"))).toBe(true);
    expect(existsSync(join(authRoot, "register", "tenant", "page.tsx"))).toBe(true);
    expect(existsSync(join(authRoot, "register", "landlord", "page.tsx"))).toBe(true);
    expect(existsSync(join(authRoot, "register", "admin", "page.tsx"))).toBe(false);
    expect(existsSync(join(authRoot, "logout", "page.tsx"))).toBe(false);
    expect(existsSync(join(authRoot, "register", "page.tsx"))).toBe(false);
  });

  it("keeps auth production on shared API/provider/UI seams without raw transport or backend imports", () => {
    const authSources = ["auth-page-shell", "login-form", "registration-form", "validation"]
      .map((name) => read(`features/auth/${name}${name === "validation" ? ".ts" : ".tsx"}`))
      .join("\n");

    expect(authSources).toContain("api.auth.login");
    expect(authSources).toContain("api.auth.registerTenant");
    expect(authSources).toContain("api.auth.registerLandlord");
    expect(authSources).toContain("useAuth");
    expect(authSources).toContain("mapApiErrorToFields");
    expect(authSources).not.toMatch(/\bfetch\s*\(|globalThis\.fetch|axios/i);
    expect(authSources).not.toMatch(/from\s+["'][^"']*backend|from\s+["'][^"']*src\/modules/);
  });

  it("keeps tokens, cookies, storage, sensitive URLs, and credential logging outside auth production", () => {
    const authProduction = [
      "features/auth/auth-page-shell.tsx",
      "features/auth/login-form.tsx",
      "features/auth/registration-form.tsx",
      "features/auth/validation.ts",
      "components/ui/app-shell.tsx"
    ]
      .map(read)
      .join("\n");

    expect(authProduction).not.toMatch(/document\.cookie|rentmate_session|localStorage|sessionStorage/i);
    expect(authProduction).not.toMatch(/Authorization|Bearer|decodeJWT|decodeJwt|setToken/i);
    expect(authProduction).not.toMatch(/useSearchParams|URLSearchParams|[?&](?:next|redirect)=/i);
    expect(authProduction).not.toMatch(/console\.(?:log|error|debug)\s*\(/);
    expect(authProduction).not.toMatch(/forgot-password|reset-password|social-login|google-login|facebook-login/i);
  });

  it("keeps RM-048 and later actor workflows outside auth scope", () => {
    const authProduction = ["auth-page-shell", "login-form", "registration-form", "validation"]
      .map((name) => read(`features/auth/${name}${name === "validation" ? ".ts" : ".tsx"}`))
      .join("\n");

    expect(authProduction).not.toMatch(/favorites|listing search|radius|current location|geocod|Cloudinary/i);
    expect(authProduction).not.toMatch(/\/admin|\/landlord|\/favorites/);
  });

  it("includes feature tests and a focused RM-047 script without adding an auth dependency", () => {
    const vitest = read("vitest.config.mts");
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(vitest).toContain('"features/**/*.test.{ts,tsx}"');
    expect(packageJson.scripts["test:rm047"]).toContain("test/rm047-application-isolation.test.ts");
    expect({ ...packageJson.dependencies, ...packageJson.devDependencies }).not.toHaveProperty("react-hook-form");
    expect({ ...packageJson.dependencies, ...packageJson.devDependencies }).not.toHaveProperty("zod");
    expect({ ...packageJson.dependencies, ...packageJson.devDependencies }).not.toHaveProperty("@playwright/test");
  });
});
