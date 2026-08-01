import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { sendObject } from "../src/shared/http/responses.js";
import type { Logger } from "../src/shared/logging/logger.js";

const frontendOrigin = "http://localhost:3000";
const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function appDependencies() {
  return {
    frontendOrigin,
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined
  };
}

describe("RM-013 application seam and isolation", () => {
  it("keeps the synthetic route absent by default and mounts a callback route only under /api/v1", async () => {
    const defaultApp = createApp(appDependencies());
    const handler = vi.fn((_incomingRequest, response) => sendObject(response, { seam: "test-only" }));
    const registerApiRoutes = vi.fn((router) => router.get("/synthetic-seam", handler));
    const registeredApp = createApp({ ...appDependencies(), registerApiRoutes });

    await request(defaultApp).get("/api/v1/synthetic-seam").expect(404);
    await request(registeredApp).get("/synthetic-seam").expect(404);
    await request(registeredApp)
      .get("/api/v1/synthetic-seam")
      .expect(200, { data: { seam: "test-only" } });

    expect(registerApiRoutes).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("preserves the exact public health responses", async () => {
    const healthy = createApp(appDependencies());
    const unavailable = createApp({
      ...appDependencies(),
      checkDatabaseConnection: async () => {
        throw new Error("controlled unavailable");
      }
    });

    await request(healthy).get("/api/health").expect(200, { status: "ok", database: "connected" });
    await request(unavailable).get("/api/health").expect(503, { status: "error", database: "unavailable" });
  });

  it("does not mount authentication, roles, or rate limiting globally", async () => {
    const app = createApp({
      ...appDependencies(),
      registerApiRoutes: (router) => {
        router.get("/unprotected-probe", (_incomingRequest, response) => sendObject(response, { public: true }));
      }
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .get("/api/v1/unprotected-probe")
        .expect(200, { data: { public: true } });
    }

    const source = await readFile(path.resolve(process.cwd(), "src/app.ts"), "utf8");
    expect(source).not.toMatch(/createProtectedAuthentication|createOptionalAuthentication|createRoleMiddleware/);
    expect(source).not.toMatch(/createRateLimitMiddleware|InMemoryRateLimitStore/);
  });

  it("keeps centralized errors after the versioned router", async () => {
    const app = createApp({
      ...appDependencies(),
      registerApiRoutes: (router) => {
        router.get("/unexpected", () => {
          throw new Error("private RM-013 route detail");
        });
      }
    });
    const response = await request(app).get("/api/v1/unexpected");

    expect(response.status).toBe(500);
    expect(response.body.error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected internal failure occurred."
    });
    expect(response.body.error.requestId).toMatch(/^req_[a-f0-9]{32}$/);
    expect(response.text).not.toContain("private RM-013 route detail");

    const source = await readFile(path.resolve(process.cwd(), "src/app.ts"), "utf8");
    const routerIndex = source.indexOf('app.use("/api/v1", apiRouter)');
    const errorIndex = source.indexOf("app.use(unexpectedErrorHandler");
    expect(routerIndex).toBeGreaterThan(-1);
    expect(errorIndex).toBeGreaterThan(routerIndex);
    expect(source.match(/app\.use\("\/api\/v1"/g)).toHaveLength(1);
  });

  it("keeps RM-013 sources free of SQL, migrations, and generic DTO frameworks", async () => {
    const migrations = (await readdir(path.resolve(process.cwd(), "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    const packageJson = JSON.parse(await readFile(path.resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const rm013ProductionSources = await Promise.all(
      ["src/app.ts", "src/db/repository-primitives.ts", "src/shared/mapping/api-values.ts"].map((filename) =>
        readFile(path.resolve(process.cwd(), filename), "utf8")
      )
    );
    const combined = rm013ProductionSources.join("\n");

    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(combined).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/);
    expect(combined).not.toMatch(/\b(?:jsonwebtoken|jose|jwtSecret|bcrypt|passwordHash|setCookie|clearCookie)\b/);
    expect(combined).not.toMatch(/\b(?:BaseController|BaseService|BaseRepository|Container|Decorator|Reflection)\b/);
    expect(combined).not.toMatch(/snakeToCamel|serializerRegistry|mapperRegistry|class-transformer|automapper/i);
    expect(installed["class-transformer"]).toBeUndefined();
    expect(installed.automapper).toBeUndefined();
    expect(installed.typia).toBeUndefined();
  });

  it("keeps normal server startup unaware of the optional test/future route callback", async () => {
    const serverSource = await readFile(path.resolve(process.cwd(), "src/server.ts"), "utf8");

    expect(serverSource).not.toContain("registerApiRoutes");
    expect(serverSource).not.toContain("synthetic");
  });
});
