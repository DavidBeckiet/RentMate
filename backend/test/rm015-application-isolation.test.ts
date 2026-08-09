import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Logger } from "../src/shared/logging/logger.js";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

describe("RM-015 application isolation", () => {
  it("keeps auth files separate from the users-owned profile boundary", async () => {
    const moduleDirectories = (await readdir(path.resolve(process.cwd(), "src/modules"))).sort();
    const authFiles = (await readdir(path.resolve(process.cwd(), "src/modules/auth"))).sort();

    expect(moduleDirectories).toStrictEqual(["auth", "favorites", "listings", "users"]);
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
  });

  it("does not alter the global app composition seam or frozen environment", async () => {
    const appSource = await readFile(path.resolve(process.cwd(), "src/app.ts"), "utf8");
    const envSource = await readFile(path.resolve(process.cwd(), "src/config/env.ts"), "utf8");
    const serverSource = await readFile(path.resolve(process.cwd(), "src/server.ts"), "utf8");
    const compositionSource = await readFile(path.resolve(process.cwd(), "src/server-composition.ts"), "utf8");

    expect(appSource).not.toMatch(/modules\/auth|registerAuthRoutes|createRegistrationService/);
    expect(envSource).not.toMatch(/registration|rate.?limit/i);
    expect(compositionSource).toContain("registerAuthRoutes");
    expect(compositionSource).toContain("registerApiRoutes");
    expect(serverSource).not.toMatch(/express\.json|createOriginGuard|createCorsMiddleware/);
  });

  it("keeps the schema and repository boundaries frozen", async () => {
    const migrations = (await readdir(path.resolve(process.cwd(), "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    const registrationSources = await Promise.all(
      ["registration-validation.ts", "registration-service.ts", "registration-controller.ts"].map((filename) =>
        readFile(path.resolve(process.cwd(), "src/modules/auth", filename), "utf8")
      )
    );
    registrationSources.push(await readFile(path.resolve(process.cwd(), "src/modules/users/user-profile.ts"), "utf8"));
    const routeAndControllerSources = await Promise.all(
      ["routes.ts", "login-controller.ts"].map((filename) =>
        readFile(path.resolve(process.cwd(), "src/modules/auth", filename), "utf8")
      )
    );
    const combined = [...registrationSources, ...routeAndControllerSources].join("\n");

    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(migrations).not.toContain("0013_create_sessions.sql");
    expect(combined).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE|pool\.query|queryExactlyOne)\b/);
    expect(registrationSources.join("\n")).not.toMatch(/refresh.?token|password.?reset|login|logout|admin.?provision/i);
    expect(combined).not.toMatch(/console\.|logger\.|response\.json/);
    expect(combined).not.toMatch(/password_hash|jwtSecret|cookieValue|secretValue/);
  });

  it("keeps production app health available without manufacturing unrelated routes", async () => {
    const app = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: silentLogger,
      checkDatabaseConnection: async () => undefined
    });

    const response = await (await import("supertest")).default(app).get("/api/health").expect(200);
    expect(response.body).toStrictEqual({ status: "ok", database: "connected" });
  });
});
