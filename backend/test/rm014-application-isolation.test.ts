import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { validatePasswordRepresentation } from "../src/shared/validation/normalization.js";
import { sessionCookieName } from "../src/shared/types/authentication.js";
import type { Logger } from "../src/shared/logging/logger.js";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function appDependencies() {
  return {
    frontendOrigin: "http://localhost:3000",
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined
  };
}

describe("RM-014 application isolation", () => {
  it("introduces only the three bounded auth primitive sources", async () => {
    const moduleDirectories = await readdir(path.resolve(process.cwd(), "src/modules"));
    const authFiles = (await readdir(path.resolve(process.cwd(), "src/modules/auth"))).sort();

    expect(moduleDirectories).toStrictEqual(["auth"]);
    expect(authFiles).toStrictEqual(["password.ts", "session-cookie.ts", "session-token.ts"]);
    expect(authFiles).not.toEqual(
      expect.arrayContaining(["controller.ts", "repository.ts", "service.ts", "routes.ts"])
    );
  });

  it("adds no endpoint or production app/server wiring and preserves health", async () => {
    const app = createApp(appDependencies());
    const unavailable = createApp({
      ...appDependencies(),
      checkDatabaseConnection: async () => {
        throw new Error("controlled unavailable");
      }
    });

    await request(app).get("/api/health").expect(200, { status: "ok", database: "connected" });
    await request(unavailable).get("/api/health").expect(503, { status: "error", database: "unavailable" });
    await request(app).post("/api/v1/auth/register/tenant").set("Origin", "http://localhost:3000").send({}).expect(404);
    await request(app).post("/api/v1/auth/login").set("Origin", "http://localhost:3000").send({}).expect(404);
    await request(app).post("/api/v1/auth/logout").set("Origin", "http://localhost:3000").expect(404);

    const appSource = await readFile(path.resolve(process.cwd(), "src/app.ts"), "utf8");
    const serverSource = await readFile(path.resolve(process.cwd(), "src/server.ts"), "utf8");
    expect(`${appSource}\n${serverSource}`).not.toMatch(/create(?:Password|SessionToken|SessionCookie)Service|jose/);
  });

  it("adds no SQL, repository, migration, refresh/session storage, or adjacent auth behavior", async () => {
    const authSources = await Promise.all(
      ["password.ts", "session-cookie.ts", "session-token.ts"].map((filename) =>
        readFile(path.resolve(process.cwd(), "src/modules/auth", filename), "utf8")
      )
    );
    const combined = authSources.join("\n");
    const migrations = (await readdir(path.resolve(process.cwd(), "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();

    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(migrations).not.toContain("0013_create_sessions.sql");
    expect(combined).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE|SqlExecutor|Repository)\b/);
    expect(combined).not.toMatch(/refresh.?token|password.?reset|register|login|logout|auto.?login/i);
    expect(combined).not.toMatch(/\.domain\b|domain\s*:/i);
    expect(combined).not.toMatch(/console\.|logger\.|response\.json/);
  });

  it("adds only jose to backend runtime dependencies", async () => {
    const backendPackage = JSON.parse(await readFile(path.resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const rootPackage = JSON.parse(await readFile(path.resolve(process.cwd(), "../package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const frontendPackage = JSON.parse(
      await readFile(path.resolve(process.cwd(), "../frontend/package.json"), "utf8")
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(backendPackage.dependencies).toStrictEqual({
      bcrypt: "6.0.0",
      cors: "2.8.5",
      dotenv: "16.5.0",
      express: "5.1.0",
      jose: "6.2.6",
      pg: "8.16.0"
    });
    expect({ ...rootPackage.dependencies, ...rootPackage.devDependencies }).not.toHaveProperty("jose");
    expect({ ...frontendPackage.dependencies, ...frontendPackage.devDependencies }).not.toHaveProperty("jose");
    expect(backendPackage.dependencies).not.toHaveProperty("jsonwebtoken");
  });

  it("preserves RM-010 password validation and the RM-012 shared cookie boundary", () => {
    expect(sessionCookieName).toBe("rentmate_session");
    expect(validatePasswordRepresentation("  PassWord  ")).toBe("  PassWord  ");
    expect(validatePasswordRepresentation("😀".repeat(18))).toBe("😀".repeat(18));
    expect(() => validatePasswordRepresentation("short")).toThrow();
    expect(() => validatePasswordRepresentation("😀".repeat(19))).toThrow();
  });

  it("leaves controlled admin provisioning independent from the product auth module", async () => {
    const provisioningSource = await readFile(
      path.resolve(process.cwd(), "src/db/admin-provisioning/provision-admin.ts"),
      "utf8"
    );

    expect(provisioningSource).toContain('from "bcrypt"');
    expect(provisioningSource).not.toMatch(/modules\/auth|createPasswordService/);
  });
});
