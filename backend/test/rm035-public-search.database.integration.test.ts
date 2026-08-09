import dotenv from "dotenv";
import path from "node:path";
import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { closeDatabasePool } from "../src/db/pool.js";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 2 });
const realExecutor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const privateAddress = "RM035_PRIVATE_ADDRESS_SENTINEL";
const privateProvider = "rm035-private-provider-sentinel";
const privateEmail = "rm035-private-email-sentinel@example.com";
const privatePhone = "+84919999999";
const privatePassword = "RM035_PRIVATE_PASSWORD_HASH_SENTINEL";

const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

class CountingExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return realExecutor.query<Row>(query);
  }
}

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

async function resetRows(): Promise<void> {
  await pool.query("DELETE FROM moderation_history");
  await pool.query("DELETE FROM favorites");
  await pool.query("DELETE FROM listings");
  await pool.query("DELETE FROM users");
  await pool.query("UPDATE property_types SET is_active = true");
  await pool.query("UPDATE amenities SET is_active = true");
}

async function user(sequence: number, active = true, role: "LANDLORD" | "ADMIN" = "LANDLORD"): Promise<number> {
  const result = await pool.query<{ id: number }>({
    text: `INSERT INTO users (role, email, phone_e164, password_hash, is_active)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    values: [
      role,
      sequence === 1 ? privateEmail : `rm035-${sequence}@example.com`,
      role === "LANDLORD" ? (sequence === 1 ? privatePhone : `+8491${String(sequence).padStart(8, "0")}`) : null,
      sequence === 1 ? privatePassword : "test-only-non-authenticating-hash",
      active
    ]
  });
  return result.rows[0]!.id;
}

async function lookupId(table: "property_types" | "amenities", code: string): Promise<number> {
  const result = await pool.query<{ id: number }>({ text: `SELECT id FROM ${table} WHERE code = $1`, values: [code] });
  return result.rows[0]!.id;
}

interface ListingInput {
  readonly landlordId: number;
  readonly sequence: number;
  readonly status?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "INACTIVE" | "HIDDEN";
  readonly title?: string;
  readonly description?: string;
  readonly rent?: number;
  readonly area?: number;
  readonly address?: string;
  readonly areaName?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly propertyType?: string;
  readonly updatedAt?: Date;
  readonly imageOrders?: readonly number[];
  readonly amenities?: readonly string[];
}

async function listing(input: ListingInput): Promise<number> {
  const status = input.status ?? "APPROVED";
  const propertyTypeId = await lookupId("property_types", input.propertyType ?? "STUDIO");
  const result = await pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id
    `,
    values: [
      input.landlordId,
      propertyTypeId,
      status,
      input.title ?? `Listing ${input.sequence}`,
      input.description ?? `Description ${input.sequence}`,
      String(input.rent ?? 5_000_000 + input.sequence),
      String(input.area ?? 20 + input.sequence),
      input.address ?? `${input.sequence} Exact Street`,
      input.areaName ?? "District 1",
      input.latitude ?? 10.772341 + input.sequence / 100_000,
      input.longitude ?? 106.697912 + input.sequence / 100_000,
      input.updatedAt ?? new Date(Date.UTC(2026, 6, 1, 0, input.sequence, 0))
    ]
  });
  const id = result.rows[0]!.id;
  for (const order of input.imageOrders ?? [1]) {
    await pool.query({
      text: `INSERT INTO listing_images
        (listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order, alt_text)
        VALUES ($1,$2,$3,'webp',800,600,1000,$4,$5)`,
      values: [
        id,
        input.sequence === 1 && order === 1 ? privateProvider : `rm035-private-provider-${input.sequence}-${order}`,
        `https://cdn.example.test/rm035-${input.sequence}-${order}.webp`,
        order,
        `Image ${input.sequence}-${order}`
      ]
    });
  }
  for (const code of input.amenities ?? []) {
    await pool.query({
      text: "INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2)",
      values: [id, await lookupId("amenities", code)]
    });
  }
  return id;
}

async function makeApp(executor: SqlExecutor = realExecutor) {
  return createBackendApp({
    frontendOrigin: "http://localhost:3000",
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: "rm035-database-test-only-secret-not-for-production",
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => 1_900_000_000,
    authRateLimitClock: () => 0
  });
}

beforeAll(async () => {
  await cleanFrozenSchema();
  await executeMigrationPlan(pool, createMigrationPlan("clean", await discoverMigrations(migrationDirectory)));
});

beforeEach(resetRows);

afterAll(async () => {
  await cleanFrozenSchema();
  await closeDatabasePool(pool);
});

describe("RM-035 PostgreSQL ordinary public search", () => {
  it("returns only APPROVED listings owned by active landlords and leaks no private sentinels", async () => {
    const active = await user(1);
    const inactive = await user(2, false);
    const visible = await listing({ landlordId: active, sequence: 1, address: privateAddress });
    await listing({ landlordId: inactive, sequence: 2 });
    for (const [index, status] of ["DRAFT", "PENDING", "REJECTED", "INACTIVE", "HIDDEN"].entries()) {
      await listing({ landlordId: active, sequence: index + 3, status: status as ListingInput["status"] });
    }
    const response = await request(await makeApp())
      .get("/api/v1/listings")
      .expect(200);
    expect(response.body.data.map((item: { id: number }) => item.id)).toStrictEqual([visible]);
    const serialized = JSON.stringify(response.body);
    for (const sentinel of [privateAddress, privateProvider, privateEmail, privatePhone, privatePassword]) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  it("searches q over title/area only with literal percent, underscore, and backslash semantics", async () => {
    const landlordId = await user(10);
    const titleId = await listing({ landlordId, sequence: 10, title: "Percent % Home", areaName: "Alpha" });
    const areaId = await listing({ landlordId, sequence: 11, title: "Ordinary", areaName: "Under_score \\ Ward" });
    await listing({
      landlordId,
      sequence: 12,
      title: "Other",
      description: "DESCRIPTION_ONLY",
      address: "ADDRESS_ONLY"
    });
    const app = await makeApp();
    expect(
      (await request(app).get("/api/v1/listings?q=percent").expect(200)).body.data.map((x: { id: number }) => x.id)
    ).toStrictEqual([titleId]);
    expect(
      (await request(app).get("/api/v1/listings?q=ward").expect(200)).body.data.map((x: { id: number }) => x.id)
    ).toStrictEqual([areaId]);
    expect((await request(app).get("/api/v1/listings?q=ADDRESS_ONLY").expect(200)).body.data).toStrictEqual([]);
    expect((await request(app).get("/api/v1/listings?q=DESCRIPTION_ONLY").expect(200)).body.data).toStrictEqual([]);
    expect(
      (await request(app).get("/api/v1/listings?q=%25").expect(200)).body.data.map((x: { id: number }) => x.id)
    ).toStrictEqual([titleId]);
    expect(
      (await request(app).get("/api/v1/listings?q=_").expect(200)).body.data.map((x: { id: number }) => x.id)
    ).toStrictEqual([areaId]);
    expect(
      (await request(app).get("/api/v1/listings?q=%5C").expect(200)).body.data.map((x: { id: number }) => x.id)
    ).toStrictEqual([areaId]);
  });

  it("combines ranges, property type, and ALL amenities while returning the full retired catalog projection", async () => {
    const landlordId = await user(20);
    const onlyWifi = await listing({ landlordId, sequence: 20, rent: 4_000_000, area: 20, amenities: ["WIFI"] });
    const both = await listing({ landlordId, sequence: 21, rent: 5_000_000, area: 25, amenities: ["WIFI", "PARKING"] });
    const extra = await listing({
      landlordId,
      sequence: 22,
      rent: 6_000_000,
      area: 30,
      amenities: ["WIFI", "PARKING", "ELEVATOR"]
    });
    await pool.query("UPDATE property_types SET is_active = false WHERE code = 'STUDIO'");
    await pool.query("UPDATE amenities SET is_active = false WHERE code = 'WIFI'");
    const response = await request(await makeApp())
      .get(
        "/api/v1/listings?minMonthlyRent=4500000&maxMonthlyRent=6500000&minRoomAreaSqm=24&maxRoomAreaSqm=31&propertyType=STUDIO&amenities=WIFI,PARKING&areaName=district"
      )
      .expect(200);
    expect(response.body.data.map((x: { id: number }) => x.id)).toStrictEqual([extra, both]);
    expect(response.body.data.some((x: { id: number }) => x.id === onlyWifi)).toBe(false);
    expect(response.body.data[0].propertyType).toStrictEqual({ code: "STUDIO", label: "Studio" });
    expect(response.body.data.find((x: { id: number }) => x.id === extra).amenities).toContainEqual({
      code: "ELEVATOR",
      label: "Elevator"
    });
  });

  it("uses exact deterministic ordinary sort tie breakers", async () => {
    const landlordId = await user(30);
    const time = new Date("2026-07-01T00:00:00.000Z");
    const first = await listing({ landlordId, sequence: 30, rent: 5_000_000, updatedAt: time });
    const second = await listing({ landlordId, sequence: 31, rent: 5_000_000, updatedAt: time });
    const app = await makeApp();
    expect(
      (await request(app).get("/api/v1/listings?sort=newest").expect(200)).body.data.map((x: { id: number }) => x.id)
    ).toStrictEqual([second, first]);
    expect(
      (await request(app).get("/api/v1/listings?sort=rent_asc").expect(200)).body.data.map((x: { id: number }) => x.id)
    ).toStrictEqual([first, second]);
    expect(
      (await request(app).get("/api/v1/listings?sort=rent_desc").expect(200)).body.data.map((x: { id: number }) => x.id)
    ).toStrictEqual([second, first]);
  });

  it("uses limit-plus-one pages with constant one-or-two query execution and no total", async () => {
    const landlordId = await user(40);
    await listing({ landlordId, sequence: 40, amenities: ["WIFI"] });
    await listing({ landlordId, sequence: 41, amenities: ["WIFI"] });
    await listing({ landlordId, sequence: 42, amenities: ["WIFI"] });
    const executor = new CountingExecutor();
    const app = await makeApp(executor);
    const first = await request(app).get("/api/v1/listings?pageSize=2").expect(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.pagination).toStrictEqual({ page: 1, pageSize: 2, hasNextPage: true });
    expect(first.body.pagination.total).toBeUndefined();
    expect(executor.queries).toHaveLength(1);
    executor.queries.length = 0;
    const second = await request(app).get("/api/v1/listings?page=2&pageSize=2&amenities=WIFI").expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.pagination.hasNextPage).toBe(false);
    expect(executor.queries).toHaveLength(2);
  });

  it("selects the smallest gapped cover slot and rounds positive and negative coordinates", async () => {
    const landlordId = await user(50);
    const id = await listing({
      landlordId,
      sequence: 50,
      latitude: -10.772549,
      longitude: 106.697912,
      imageOrders: [7, 2, 4]
    });
    const item = (
      await request(await makeApp())
        .get("/api/v1/listings")
        .expect(200)
    ).body.data[0];
    expect(item).toMatchObject({ id, latitude: -10.773, longitude: 106.698, coverImage: { displayOrder: 2 } });
    expect(JSON.stringify(item)).not.toContain("rm035-private-provider-50-2");
  });

  it("maps a selected visible row without a cover to a sanitized internal invariant error", async () => {
    const landlordId = await user(60);
    await listing({ landlordId, sequence: 60, imageOrders: [] });
    const response = await request(await makeApp())
      .get("/api/v1/listings")
      .expect(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/listing_images|secure_url|SQL|stack/i);
  });
});
