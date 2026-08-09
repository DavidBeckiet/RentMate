import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const favoritesRoot = path.join(sourceRoot, "modules", "favorites");

function gitDiff(...paths: string[]): string {
  return execFileSync("git", ["diff", "--name-only", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
}

describe("RM-040 application isolation", () => {
  it("preserves the four business modules and five RM-039 favorite production files", async () => {
    expect((await readdir(path.join(sourceRoot, "modules"))).sort()).toStrictEqual([
      "auth",
      "favorites",
      "listings",
      "users"
    ]);
    expect((await readdir(favoritesRoot)).sort()).toStrictEqual([
      "favorite-controller.ts",
      "favorite-repository.ts",
      "favorite-service.ts",
      "favorite-validation.ts",
      "routes.ts"
    ]);
  });

  it("preserves exactly 25 routes and only V1-23, V1-24, and V1-25 for favorites", async () => {
    const sources = await Promise.all(
      ["auth", "favorites", "listings", "users"].map((module) =>
        readFile(path.join(sourceRoot, "modules", module, "routes.ts"), "utf8")
      )
    );
    const routePattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const routes = sources.flatMap((source) => [...source.matchAll(routePattern)].map((match) => [match[1], match[2]]));
    expect(routes).toHaveLength(25);
    expect(routes.filter(([, route]) => route?.includes("favorites"))).toStrictEqual([
      ["get", "/favorites"],
      ["put", "/favorites/:listingId"],
      ["delete", "/favorites/:listingId"]
    ]);
    expect(routes.filter(([method, route]) => method === "post" && route?.includes("favorites"))).toHaveLength(0);
    expect(routes.filter(([, route]) => route?.startsWith("/admin"))).toHaveLength(0);
  });

  it("proves the frozen SQL shapes without production instrumentation", async () => {
    const repository = await readFile(path.join(favoritesRoot, "favorite-repository.ts"), "utf8");
    expect(repository).toMatch(/f\.tenant_id = \$1[\s\S]*l\.status = 'APPROVED'[\s\S]*landlord\.is_active = true/);
    expect(repository).toMatch(/ORDER BY f\.created_at DESC, f\.listing_id DESC/);
    expect(repository).toMatch(/LIMIT \$2[\s\S]*OFFSET \$3/);
    expect(repository).toMatch(/ORDER BY display_order ASC, id ASC/);
    expect(repository).toMatch(/ORDER BY a\.label ASC, a\.code ASC/);
    expect(repository).toMatch(/WITH visible_target AS MATERIALIZED[\s\S]*INSERT INTO favorites/);
    expect(repository).toMatch(/ON CONFLICT \(tenant_id, listing_id\)[\s\S]*DO NOTHING/);
    expect(repository).toMatch(/DELETE FROM favorites[\s\S]*tenant_id = \$1[\s\S]*listing_id = \$2/);
    expect(repository).not.toMatch(
      /COUNT\s*\(|address_text|landlord\.email|phone_e164|moderation|cloudinary_public_id|password_hash|DO UPDATE|FOR\s+UPDATE/i
    );
    expect(repository).not.toMatch(/CountingExecutor|RM-040|analytics|notification|queue|worker|outbox/i);
  });

  it("adds no production, schema, dependency, lockfile, frontend, provider, or frozen-document diff", async () => {
    expect((await readdir(path.join(backendRoot, "migrations"))).filter((file) => file.endsWith(".sql"))).toHaveLength(
      12
    );
    expect(
      gitDiff(
        "backend/src",
        "backend/migrations",
        "frontend",
        "docs",
        "AGENTS.md",
        ".env.example",
        "backend/package-lock.json",
        "package-lock.json"
      )
    ).toBe("");
  });

  it("contains exactly four RM-040 tests and routes database suites through serial Vitest", async () => {
    expect(
      (await readdir(path.join(backendRoot, "test"))).filter((file) => file.startsWith("rm040-")).sort()
    ).toStrictEqual([
      "rm040-application-isolation.test.ts",
      "rm040-favorite-concurrency.database.integration.test.ts",
      "rm040-favorite-http.integration.test.ts",
      "rm040-favorite.database.integration.test.ts"
    ]);
    const backendPackage = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const ordinary = await readFile(path.join(backendRoot, "vitest.config.mts"), "utf8");
    const database = await readFile(path.join(backendRoot, "vitest.database.config.mts"), "utf8");
    expect(backendPackage.scripts["test:rm040"]).toContain("rm040-favorite-http.integration.test.ts");
    expect(backendPackage.scripts["test:rm040"]).toContain("rm040-application-isolation.test.ts");
    expect(backendPackage.scripts["test:rm040:database"]).toContain("rm040-favorite.database.integration.test.ts");
    expect(backendPackage.scripts["test:rm040:database"]).toContain(
      "rm040-favorite-concurrency.database.integration.test.ts"
    );
    expect(rootPackage.scripts["test:rm040"]).toBe("npm --prefix backend run test:rm040");
    expect(rootPackage.scripts["test:rm040:database"]).toBe("npm --prefix backend run test:rm040:database");
    for (const file of [
      "rm040-favorite.database.integration.test.ts",
      "rm040-favorite-concurrency.database.integration.test.ts"
    ]) {
      expect(ordinary).toContain(`"test/${file}"`);
      expect(database).toContain(`"test/${file}"`);
    }
    expect(database).toContain("fileParallelism: false");
  });
});
