import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Logger } from "../src/shared/logging/logger.js";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const authRoot = path.resolve(backendRoot, "src/modules/auth");

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function gitDiff(...paths: string[]): string {
  return execFileSync("git", ["diff", "--name-only", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
}

describe("RM-016 application isolation", () => {
  it("registers exactly the two existing registration routes plus login and logout once", async () => {
    const routes = await readFile(path.join(authRoot, "routes.ts"), "utf8");
    const expected = ["/auth/register/tenant", "/auth/register/landlord", "/auth/login", "/auth/logout"];

    for (const route of expected) {
      expect([...routes.matchAll(new RegExp(`router\\.post\\(\\"${route}\\"`, "g"))]).toHaveLength(1);
    }
    expect([...routes.matchAll(/router\.post\(/g)]).toHaveLength(4);
    expect(routes).not.toMatch(/users\/me|register\/admin|activat|password.?reset|email.?change|refresh.?token/i);
  });

  it("keeps logout unauthenticated, unverified, unthrottled, and database-free", async () => {
    const controller = await readFile(path.join(authRoot, "login-controller.ts"), "utf8");
    const routes = await readFile(path.join(authRoot, "routes.ts"), "utf8");
    const logoutHandler = controller.slice(controller.indexOf("export function createLogoutHandler"));
    const logoutRoute = routes.match(/router\.post\("\/auth\/logout"[^;]+;/)?.[0] ?? "";

    expect(logoutHandler).toContain("validateLogoutBody(request.body)");
    expect(logoutHandler).toContain("validateQueryKeys(request.query, [])");
    expect(logoutHandler).toContain("sessionCookieService.clear(response)");
    expect(logoutHandler).toContain("sendNoContent(response)");
    expect(logoutHandler).not.toMatch(/verify|loginService|repository|pool\.query|SqlExecutor|authenticate/i);
    expect(logoutRoute).toBe('router.post("/auth/logout", createLogoutHandler(dependencies));');
    expect(logoutRoute).not.toMatch(/rateLimit|authentication|optional|role/i);
  });

  it("keeps login application layers read-only and free of generic frameworks", async () => {
    const sources = await Promise.all(
      ["login-validation.ts", "login-service.ts", "login-controller.ts"].map((file) =>
        readFile(path.join(authRoot, file), "utf8")
      )
    );
    const combined = sources.join("\n");

    expect(combined).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|pool\.query)\b/);
    expect(combined).not.toMatch(/refresh.?token|blacklist|session.?table|dependency.?injection.?container/i);
    expect(combined).not.toMatch(/console\.|logger\.|password_hash|response\.json/);
  });

  it("keeps schema, dependencies, lockfiles, global composition, and adjacent scopes unchanged", async () => {
    const migrations = (await readdir(path.resolve(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    const backendPackage = JSON.parse(await readFile(path.resolve(backendRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const appSource = await readFile(path.resolve(backendRoot, "src/app.ts"), "utf8");

    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(migrations.some((filename) => filename.startsWith("0013"))).toBe(false);
    expect(backendPackage.dependencies).toStrictEqual({
      bcrypt: "6.0.0",
      cloudinary: "^2.10.0",
      cors: "2.8.5",
      dotenv: "16.5.0",
      express: "5.1.0",
      jose: "6.2.6",
      multer: "^2.2.0",
      pg: "8.16.0"
    });
    expect(backendPackage.devDependencies["@types/multer"]).toBe("^2.1.0");
    expect(backendPackage.dependencies).not.toHaveProperty("@types/multer");

    expect(gitDiff("package-lock.json")).toBe("");
    expect(appSource).toContain("app.use(express.json({ strict: false }));");
    expect(appSource.match(/app\.use\(express\.json/g)).toHaveLength(1);
    expect(gitDiff("backend/src/config/env.ts", ".env.example")).toBe("");
    expect(
      gitDiff(
        "backend/src/modules/auth/password.ts",
        "backend/src/modules/auth/session-token.ts",
        "backend/src/modules/auth/session-cookie.ts",
        "backend/src/shared/middleware/authentication.ts"
      )
    ).toBe("");
    expect(gitDiff("backend/migrations", "frontend", "docs", "AGENTS.md")).toBe("");
  });

  it("preserves the exact health endpoint without requiring auth composition", async () => {
    const app = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: silentLogger,
      checkDatabaseConnection: async () => undefined
    });

    const response = await request(app).get("/api/health").expect(200);
    expect(response.body).toStrictEqual({ status: "ok", database: "connected" });
    await request(app).post("/api/v1/users/me").set("Origin", "http://localhost:3000").send({}).expect(404);
  });
});
