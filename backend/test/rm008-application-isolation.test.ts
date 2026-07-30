import { readFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createLogger, type Logger } from "../src/shared/logging/logger.js";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

describe("RM-008 command isolation and sanitized logging", () => {
  it("keeps provisioning, verification, and bootstrap out of application and migration startup", async () => {
    const applicationSources = await Promise.all(
      ["src/app.ts", "src/server.ts"].map((filename) => readFile(path.resolve(process.cwd(), filename), "utf8"))
    );
    const migrationSources = await Promise.all(
      [
        "src/db/migrations/discovery.ts",
        "src/db/migrations/planning.ts",
        "src/db/migrations/execution.ts",
        "src/db/migrations/command.ts",
        "src/db/migrations/cli.ts"
      ].map((filename) => readFile(path.resolve(process.cwd(), filename), "utf8"))
    );
    const forbiddenImports = /\b(?:admin-provisioning|schema-verification|bootstrap-database)\b/;

    expect(applicationSources.join("\n")).not.toMatch(forbiddenImports);
    expect(migrationSources.join("\n")).not.toMatch(forbiddenImports);
  });

  it("registers no public admin registration or provisioning endpoint and preserves health behavior", async () => {
    const healthyApp = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: silentLogger,
      checkDatabaseConnection: async () => undefined
    });
    const unavailableApp = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: silentLogger,
      checkDatabaseConnection: async () => {
        throw new Error("unavailable");
      }
    });

    await request(healthyApp).get("/api/health").expect(200, { status: "ok", database: "connected" });
    await request(unavailableApp).get("/api/health").expect(503, {
      status: "error",
      database: "unavailable"
    });

    for (const endpoint of ["/api/v1/admin/provision", "/api/v1/admin/register", "/api/v1/auth/register/admin"]) {
      await request(healthyApp).post(endpoint).set("Origin", "http://localhost:3000").send({}).expect(404);
    }
  });

  it("filters password, hash, database URL, and connection-string contexts from structured output", () => {
    const plaintextPassword = "NeverLogThisPassword";
    const passwordHash = "$2b$12$NeverLogThisHashValue";
    const databaseUrl = "postgresql://user:secret@localhost:5432/rentmate_test";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    createLogger("debug").info("Sanitization verification", {
      outcome: "created",
      password: plaintextPassword,
      passwordHash,
      databaseUrl,
      connectionString: databaseUrl
    });

    expect(logSpy).toHaveBeenCalledOnce();
    const output = String(logSpy.mock.calls[0]?.[0]);
    expect(output).toContain('"outcome":"created"');
    expect(output).not.toContain(plaintextPassword);
    expect(output).not.toContain(passwordHash);
    expect(output).not.toContain(databaseUrl);
  });

  it("never passes the full environment object to command log calls", async () => {
    const commandSources = await Promise.all(
      ["src/db/admin-provisioning/cli.ts", "src/db/schema-verification/cli.ts", "src/db/bootstrap/cli.ts"].map(
        (filename) => readFile(path.resolve(process.cwd(), filename), "utf8")
      )
    );

    expect(commandSources.join("\n")).not.toMatch(/logger\.(?:debug|info|warn|error)\([^;]*process\.env/s);
  });
});
