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
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
const centerLat = 10.772341;
const centerLng = 106.697912;
const radiusKm = 0.1;
const privateAddress = "RM036_PRIVATE_ADDRESS";
const privateProvider = "rm036-private-provider";

class CountingExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];

  constructor(private readonly delegate: SqlExecutor) {}

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return this.delegate.query<Row>(query);
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
  await pool.query("DELETE FROM listing_amenities");
  await pool.query("DELETE FROM listing_images");
  await pool.query("DELETE FROM listings");
  await pool.query("DELETE FROM users");
  await pool.query("UPDATE property_types SET is_active = true");
  await pool.query("UPDATE amenities SET is_active = true");
}

async function user(sequence: number, active = true): Promise<number> {
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO users (role, email, phone_e164, password_hash, is_active)
           VALUES ('LANDLORD', $1, $2, 'rm036-test-only-hash', $3)
           RETURNING id`,
    values: [`rm036-${sequence}@example.com`, `+8491${String(sequence).padStart(8, "0")}`, active]
  });
  return response.rows[0]!.id;
}

async function lookupId(table: "property_types" | "amenities", code: string): Promise<number> {
  const response = await pool.query<{ id: number }>({
    text: `SELECT id FROM ${table} WHERE code = $1`,
    values: [code]
  });
  return response.rows[0]!.id;
}

interface ListingInput {
  readonly landlordId: number;
  readonly sequence: number;
  readonly status?: "DRAFT" | "PENDING" | "APPROVED";
  readonly rent?: number;
  readonly area?: number;
  readonly areaName?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly amenities?: readonly string[];
}

async function listing(input: ListingInput): Promise<number> {
  const propertyTypeId = await lookupId("property_types", "STUDIO");
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO listings (
      landlord_id, property_type_id, status, title, description, monthly_rent,
      room_area_sqm, address_text, area_name, latitude, longitude
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id`,
    values: [
      input.landlordId,
      propertyTypeId,
      input.status ?? "APPROVED",
      `RM036 listing ${input.sequence}`,
      `RM036 description ${input.sequence}`,
      String(input.rent ?? 5_000_000),
      String(input.area ?? 25),
      input.sequence === 1 ? privateAddress : `${input.sequence} Exact Street`,
      input.areaName ?? "District 1",
      input.latitude,
      input.longitude
    ]
  });
  const id = response.rows[0]!.id;
  await pool.query({
    text: `INSERT INTO listing_images
      (listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order, alt_text)
      VALUES ($1, $2, $3, 'webp', 800, 600, 1000, 1, 'RM036 cover')`,
    values: [
      id,
      input.sequence === 1 ? privateProvider : `rm036-provider-${input.sequence}`,
      `https://cdn.example.test/rm036-${id}.webp`
    ]
  });
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
    jwtSecret: "rm036-database-test-only-secret-not-for-production",
    bcryptCost: 4,
    cookieSecure: false,
    publicListingSearchConfig: {
      deploymentRegion: "HO_CHI_MINH_CITY_VN",
      maximumSearchRadiusKm: 50
    }
  });
}

function exactDistanceKm(latitude: number, longitude: number): number {
  const a =
    Math.pow(Math.sin(((latitude - centerLat) * Math.PI) / 180 / 2), 2) +
    Math.cos((centerLat * Math.PI) / 180) *
      Math.cos((latitude * Math.PI) / 180) *
      Math.pow(Math.sin(((longitude - centerLng) * Math.PI) / 180 / 2), 2);
  return 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, a)));
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

describe("RM-036 PostgreSQL public bounds and radius search", () => {
  it("includes exact inclusive bounds, preserves filters and pagination, and omits distanceKm", async () => {
    const landlordId = await user(1);
    const inactiveLandlordId = await user(2, false);
    const inside = await listing({
      landlordId,
      sequence: 1,
      rent: 5_000_000,
      latitude: centerLat,
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });
    const north = await listing({
      landlordId,
      sequence: 3,
      rent: 4_000_000,
      latitude: Number("11.166666666666667"),
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });
    const south = await listing({
      landlordId,
      sequence: 4,
      rent: 6_000_000,
      latitude: Number("10.633333333333333"),
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });
    const west = await listing({
      landlordId,
      sequence: 5,
      rent: 7_000_000,
      latitude: centerLat,
      longitude: Number("106.36666666666666"),
      amenities: ["WIFI", "PARKING"]
    });
    const east = await listing({
      landlordId,
      sequence: 6,
      rent: 8_000_000,
      latitude: centerLat,
      longitude: Number("106.93333333333334"),
      amenities: ["WIFI", "PARKING"]
    });
    await listing({
      landlordId,
      sequence: 7,
      latitude: Number("11.166666666668"),
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });
    await listing({
      landlordId,
      sequence: 8,
      latitude: Number("10.633333333332"),
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });
    await listing({
      landlordId,
      sequence: 9,
      latitude: centerLat,
      longitude: Number("106.366666666665"),
      amenities: ["WIFI", "PARKING"]
    });
    await listing({
      landlordId,
      sequence: 10,
      latitude: centerLat,
      longitude: Number("106.933333333335"),
      amenities: ["WIFI", "PARKING"]
    });
    await listing({
      landlordId: inactiveLandlordId,
      sequence: 11,
      latitude: centerLat,
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });
    await listing({
      landlordId,
      sequence: 12,
      status: "DRAFT",
      latitude: centerLat,
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });

    const query =
      "north=11.166666666666667&south=10.633333333333333&east=106.93333333333334&west=106.36666666666666&areaName=district&minMonthlyRent=4000000&maxMonthlyRent=8000000&propertyType=studio&amenities=wifi,parking&sort=rent_asc&pageSize=3";
    const first = await request(await makeApp())
      .get(`/api/v1/listings?${query}`)
      .expect(200);
    const second = await request(await makeApp())
      .get(`/api/v1/listings?${query}&page=2`)
      .expect(200);

    expect(first.body.data.map((item: { id: number }) => item.id)).toStrictEqual([north, inside, south]);
    expect(second.body.data.map((item: { id: number }) => item.id)).toStrictEqual([west, east]);
    expect(first.body.pagination).toStrictEqual({ page: 1, pageSize: 3, hasNextPage: true });
    expect(second.body.pagination).toStrictEqual({ page: 2, pageSize: 3, hasNextPage: false });
    expect(first.body.data.every((item: { distanceKm?: unknown }) => item.distanceKm === undefined)).toBe(true);
    expect(first.body.data.find((item: { id: number }) => item.id === north)).toMatchObject({ latitude: 11.167 });
    expect(second.body.data.find((item: { id: number }) => item.id === east)).toMatchObject({ longitude: 106.933 });
    expect(JSON.stringify(first.body)).not.toMatch(/RM036_PRIVATE|address|landlord|moderation|provider/i);
  });

  it("uses exact coordinates for distance, includes the radius boundary, sorts by distance and id, and rejects bbox-only candidates", async () => {
    const landlordId = await user(20);
    const inactiveLandlordId = await user(21, false);
    const atCenter = await listing({
      landlordId,
      sequence: 20,
      latitude: centerLat,
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });
    const centerTie = await listing({
      landlordId,
      sequence: 21,
      latitude: centerLat,
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });
    const highPrecision = await listing({
      landlordId,
      sequence: 22,
      latitude: 10.772549,
      longitude: 106.697912,
      amenities: ["WIFI", "PARKING"]
    });
    const inside = await listing({
      landlordId,
      sequence: 23,
      latitude: centerLat,
      longitude: centerLng + 0.0005,
      amenities: ["WIFI", "PARKING"]
    });
    const boundaryAngularDeltaDegrees = ((radiusKm / 6371.0088) * (180 / Math.PI)) / Math.SQRT2;
    const boundaryLatitude = centerLat + boundaryAngularDeltaDegrees - 1e-7;
    const boundaryLongitude = centerLng + boundaryAngularDeltaDegrees / Math.cos((centerLat * Math.PI) / 180) - 1e-7;
    const boundary = await listing({
      landlordId,
      sequence: 24,
      latitude: boundaryLatitude,
      longitude: boundaryLongitude,
      amenities: ["WIFI", "PARKING"]
    });
    await listing({
      landlordId,
      sequence: 25,
      latitude: centerLat + 0.0007,
      longitude: centerLng + 0.0007,
      amenities: ["WIFI", "PARKING"]
    });
    await listing({
      landlordId,
      sequence: 26,
      latitude: centerLat + 0.0015,
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });
    await listing({
      landlordId: inactiveLandlordId,
      sequence: 27,
      latitude: centerLat,
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });
    await listing({
      landlordId,
      sequence: 28,
      status: "PENDING",
      latitude: centerLat,
      longitude: centerLng,
      amenities: ["WIFI", "PARKING"]
    });

    const executor = new CountingExecutor(realExecutor);
    const response = await request(await makeApp(executor))
      .get(
        `/api/v1/listings?centerLat=${centerLat}&centerLng=${centerLng}&radiusKm=${radiusKm}&propertyType=studio&amenities=wifi,parking&pageSize=20`
      )
      .expect(200);
    const data = response.body.data as Array<{ id: number; latitude: number; longitude: number; distanceKm: number }>;

    expect(data.map((item) => item.id)).toStrictEqual([atCenter, centerTie, highPrecision, inside, boundary]);
    expect(data.every((item) => Number.isFinite(item.distanceKm) && item.distanceKm >= 0)).toBe(true);
    expect(data[0]!.distanceKm).toBe(0);
    expect(data[1]!.distanceKm).toBe(0);
    expect(data[0]!.id).toBeLessThan(data[1]!.id);
    expect(data.find((item) => item.id === highPrecision)).toMatchObject({ latitude: 10.773, longitude: 106.698 });

    const highPrecisionResult = data.find((item) => item.id === highPrecision)!;
    expect(highPrecisionResult.distanceKm).toBeCloseTo(exactDistanceKm(10.772549, 106.697912), 6);
    expect(Math.abs(highPrecisionResult.distanceKm - exactDistanceKm(10.773, 106.698))).toBeGreaterThan(0.02);
    expect(response.body.pagination).toStrictEqual({ page: 1, pageSize: 20, hasNextPage: false });
    expect(response.body.pagination.total).toBeUndefined();
    expect(executor.queries).toHaveLength(2);
    expect(JSON.stringify(response.body)).not.toMatch(/RM036_PRIVATE|address|landlord|moderation|provider/i);
  });
});
