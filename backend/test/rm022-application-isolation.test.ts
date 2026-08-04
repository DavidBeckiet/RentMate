import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const listingsRoot = path.resolve(backendRoot, "src/modules/listings");

function git(...arguments_: string[]): string {
  return execFileSync("git", arguments_, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

describe("RM-022 application isolation", () => {
  it("keeps the exact RM-021 production listings inventory and Phase 4 routes", async () => {
    expect((await readdir(listingsRoot)).sort()).toStrictEqual([
      "listing-create-controller.ts",
      "listing-create-repository.ts",
      "listing-create-service.ts",
      "listing-create-validation.ts",
      "lookup-controller.ts",
      "lookup-mapper.ts",
      "lookup-repository.ts",
      "owner-image-mapper.ts",
      "owner-listing-mapper.ts",
      "owner-listing-read-controller.ts",
      "owner-listing-read-repository.ts",
      "owner-listing-read-service.ts",
      "owner-listing-read-validation.ts",
      "owner-listing-summary-mapper.ts",
      "routes.ts"
    ]);

    const routes = await readFile(path.join(listingsRoot, "routes.ts"), "utf8");
    const registrations = [...routes.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)].map((match) => [
      match[1],
      match[2]
    ]);
    expect(registrations).toStrictEqual([
      ["get", "/lookups/property-types"],
      ["get", "/lookups/amenities"],
      ["post", "/landlord/listings"],
      ["get", "/landlord/listings"],
      ["get", "/landlord/listings/:listingId"]
    ]);
    expect(routes).not.toMatch(
      /router\.(?:patch|put|delete)|submit|deactivate|reactivate|images|geocod|favorite|admin|"\/listings"/i
    );
  });

  it("adds no production, migration, dependency, lockfile, frontend, or frozen-document change", async () => {
    expect(
      git(
        "diff",
        "--name-only",
        "--",
        "backend/src",
        "backend/migrations",
        "backend/package-lock.json",
        "package-lock.json",
        "frontend",
        "docs",
        "AGENTS.md",
        ".env.example"
      )
    ).toBe("");
    expect(
      git(
        "diff",
        "--name-only",
        "--",
        "backend/test/rm009-*",
        "backend/test/rm010-*",
        "backend/test/rm011-*",
        "backend/test/rm012-*",
        "backend/test/rm013-*",
        "backend/test/rm014-*",
        "backend/test/rm015-*",
        "backend/test/rm016-*",
        "backend/test/rm017-*",
        "backend/test/rm018-*",
        "backend/test/rm019-*",
        "backend/test/rm020-*",
        "backend/test/rm021-*"
      )
    ).toBe("");

    const migrations = (await readdir(path.resolve(backendRoot, "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    expect(migrations).toHaveLength(12);
    expect(migrations.at(-1)).toBe("0012_create_explicit_indexes.sql");
    expect(migrations.some((filename) => filename.startsWith("0013"))).toBe(false);

    const packageJson = JSON.parse(await readFile(path.resolve(backendRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies).toStrictEqual({
      bcrypt: "6.0.0",
      cors: "2.8.5",
      dotenv: "16.5.0",
      express: "5.1.0",
      jose: "6.2.6",
      pg: "8.16.0"
    });
  });

  it("contains only the eight expected RM-022 paths in the working-tree diff", () => {
    const changed = execFileSync("git", ["status", "--short", "--untracked-files=all"], {
      cwd: repositoryRoot,
      encoding: "utf8"
    })
      .trimEnd()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => ({ status: line.slice(0, 2), file: line.slice(3).replaceAll("\\", "/") }))
      .sort((left, right) => left.file.localeCompare(right.file));

    expect(changed).toStrictEqual(
      [
        { status: " M", file: "backend/package.json" },
        { status: "??", file: "backend/test/helpers/listings-phase4-fixture.ts" },
        { status: "??", file: "backend/test/rm022-application-isolation.test.ts" },
        { status: "??", file: "backend/test/rm022-phase4-contract.integration.test.ts" },
        { status: "??", file: "backend/test/rm022-phase4.database.integration.test.ts" },
        { status: " M", file: "backend/vitest.config.mts" },
        { status: " M", file: "backend/vitest.database.config.mts" },
        { status: " M", file: "package.json" }
      ].sort((left, right) => left.file.localeCompare(right.file))
    );
    expect(git("diff", "--cached", "--name-status")).toBe("");
  });

  it("keeps production free of RM-023 behavior and generic frameworks", async () => {
    const sources = await Promise.all(
      (await readdir(listingsRoot)).map((filename) => readFile(path.join(listingsRoot, filename), "utf8"))
    );
    const combined = sources.join("\n");
    expect(combined).not.toMatch(
      /BaseRepository|GenericRepository|Container|Decorator|module.?registry|route.?discovery|auto.?discover/i
    );
    expect(combined).not.toMatch(/cloudinary\.client|nominatim\.client|significant.?edit|amenity.?replacement/i);
  });
});
