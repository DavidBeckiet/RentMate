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

describe("RM-009 application and roadmap isolation", () => {
  it("preserves the health route and adds no shared or product HTTP endpoint", async () => {
    const app = createApp({
      frontendOrigin: "http://localhost:3000",
      logger: silentLogger,
      checkDatabaseConnection: async () => undefined
    });

    await request(app).get("/api/health").expect(200, {
      status: "ok",
      database: "connected"
    });
    await request(app).get("/api/v1/config").expect(404);
    await request(app).get("/api/v1/listings").expect(404);
    await request(app).post("/api/v1/auth/login").set("Origin", "http://localhost:3000").send({}).expect(404);
  });

  it("validates configuration before pool creation and before opening the listener", async () => {
    const source = await readFile(path.resolve(process.cwd(), "src/server.ts"), "utf8");
    const loadIndex = source.indexOf("loadEnvironment()");
    const poolIndex = source.indexOf("getRuntimePool(");
    const listenIndex = source.indexOf("await listen(");

    expect(loadIndex).toBeGreaterThan(-1);
    expect(poolIndex).toBeGreaterThan(loadIndex);
    expect(listenIndex).toBeGreaterThan(poolIndex);
  });

  it("keeps migrations, bootstrap, verification, and provisioning out of normal startup", async () => {
    const source = await readFile(path.resolve(process.cwd(), "src/server.ts"), "utf8");

    expect(source).not.toMatch(/\b(?:migrate|migration|bootstrap|provision|schema.?verification)\b/i);
  });

  it("adds no migration after 0012 and does not introduce later product repositories", async () => {
    const migrationFiles = (await readdir(path.resolve(process.cwd(), "migrations")))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();
    const sourceFiles = await recursivelyListFiles(path.resolve(process.cwd(), "src"));

    expect(migrationFiles).toHaveLength(12);
    expect(migrationFiles.at(-1)).toBe("0012_create_explicit_indexes.sql");
    const listingsFiles = sourceFiles
      .filter((filename) => /src[\\/]+modules[\\/]+listings[\\/]/.test(filename))
      .map((filename) => path.basename(filename))
      .sort();
    expect(listingsFiles).toStrictEqual([
      "current-moderation-reason-repository.ts",
      "current-moderation-reason.ts",
      "geocoding-controller.ts",
      "geocoding-service.ts",
      "geocoding-validation.ts",
      "listing-completeness.ts",
      "listing-create-controller.ts",
      "listing-create-repository.ts",
      "listing-create-service.ts",
      "listing-create-validation.ts",
      "listing-delete-cleanup.ts",
      "listing-delete-cloudinary-cleanup.ts",
      "listing-delete-controller.ts",
      "listing-delete-repository.ts",
      "listing-delete-service.ts",
      "listing-image-delete-controller.ts",
      "listing-image-delete-repository.ts",
      "listing-image-delete-service.ts",
      "listing-image-order-controller.ts",
      "listing-image-order-repository.ts",
      "listing-image-order-service.ts",
      "listing-image-order-validation.ts",
      "listing-image-upload-controller.ts",
      "listing-image-upload-multipart.ts",
      "listing-image-upload-repository.ts",
      "listing-image-upload-service.ts",
      "listing-image-upload-validation.ts",
      "listing-lifecycle-action-controller.ts",
      "listing-lifecycle-action-repository.ts",
      "listing-lifecycle-action-service.ts",
      "listing-lifecycle-policy.ts",
      "listing-submit-controller.ts",
      "listing-submit-repository.ts",
      "listing-submit-service.ts",
      "listing-update-controller.ts",
      "listing-update-repository.ts",
      "listing-update-service.ts",
      "listing-update-state.ts",
      "listing-update-validation.ts",
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
    expect(sourceFiles.some((filename) => /src[\\/]+modules[\\/]+favorites[\\/]/.test(filename))).toBe(false);
    expect(sourceFiles.some((filename) => /base-?repository/i.test(filename))).toBe(false);
  });

  it("does not add ORM or query-builder dependencies", async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installedNames = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    });

    expect(installedNames).not.toEqual(
      expect.arrayContaining(["typeorm", "sequelize", "prisma", "knex", "drizzle-orm"])
    );
  });
});

async function recursivelyListFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? recursivelyListFiles(fullPath) : [fullPath];
    })
  );

  return files.flat();
}
