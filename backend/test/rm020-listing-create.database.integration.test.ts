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
import { withTransaction } from "../src/db/transaction.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 2 });
const sqlExecutor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const frontendOrigin = "http://localhost:3000";
const jwtSecret = "rm020-database-test-only-secret-not-for-production";
const nowSeconds = 1_900_000_000;

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

interface ListingSnapshot {
  readonly id: number;
  readonly landlord_id: number;
  readonly property_type_id: number | null;
  readonly status: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly monthly_rent: string | null;
  readonly room_area_sqm: string | null;
  readonly address_text: string | null;
  readonly area_name: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly created_at: Date;
  readonly updated_at: Date;
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

async function insertLandlord(): Promise<number> {
  const result = await pool.query<{ id: number }>({
    text: `
      INSERT INTO users (role, email, phone_e164, password_hash)
      VALUES ('LANDLORD', $1, $2, $3)
      RETURNING id
    `,
    values: ["rm020.landlord@example.com", "+84901112223", "test-only-non-authenticating-hash"]
  });
  return result.rows[0]!.id;
}

async function signLandlordToken(userId: number): Promise<string> {
  return createSessionTokenService({ secret: jwtSecret, nowSeconds: () => nowSeconds }).sign({
    userId,
    role: "LANDLORD"
  });
}

async function makeApp(transactionRunner?: TransactionRunner) {
  return createBackendApp({
    frontendOrigin,
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor,
    jwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => nowSeconds,
    authRateLimitClock: () => 0,
    transactionRunner:
      transactionRunner ??
      (async <Value>(operation: (executor: SqlExecutor) => Promise<Value>): Promise<Value> =>
        withTransaction(pool, silentLogger, operation))
  });
}

function postDraft(app: Awaited<ReturnType<typeof makeApp>>, token: string, body: string | object) {
  return request(app)
    .post("/api/v1/landlord/listings")
    .set("Origin", frontendOrigin)
    .set("Cookie", `rentmate_session=${token}`)
    .send(body);
}

async function readListings(): Promise<ListingSnapshot[]> {
  const result = await pool.query<ListingSnapshot>({
    text: `
      SELECT
        id, landlord_id, property_type_id, status, title, description,
        monthly_rent, room_area_sqm, address_text, area_name,
        latitude, longitude, created_at, updated_at
      FROM listings
      ORDER BY id
    `,
    values: []
  });
  return result.rows;
}

async function readAmenityCodes(listingId: number): Promise<string[]> {
  const result = await pool.query<{ code: string }>({
    text: `
      SELECT amenities.code
      FROM listing_amenities
      JOIN amenities ON amenities.id = listing_amenities.amenity_id
      WHERE listing_amenities.listing_id = $1
      ORDER BY amenities.code
    `,
    values: [listingId]
  });
  return result.rows.map(({ code }) => code);
}

async function tableCount(table: string): Promise<number> {
  const result = await pool.query<{ count: number }>({
    text: `SELECT count(*)::integer AS count FROM ${table}`,
    values: []
  });
  return result.rows[0]!.count;
}

beforeAll(async () => {
  await cleanFrozenSchema();
  const migrations = await discoverMigrations(migrationDirectory);
  await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));
});

beforeEach(async () => {
  await pool.query({ text: "DELETE FROM listings", values: [] });
  await pool.query({ text: "DELETE FROM users", values: [] });
  await pool.query({ text: "UPDATE property_types SET is_active = true", values: [] });
  await pool.query({ text: "UPDATE amenities SET is_active = true", values: [] });
});

afterAll(async () => {
  await cleanFrozenSchema();
  await closeDatabasePool(pool);
});

describe("RM-020 PostgreSQL listing-create acceptance", () => {
  it("creates an owned empty DRAFT with database defaults and no junction rows", async () => {
    const landlordId = await insertLandlord();
    const app = await makeApp();
    const response = await postDraft(app, await signLandlordToken(landlordId), {}).expect(201);
    const rows = await readListings();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      landlord_id: landlordId,
      property_type_id: null,
      status: "DRAFT",
      title: null,
      description: null,
      monthly_rent: null,
      room_area_sqm: null,
      address_text: null,
      area_name: null,
      latitude: null,
      longitude: null
    });
    expect(rows[0]!.created_at).toBeInstanceOf(Date);
    expect(rows[0]!.updated_at).toBeInstanceOf(Date);
    expect(rows[0]!.created_at.getTime()).toBe(rows[0]!.updated_at.getTime());
    expect(await readAmenityCodes(rows[0]!.id)).toStrictEqual([]);
    expect(response.body.data).toStrictEqual({
      id: rows[0]!.id,
      status: "DRAFT",
      title: null,
      description: null,
      monthlyRent: null,
      roomAreaSqm: null,
      addressText: null,
      areaName: null,
      latitude: null,
      longitude: null,
      propertyType: null,
      amenities: [],
      images: [],
      currentModerationReason: null,
      createdAt: rows[0]!.created_at.toISOString(),
      updatedAt: rows[0]!.updated_at.toISOString()
    });

    await postDraft(app, await signLandlordToken(landlordId), { landlordId: landlordId + 1 }).expect(422);
    expect(await tableCount("listings")).toBe(1);
  });

  it("persists a normalized partial draft while preserving omitted nulls", async () => {
    const landlordId = await insertLandlord();
    const app = await makeApp();
    const response = await postDraft(app, await signLandlordToken(landlordId), {
      title: "  Room with   balcony  ",
      description: "   ",
      monthlyRent: 5000000,
      amenityCodes: []
    }).expect(201);
    const row = (await readListings())[0]!;

    expect(row).toMatchObject({
      landlord_id: landlordId,
      status: "DRAFT",
      title: "Room with   balcony",
      description: null,
      monthly_rent: "5000000",
      property_type_id: null,
      latitude: null,
      longitude: null
    });
    expect(response.body.data).toMatchObject({
      title: "Room with   balcony",
      description: null,
      monthlyRent: 5000000,
      propertyType: null,
      amenities: []
    });
    expect(await tableCount("listing_amenities")).toBe(0);
  });

  it("atomically persists an exact complete draft and active controlled values", async () => {
    const landlordId = await insertLandlord();
    const propertyTypeCount = await tableCount("property_types");
    const amenityCount = await tableCount("amenities");
    const app = await makeApp();
    const response = await postDraft(app, await signLandlordToken(landlordId), {
      title: " Studio ",
      description: " Exact private description ",
      monthlyRent: 7500000,
      propertyTypeCode: " studio ",
      roomAreaSqm: 28.5,
      addressText: " 12 Example Street ",
      areaName: " District 1 ",
      latitude: 10.772341,
      longitude: 106.697912,
      amenityCodes: ["wifi", " furnished "]
    }).expect(201);
    const row = (await readListings())[0]!;
    const propertyType = await pool.query<{ id: number }>({
      text: "SELECT id FROM property_types WHERE code = $1",
      values: ["STUDIO"]
    });

    expect(row).toMatchObject({
      landlord_id: landlordId,
      property_type_id: propertyType.rows[0]!.id,
      status: "DRAFT",
      title: "Studio",
      description: "Exact private description",
      monthly_rent: "7500000",
      room_area_sqm: "28.50",
      address_text: "12 Example Street",
      area_name: "District 1",
      latitude: 10.772341,
      longitude: 106.697912
    });
    expect(await readAmenityCodes(row.id)).toStrictEqual(["FURNISHED", "WIFI"]);
    expect(response.body.data).toMatchObject({
      id: row.id,
      status: "DRAFT",
      latitude: 10.772341,
      longitude: 106.697912,
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [
        { code: "FURNISHED", label: "Furnished" },
        { code: "WIFI", label: "Wi-Fi" }
      ],
      images: [],
      currentModerationReason: null
    });
    expect(await tableCount("users")).toBe(1);
    expect(await tableCount("property_types")).toBe(propertyTypeCount);
    expect(await tableCount("amenities")).toBe(amenityCount);
    for (const table of ["listing_images", "favorites", "moderation_history"]) {
      expect(await tableCount(table)).toBe(0);
    }
  });

  it.each([
    ["unknown property type", "property_types", "UNKNOWN", false],
    ["inactive property type", "property_types", "STUDIO", true],
    ["unknown amenity", "amenities", "UNKNOWN", false],
    ["inactive amenity", "amenities", "WIFI", true]
  ] as const)("rejects an %s without creating a listing", async (_case, table, code, retire) => {
    const landlordId = await insertLandlord();
    if (retire) {
      await pool.query({ text: `UPDATE ${table} SET is_active = false WHERE code = $1`, values: [code] });
    }
    const app = await makeApp();
    const body = table === "property_types" ? { propertyTypeCode: code } : { amenityCodes: [code] };
    const response = await postDraft(app, await signLandlordToken(landlordId), body).expect(422);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(await tableCount("listings")).toBe(0);
    expect(await tableCount("listing_amenities")).toBe(0);
  });

  it("rolls back the listing when the real transaction encounters a forced junction failure", async () => {
    const landlordId = await insertLandlord();
    const failingRunner: TransactionRunner = async <Value>(
      operation: (executor: SqlExecutor) => Promise<Value>
    ): Promise<Value> =>
      withTransaction(pool, silentLogger, async (transaction) => {
        const failingExecutor: SqlExecutor = {
          async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
            if (query.text.includes("INSERT INTO listing_amenities")) {
              throw new Error("synthetic test-only junction failure");
            }
            return transaction.query<Row>(query);
          }
        };
        return operation(failingExecutor);
      });
    const app = await makeApp(failingRunner);
    const response = await postDraft(app, await signLandlordToken(landlordId), {
      title: "Must roll back",
      amenityCodes: ["WIFI", "FURNISHED"]
    }).expect(500);

    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/synthetic|junction|SQL|stack/i);
    expect(await tableCount("listings")).toBe(0);
    expect(await tableCount("listing_amenities")).toBe(0);
    expect(await tableCount("users")).toBe(1);
  });
});
