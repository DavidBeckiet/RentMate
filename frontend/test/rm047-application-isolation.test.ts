import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();
const browserTestPackageImport =
  /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["'](?:@playwright\/test|playwright(?:-core)?)(?:\/[^"']*)?["']/;

function read(path: string): string {
  return readFileSync(join(frontendRoot, path), "utf8");
}

describe("RM-047 application isolation", () => {
  it("keeps the public auth routes and adds only a role chooser entry route", () => {
    const authRoot = join(frontendRoot, "app", "(auth)");
    expect(existsSync(join(authRoot, "login", "page.tsx"))).toBe(true);
    expect(existsSync(join(authRoot, "register", "tenant", "page.tsx"))).toBe(true);
    expect(existsSync(join(authRoot, "register", "landlord", "page.tsx"))).toBe(true);
    expect(existsSync(join(authRoot, "register", "admin", "page.tsx"))).toBe(false);
    expect(existsSync(join(authRoot, "logout", "page.tsx"))).toBe(false);
    expect(existsSync(join(authRoot, "register", "page.tsx"))).toBe(true);
    expect(existsSync(join(authRoot, "forgot-password", "page.tsx"))).toBe(true);
    expect(existsSync(join(authRoot, "reset-password", "page.tsx"))).toBe(true);

    const authShell = read("components/ui/app-shell.tsx");
    const tenantPage = read("app/(auth)/register/tenant/page.tsx");
    const landlordPage = read("app/(auth)/register/landlord/page.tsx");
    expect(authShell).toContain('href: "/register"');
    expect(authShell).toContain('href: "/login"');
    expect(authShell).not.toContain("Điều hướng công khai");
    expect(tenantPage).toContain('href="/register"');
    expect(landlordPage).toContain('href="/register"');
  });

  it("keeps auth production on shared API/provider/UI seams without raw transport or backend imports", () => {
    const authSources = [
      "auth-page-shell",
      "google-auth-seam",
      "login-form",
      "registration-form",
      "registration-chooser",
      "validation"
    ]
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
      "features/auth/google-auth-seam.tsx",
      "features/auth/login-form.tsx",
      "features/auth/registration-form.tsx",
      "features/auth/registration-chooser.tsx",
      "features/auth/validation.ts",
      "components/ui/app-shell.tsx"
    ]
      .map(read)
      .join("\n");

    expect(authProduction).not.toMatch(/document\.cookie|rentmate_session|localStorage|sessionStorage/i);
    expect(authProduction).not.toMatch(/Authorization|Bearer|decodeJWT|decodeJwt|setToken/i);
    expect(authProduction).not.toMatch(/useSearchParams|URLSearchParams|[?&](?:next|redirect)=/i);
    expect(authProduction).not.toMatch(/console\.(?:log|error|debug)\s*\(/);
    expect(authProduction).not.toMatch(/social-login|google-login|facebook-login/i);
    expect(authProduction).not.toMatch(browserTestPackageImport);
  });

  it("keeps RM-048 and later actor workflows outside auth scope", () => {
    const authProduction = ["auth-page-shell", "login-form", "registration-form", "validation"]
      .map((name) => read(`features/auth/${name}${name === "validation" ? ".ts" : ".tsx"}`))
      .join("\n");

    expect(authProduction).not.toMatch(/favorites|listing search|radius|current location|geocod|Cloudinary/i);
    expect(authProduction).not.toMatch(/\/admin|\/landlord|\/favorites/);
  });

  it("includes feature tests and a focused RM-047 script without adding runtime test tooling", () => {
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
    for (const dependency of ["@playwright/test", "playwright", "playwright-core"])
      expect(packageJson.dependencies).not.toHaveProperty(dependency);
  });
});
