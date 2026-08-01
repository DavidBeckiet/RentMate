import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Logger } from "../src/shared/logging/logger.js";

const configuredOrigin = "http://localhost:3000";
const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

describe("RM-011 scope and application isolation", () => {
  it("wires the exact security middleware order around the existing parser and routes", async () => {
    const source = await readFile(path.resolve(process.cwd(), "src/app.ts"), "utf8");
    const requestIdIndex = source.indexOf("app.use(requestIdMiddleware)");
    const loggerIndex = source.indexOf("app.use(requestLoggerMiddleware");
    const corsIndex = source.indexOf("app.use(createCorsMiddleware");
    const originIndex = source.indexOf("app.use(createOriginGuard");
    const cookieIndex = source.indexOf("app.use(cookieParserMiddleware)");
    const jsonIndex = source.indexOf("app.use(express.json())");
    const healthIndex = source.indexOf('app.get("/api/health"');
    const errorIndex = source.indexOf("app.use(unexpectedErrorHandler");

    expect(requestIdIndex).toBeGreaterThan(-1);
    expect(loggerIndex).toBeGreaterThan(requestIdIndex);
    expect(corsIndex).toBeGreaterThan(loggerIndex);
    expect(originIndex).toBeGreaterThan(corsIndex);
    expect(cookieIndex).toBeGreaterThan(originIndex);
    expect(jsonIndex).toBeGreaterThan(cookieIndex);
    expect(healthIndex).toBeGreaterThan(jsonIndex);
    expect(errorIndex).toBeGreaterThan(healthIndex);
  });

  it("adds no product or authentication endpoint", async () => {
    const app = createApp({
      frontendOrigin: configuredOrigin,
      logger: silentLogger,
      checkDatabaseConnection: async () => undefined
    });

    await request(app).get("/api/v1/listings").expect(404);
    await request(app).get("/api/v1/users/me").expect(404);
    await request(app).post("/api/v1/auth/login").set("Origin", configuredOrigin).send({}).expect(404);
    await request(app).post("/api/v1/rate-limit").set("Origin", configuredOrigin).send({}).expect(404);
  });

  it("keeps migrations at 0012 and preserves every RM-011 middleware file", async () => {
    const migrations = (await readdir(path.resolve(process.cwd(), "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    const middlewareFiles = (await readdir(path.resolve(process.cwd(), "src/shared/middleware"))).sort();

    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(middlewareFiles).toEqual(
      expect.arrayContaining([
        "cookie-parser.ts",
        "cors.ts",
        "error-handler.ts",
        "origin-guard.ts",
        "request-id.ts",
        "request-logger.ts"
      ])
    );
  });

  it("uses existing CORS support without adding cookie, JWT, auth, or rate-limit dependencies", async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = { ...packageJson.dependencies, ...packageJson.devDependencies };

    expect(installed.cors).toBe("2.8.5");
    expect(installed["@types/cors"]).toBe("2.8.17");
    expect(installed["cookie-parser"]).toBeUndefined();
    expect(installed["@types/cookie-parser"]).toBeUndefined();
    expect(installed.jsonwebtoken).toBeUndefined();
    expect(installed["express-rate-limit"]).toBeUndefined();
  });

  it("keeps RM-011 middleware free of authentication, database, cookie issuance, and rate limiting", async () => {
    const sources = await Promise.all(
      ["cookie-parser.ts", "cors.ts", "origin-guard.ts"].map((filename) =>
        readFile(path.resolve(process.cwd(), "src/shared/middleware", filename), "utf8")
      )
    );
    const combined = sources.join("\n");

    expect(combined).not.toMatch(/\b(?:jsonwebtoken|jwt\.verify|bcrypt|pool\.query|setCookie|clearCookie|rateLimit)\b/);
    expect(combined).not.toMatch(/request\.(?:user|auth|role|session)\s*=/);
  });
});
