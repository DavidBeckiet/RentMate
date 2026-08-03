import dotenv from "dotenv";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { closeDatabasePool } from "../src/db/pool.js";
import { createSqlExecutor } from "../src/db/sql-executor.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 1 });
const migrationDirectory = path.resolve(process.cwd(), "migrations");

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

async function cleanFrozenSchema(): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS moderation_history");
  await pool.query("DROP TABLE IF EXISTS favorites");
  await pool.query("DROP TABLE IF EXISTS listing_amenities");
  await pool.query("DROP TABLE IF EXISTS listing_images");
  await pool.query("DROP TABLE IF EXISTS listings");
  await pool.query("DROP TABLE IF EXISTS amenities");
  await pool.query("DROP TABLE IF EXISTS property_types");
  await pool.query("DROP TABLE IF EXISTS users");
  await pool.query("DROP TYPE IF EXISTS listing_status");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

async function makeApp() {
  return createBackendApp({
    frontendOrigin: "http://localhost:3000",
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: createSqlExecutor(pool),
    jwtSecret: "rm019-database-test-only-secret-not-for-production",
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => 1_900_000_000,
    authRateLimitClock: () => 0
  });
}

async function unrelatedTableCounts(): Promise<Record<string, number>> {
  const tables = ["users", "listings", "listing_images", "listing_amenities", "favorites", "moderation_history"];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const result = await pool.query<{ count: number }>({
      text: `SELECT count(*)::integer AS count FROM ${table}`,
      values: []
    });
    counts[table] = result.rows[0]?.count ?? 0;
  }
  return counts;
}

function expectExactItems(items: unknown[]): void {
  for (const item of items) {
    expect(Object.keys(item as object)).toStrictEqual(["code", "label"]);
  }
}

function expectLabelCodeOrder(items: Array<{ code: string; label: string }>): void {
  const sorted = [...items].sort(
    (left, right) => left.label.localeCompare(right.label) || left.code.localeCompare(right.code)
  );
  expect(items).toStrictEqual(sorted);
}

beforeAll(async () => {
  await cleanFrozenSchema();
  const migrations = await discoverMigrations(migrationDirectory);
  await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));
});

beforeEach(async () => {
  await pool.query({ text: "UPDATE property_types SET is_active = true", values: [] });
  await pool.query({ text: "UPDATE amenities SET is_active = true", values: [] });
});

afterAll(async () => {
  await cleanFrozenSchema();
  await closeDatabasePool(pool);
});

describe("RM-019 PostgreSQL lookup acceptance", () => {
  it("returns seeded active property types and amenities as exact label/code-ordered DTOs", async () => {
    const app = await makeApp();
    const propertyTypes = await request(app).get("/api/v1/lookups/property-types").expect(200);
    const amenities = await request(app).get("/api/v1/lookups/amenities").expect(200);

    expect(propertyTypes.body.data).toStrictEqual([
      { code: "APARTMENT", label: "Apartment" },
      { code: "DORMITORY", label: "Dormitory" },
      { code: "HOUSE", label: "House" },
      { code: "ROOM", label: "Room" },
      { code: "STUDIO", label: "Studio" }
    ]);
    expect(amenities.body.data).toHaveLength(12);
    expectExactItems(propertyTypes.body.data);
    expectExactItems(amenities.body.data);
    expectLabelCodeOrder(propertyTypes.body.data);
    expectLabelCodeOrder(amenities.body.data);
  });

  it("omits retired values while preserving their stored rows", async () => {
    try {
      await pool.query({ text: "UPDATE property_types SET is_active = false WHERE code = $1", values: ["STUDIO"] });
      await pool.query({ text: "UPDATE amenities SET is_active = false WHERE code = $1", values: ["WIFI"] });
      const app = await makeApp();
      const propertyTypes = await request(app).get("/api/v1/lookups/property-types").expect(200);
      const amenities = await request(app).get("/api/v1/lookups/amenities").expect(200);

      expect(propertyTypes.body.data).not.toContainEqual({ code: "STUDIO", label: "Studio" });
      expect(amenities.body.data).not.toContainEqual({ code: "WIFI", label: "Wi-Fi" });
      const retired = await pool.query<{ table_name: string; code: string; is_active: boolean }>({
        text: `
          SELECT 'property_types' AS table_name, code, is_active FROM property_types WHERE code = $1
          UNION ALL
          SELECT 'amenities' AS table_name, code, is_active FROM amenities WHERE code = $2
          ORDER BY table_name
        `,
        values: ["STUDIO", "WIFI"]
      });
      expect(retired.rows).toStrictEqual([
        { table_name: "amenities", code: "WIFI", is_active: false },
        { table_name: "property_types", code: "STUDIO", is_active: false }
      ]);
    } finally {
      await pool.query({ text: "UPDATE property_types SET is_active = true WHERE code = $1", values: ["STUDIO"] });
      await pool.query({ text: "UPDATE amenities SET is_active = true WHERE code = $1", values: ["WIFI"] });
    }
  });

  it("returns empty arrays when all values are retired without mutating unrelated tables", async () => {
    const before = await unrelatedTableCounts();
    try {
      await pool.query({ text: "UPDATE property_types SET is_active = false", values: [] });
      await pool.query({ text: "UPDATE amenities SET is_active = false", values: [] });
      const app = await makeApp();

      await request(app).get("/api/v1/lookups/property-types").expect(200, { data: [] });
      await request(app).get("/api/v1/lookups/amenities").expect(200, { data: [] });
      expect(await unrelatedTableCounts()).toStrictEqual(before);
    } finally {
      await pool.query({ text: "UPDATE property_types SET is_active = true", values: [] });
      await pool.query({ text: "UPDATE amenities SET is_active = true", values: [] });
    }
    expect(await unrelatedTableCounts()).toStrictEqual(before);
  });
});
