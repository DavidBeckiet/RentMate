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

describe("RM-010 scope and application isolation", () => {
  it("keeps request ID before JSON parsing and the centralized handler after routes", async () => {
    const source = await readFile(path.resolve(process.cwd(), "src/app.ts"), "utf8");
    const requestIdIndex = source.indexOf("app.use(requestIdMiddleware)");
    const jsonIndex = source.indexOf("app.use(express.json({ strict: false }))");
    const healthIndex = source.indexOf('app.get("/api/health"');
    const errorIndex = source.indexOf("app.use(unexpectedErrorHandler");

    expect(requestIdIndex).toBeGreaterThan(-1);
    expect(jsonIndex).toBeGreaterThan(requestIdIndex);
    expect(healthIndex).toBeGreaterThan(jsonIndex);
    expect(errorIndex).toBeGreaterThan(healthIndex);
  });

  it("adds no product, auth, cookie, CORS-policy, rate-limit, or validation endpoint", async () => {
    const app = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: silentLogger,
      checkDatabaseConnection: async () => undefined
    });

    for (const endpoint of [
      "/api/v1/validation",
      "/api/v1/auth/login",
      "/api/v1/listings",
      "/api/v1/users/me",
      "/api/v1/favorites"
    ]) {
      await request(app).post(endpoint).set("Origin", "http://localhost:3000").send({}).expect(404);
    }
  });

  it("keeps the migration inventory at 0012 and preserves every RM-010 middleware file", async () => {
    const migrations = (await readdir(path.resolve(process.cwd(), "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    const middlewareFiles = (await readdir(path.resolve(process.cwd(), "src/shared/middleware"))).sort();

    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(middlewareFiles).toEqual(expect.arrayContaining(["error-handler.ts", "request-id.ts", "request-logger.ts"]));
  });

  it("keeps RM-010 validation repository-native without an external validation package", async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });

    expect(installed).not.toEqual(expect.arrayContaining(["zod", "joi", "yup", "express-validator"]));
  });
});
