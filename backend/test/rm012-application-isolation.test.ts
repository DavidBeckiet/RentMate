import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Logger } from "../src/shared/logging/logger.js";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

describe("RM-012 scope and application isolation", () => {
  it("keeps health public and adds no production route", async () => {
    const healthy = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: silentLogger,
      checkDatabaseConnection: async () => undefined
    });
    const unavailable = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: silentLogger,
      checkDatabaseConnection: async () => {
        throw new Error("controlled unavailable");
      }
    });

    await request(healthy).get("/api/health").expect(200, { status: "ok", database: "connected" });
    await request(unavailable).get("/api/health").expect(503, { status: "error", database: "unavailable" });
    await request(healthy).get("/api/v1/users/me").expect(404);
    await request(healthy).post("/api/v1/auth/login").set("Origin", "http://localhost:3000").send({}).expect(404);
  });

  it("does not mount authentication, role, or rate limiting globally", async () => {
    const source = await readFile(path.resolve(process.cwd(), "src/app.ts"), "utf8");

    expect(source).not.toMatch(/createProtectedAuthentication|createOptionalAuthentication|createRoleMiddleware/);
    expect(source).not.toMatch(/createRateLimitMiddleware|InMemoryRateLimitStore/);
  });

  it("keeps migrations at 0012", async () => {
    const migrations = (await readdir(path.resolve(process.cwd(), "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
  });

  it("adds only the expected route-scoped shared middleware foundations", async () => {
    const middlewareFiles = await readdir(path.resolve(process.cwd(), "src/shared/middleware"));

    expect(middlewareFiles).toEqual(expect.arrayContaining(["authentication.ts", "role.ts", "rate-limit.ts"]));
  });

  it("adds no external rate-limit dependency", async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = { ...packageJson.dependencies, ...packageJson.devDependencies };

    expect(installed["express-rate-limit"]).toBeUndefined();
    expect(installed["rate-limiter-flexible"]).toBeUndefined();
  });

  it("keeps the RM-012 implementation free of concrete JWT, password, cookie, repository, and DTO work", async () => {
    const sources = await Promise.all(
      [
        "src/shared/types/authentication.ts",
        "src/shared/middleware/authentication.ts",
        "src/shared/middleware/role.ts",
        "src/shared/middleware/rate-limit.ts"
      ].map((filename) => readFile(path.resolve(process.cwd(), filename), "utf8"))
    );
    const combined = sources.join("\n");

    expect(combined).not.toMatch(/\b(?:jsonwebtoken|jose|bcrypt|jwtSecret|passwordHash|setCookie|clearCookie)\b/);
    expect(combined).not.toMatch(/\b(?:SqlExecutor|queryOptional|pool\.query|withTransaction)\b/);
    expect(combined).not.toMatch(/addressText|monthlyRent|landlordContact|dto/i);
  });
});
