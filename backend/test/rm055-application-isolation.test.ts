import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { productionSmokeEndpointInventory } from "../src/deployment/production-smoke.js";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const frontendRoot = path.join(repositoryRoot, "frontend");

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !["node_modules", ".next", "dist", "coverage"].includes(entry.name))
      .map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
      })
  );
  return nested.flat();
}

async function routeInventory(): Promise<string[]> {
  const modules = ["auth", "favorites", "listings", "users"] as const;
  const sources = await Promise.all(
    modules.map((module) => readFile(path.join(backendRoot, "src", "modules", module, "routes.ts"), "utf8"))
  );
  const pattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
  return sources.flatMap((source) => [...source.matchAll(pattern)].map((match) => `${match[1]}:${match[2]}`));
}

describe("RM-055 application isolation", () => {
  it("keeps deployment CLIs outside normal backend startup and request composition", async () => {
    const runtimeSources = await Promise.all(
      ["src/app.ts", "src/server.ts", "src/server-composition.ts"].map((file) =>
        readFile(path.join(backendRoot, file), "utf8")
      )
    );
    expect(runtimeSources.join("\n")).not.toMatch(
      /deployment\/(?:provider-check|production-smoke|validate-production)/
    );
    expect(await routeInventory()).toHaveLength(31);
  });

  it("adds no migration, schema object, or fifth business module", async () => {
    const migrationFiles = (await readdir(path.join(backendRoot, "migrations")))
      .filter((file) => /^\d{4}_.+\.sql$/.test(file))
      .sort();
    expect(migrationFiles).toHaveLength(12);
    expect(migrationFiles.at(-1)).toBe("0012_create_explicit_indexes.sql");
    const modules = (await readdir(path.join(backendRoot, "src", "modules"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(modules).toEqual(["auth", "favorites", "listings", "users"]);
  });

  it("adds no RM-055 frontend business page, component, feature, or API type", async () => {
    const protectedDirectories = ["app", "components", "features", "types"];
    const marked = (
      await Promise.all(protectedDirectories.map((directory) => filesUnder(path.join(frontendRoot, directory))))
    )
      .flat()
      .filter((file) => /rm055/i.test(path.basename(file)));
    expect(marked).toEqual([]);
  });

  it("keeps provider and production-smoke network commands explicit", async () => {
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(backendPackage.scripts["providers:check"]).toContain("provider-check.ts");
    expect(backendPackage.scripts["smoke:production"]).toContain("production-smoke.ts");
    for (const script of ["build", "start", "test", "test:rm055"]) {
      expect(backendPackage.scripts[script]).not.toMatch(/providers:check|smoke:production/);
    }
  });

  it("keeps default production smoke free of product-data mutation", () => {
    expect(productionSmokeEndpointInventory.every(({ method }) => method === "GET" || method === "POST")).toBe(true);
    expect(
      productionSmokeEndpointInventory
        .filter(({ method }) => method === "POST")
        .every(({ path }) => path === "/api/v1/auth/login" || path === "/api/v1/auth/logout")
    ).toBe(true);
    expect(productionSmokeEndpointInventory.map(({ path }) => path).join("\n")).not.toMatch(
      /register|submit|deactivate|reactivate|images|moderation-actions|activation/
    );
  });

  it("commits placeholders rather than production secrets and never logs session material", async () => {
    const template = await readFile(path.join(repositoryRoot, ".env.production.example"), "utf8");
    expect(template).not.toContain("TEST_DATABASE_URL=");
    expect(template).not.toContain("rentmate_dev_password");
    expect(template).not.toContain("rentmate_local_jwt_secret_not_for_production");
    expect(template).toContain("DB_PASSWORD=<");
    expect(template).toContain("JWT_SECRET=<");

    const smokeSource = await readFile(path.join(backendRoot, "src", "deployment", "production-smoke.ts"), "utf8");
    expect(smokeSource).not.toMatch(
      /(?:logger|console)\.(?:info|warn|error|log)\([^\n]*(?:cookie|password|jwt|token)/i
    );
    expect(smokeSource).not.toMatch(/JSON\.stringify\((?:configuration|process\.env)/);
  });
});
