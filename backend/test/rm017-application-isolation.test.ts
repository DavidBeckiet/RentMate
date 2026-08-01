import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Logger } from "../src/shared/logging/logger.js";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");

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

describe("RM-017 application isolation", () => {
  it("creates exactly the users profile boundary without duplicating auth ownership", async () => {
    const moduleDirectories = (await readdir(path.resolve(backendRoot, "src/modules"))).sort();
    const authFiles = (await readdir(path.resolve(backendRoot, "src/modules/auth"))).sort();
    const usersFiles = (await readdir(path.resolve(backendRoot, "src/modules/users"))).sort();

    expect(moduleDirectories).toStrictEqual(["auth", "users"]);
    expect(authFiles).toEqual([
      "auth-repository.ts",
      "login-controller.ts",
      "login-service.ts",
      "login-validation.ts",
      "password.ts",
      "registration-controller.ts",
      "registration-service.ts",
      "registration-validation.ts",
      "routes.ts",
      "session-cookie.ts",
      "session-token.ts"
    ]);
    expect(usersFiles).toEqual([
      "routes.ts",
      "user-profile.ts",
      "user-validation.ts",
      "users-controller.ts",
      "users-repository.ts",
      "users-service.ts"
    ]);
  });

  it("registers exactly two current-user routes and keeps auth at four routes", async () => {
    const authRoutes = await readFile(path.resolve(backendRoot, "src/modules/auth/routes.ts"), "utf8");
    const usersRoutes = await readFile(path.resolve(backendRoot, "src/modules/users/routes.ts"), "utf8");

    expect([...usersRoutes.matchAll(/router\.(get|patch)\(\s*"\/users\/me"/g)].map((match) => match[1])).toEqual([
      "get",
      "patch"
    ]);
    expect([...usersRoutes.matchAll(/router\.(get|patch|post|put|delete)\(/g)]).toHaveLength(2);
    expect(usersRoutes).not.toMatch(/auth\/me|users\/:userId|admin|role.?middleware|optional|rate.?limit/i);
    expect([...authRoutes.matchAll(/router\.post\(/g)]).toHaveLength(4);
    expect(authRoutes).not.toMatch(/users\/me|auth\/me|password.?reset|refresh.?token/i);
  });

  it("keeps the profile mapper and DTO in users and users routes free of unrelated behavior", async () => {
    const profileSource = await readFile(path.resolve(backendRoot, "src/modules/users/user-profile.ts"), "utf8");
    const usersSources = await Promise.all(
      ["user-validation.ts", "users-controller.ts", "users-repository.ts", "users-service.ts", "routes.ts"].map(
        (filename) => readFile(path.resolve(backendRoot, "src/modules/users", filename), "utf8")
      )
    );
    const authSources = await Promise.all(
      [
        "auth-repository.ts",
        "registration-controller.ts",
        "registration-service.ts",
        "login-service.ts",
        "login-controller.ts"
      ].map((filename) => readFile(path.resolve(backendRoot, "src/modules/auth", filename), "utf8"))
    );
    const combinedUsers = usersSources.join("\n");

    expect(profileSource.match(/export interface UserProfileDto/g) ?? []).toHaveLength(1);
    expect(profileSource.match(/export function mapUserProfileToDto/g) ?? []).toHaveLength(1);
    expect(profileSource.match(/export function mapUserProfileRow/g) ?? []).toHaveLength(1);
    expect(authSources.join("\n")).not.toMatch(/modules\/auth\/user-profile|export interface UserProfileDto/);
    expect(combinedUsers).not.toMatch(/password_hash|passwordHash|jwt|cookie|listing|moderation|response\.json/);
    expect(usersSources[1]).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE|pool\.query|SqlExecutor)\b/);
    expect(usersSources[2]).not.toMatch(/from "express"|response\.json|sendObject/);
    expect(usersSources[4]).not.toMatch(/createRoleMiddleware|createOptionalAuthenticationMiddleware|rateLimit/i);
  });

  it("preserves frozen schema, dependencies, global composition, and adjacent task boundaries", async () => {
    const migrations = (await readdir(path.resolve(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    const backendPackage = JSON.parse(await readFile(path.resolve(backendRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const appSource = await readFile(path.resolve(backendRoot, "src/app.ts"), "utf8");

    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(migrations.some((filename) => filename.startsWith("0013"))).toBe(false);
    expect(backendPackage.dependencies).toStrictEqual({
      bcrypt: "6.0.0",
      cors: "2.8.5",
      dotenv: "16.5.0",
      express: "5.1.0",
      jose: "6.2.6",
      pg: "8.16.0"
    });
    expect(gitDiff("backend/package-lock.json", "package-lock.json")).toBe("");
    expect(gitDiff("backend/src/app.ts", "backend/src/config/env.ts", ".env.example")).toBe("");
    expect(gitDiff("backend/migrations", "frontend", "docs", "AGENTS.md")).toBe("");
    expect(appSource).toContain("app.use(express.json({ strict: false }));");
    expect(appSource.match(/app\.use\(express\.json/g)).toHaveLength(1);
  });

  it("keeps current-user authentication route-scoped and health exact", async () => {
    const serverSource = await readFile(path.resolve(backendRoot, "src/server.ts"), "utf8");
    const app = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: silentLogger,
      checkDatabaseConnection: async () => undefined
    });

    expect(serverSource).toContain("registerAuthRoutes");
    expect(serverSource).toContain("registerUsersRoutes");
    expect(serverSource).toContain("createProtectedAuthenticationMiddleware");
    expect(serverSource).not.toMatch(/app\.use\([^)]*authentication|createRoleMiddleware/);
    await request(app).get("/api/health").expect(200, { status: "ok", database: "connected" });
    await request(app).get("/api/v1/users/me").expect(404);
    await request(app).post("/api/v1/auth/login").set("Origin", "http://localhost:3000").send({}).expect(404);
  });

  it("leaves RM-014/RM-016 auth primitives and shared authentication middleware unchanged", async () => {
    expect(
      gitDiff(
        "backend/src/modules/auth/password.ts",
        "backend/src/modules/auth/session-token.ts",
        "backend/src/modules/auth/session-cookie.ts",
        "backend/src/shared/middleware/authentication.ts",
        "backend/src/shared/types/authentication.ts"
      )
    ).toBe("");
  });
});
