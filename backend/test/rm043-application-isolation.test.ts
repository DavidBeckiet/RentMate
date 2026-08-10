import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const backendRoot = process.cwd();
const repositoryRoot = path.resolve(backendRoot, "..");
const sourceRoot = path.join(backendRoot, "src");
const usersRoot = path.join(sourceRoot, "modules", "users");

function gitDiff(...paths: string[]): string {
  return execFileSync("git", ["diff", "--name-only", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
}

describe("RM-043 application isolation", () => {
  it("keeps four business modules, no admin module, and exactly ten users production files", async () => {
    expect((await readdir(path.join(sourceRoot, "modules"))).sort()).toStrictEqual([
      "auth",
      "favorites",
      "listings",
      "users"
    ]);
    await expect(readdir(path.join(sourceRoot, "modules", "admin"))).rejects.toThrow();
    expect((await readdir(usersRoot)).sort()).toStrictEqual([
      "admin-user-controller.ts",
      "admin-user-repository.ts",
      "admin-user-service.ts",
      "admin-user-validation.ts",
      "routes.ts",
      "user-profile.ts",
      "user-validation.ts",
      "users-controller.ts",
      "users-repository.ts",
      "users-service.ts"
    ]);
  });

  it("registers exactly 31 versioned routes and both RM-043 routes once", async () => {
    const sources = await Promise.all(
      ["auth", "favorites", "listings", "users"].map((module) =>
        readFile(path.join(sourceRoot, "modules", module, "routes.ts"), "utf8")
      )
    );
    const pattern = /router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
    const all = sources.flatMap((source) => [...source.matchAll(pattern)].map((match) => [match[1], match[2]]));
    const users = [...sources[3]!.matchAll(pattern)].map((match) => [match[1], match[2]]);
    expect(all).toHaveLength(31);
    expect(users).toHaveLength(4);
    expect(users.filter((route) => route[1] === "/admin/users")).toStrictEqual([["get", "/admin/users"]]);
    expect(users.filter((route) => route[1] === "/admin/users/:userId/activation")).toStrictEqual([
      ["patch", "/admin/users/:userId/activation"]
    ]);
    expect(all.filter(([, route]) => route?.startsWith("/admin/users"))).toHaveLength(2);
  });

  it("keeps admin-user SQL narrow, parameterized, users-only, and password-free", async () => {
    const repository = await readFile(path.join(usersRoot, "admin-user-repository.ts"), "utf8");
    const service = await readFile(path.join(usersRoot, "admin-user-service.ts"), "utf8");
    const combined = `${repository}\n${service}`;
    expect(repository).toContain("FOR UPDATE");
    expect(repository).toContain("is_active IS DISTINCT FROM $2");
    expect(repository).not.toMatch(/password_hash|SELECT \*|COUNT\s*\(/i);
    expect(combined).not.toMatch(
      /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:listings|moderation_history|favorites|listing_images|listing_amenities)\b/i
    );
    expect(combined).not.toMatch(/Cloudinary|Nominatim|queue|worker|outbox|session.?table|blacklist/i);
  });

  it("adds no schema, dependency, lockfile, frontend, provider, frozen-document, or protected production change", async () => {
    expect((await readdir(path.join(backendRoot, "migrations"))).filter((file) => file.endsWith(".sql"))).toHaveLength(
      12
    );
    expect((await readdir(path.join(sourceRoot, "integrations"))).sort()).toStrictEqual([
      "cloudinary.client.ts",
      "nominatim.client.ts"
    ]);
    expect(
      gitDiff(
        "backend/src/server.ts",
        "backend/src/app.ts",
        "backend/migrations",
        "backend/src/modules/listings",
        "backend/src/modules/favorites",
        "backend/src/modules/auth",
        "backend/src/integrations",
        "frontend",
        "docs",
        "AGENTS.md",
        ".env.example",
        "backend/package-lock.json",
        "package-lock.json"
      )
    ).toBe("");
  });
});
