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
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 2 });
const realExecutor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const secret = "rm037-database-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
const privateAddress = "RM037_PRIVATE_ADDRESS_SENTINEL";
const privateProvider = "rm037-private-provider-sentinel";
const privateModeration = "RM037_PRIVATE_MODERATION_SENTINEL";

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

async function insertUser(role: UserRole, sequence: number, active = true): Promise<number> {
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO users (role, email, phone_e164, password_hash, is_active)
           VALUES ($1, $2, $3, 'rm037-test-hash', $4)
           RETURNING id`,
    values: [
      role,
      `rm037.${role.toLowerCase()}.${sequence}@example.com`,
      role === "LANDLORD" ? `+8493${String(sequence).padStart(8, "0")}` : null,
      active
    ]
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

type Status = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "INACTIVE" | "HIDDEN";

async function insertListing(
  landlordId: number,
  sequence: number,
  status: Status,
  propertyTypeId: number
): Promise<number> {
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO listings (
      landlord_id, property_type_id, status, title, description, monthly_rent,
      room_area_sqm, address_text, area_name, latitude, longitude, updated_at
    ) VALUES ($1, $2, $3, $4, $5, '7500000', '28.50', $6, 'District 1', $7, $8, $9)
    RETURNING id`,
    values: [
      landlordId,
      propertyTypeId,
      status,
      `RM037 listing ${sequence}`,
      `RM037 description ${sequence}`,
      sequence === 1 ? privateAddress : `Private address ${sequence}`,
      10.772549,
      106.697912,
      "2026-07-29T07:15:00.000Z"
    ]
  });
  return response.rows[0]!.id;
}

async function insertImage(listingId: number, sequence: number, displayOrder: number): Promise<void> {
  await pool.query({
    text: `INSERT INTO listing_images
      (listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order, alt_text)
      VALUES ($1, $2, $3, 'webp', 800, 600, 1000, $4, $5)`,
    values: [
      listingId,
      sequence === 11 ? privateProvider : `rm037-provider-${listingId}-${sequence}`,
      `https://cdn.example.test/rm037-${listingId}-${sequence}.webp`,
      displayOrder,
      `Image ${displayOrder}`
    ]
  });
}

async function app(executor: SqlExecutor = realExecutor) {
  return createBackendApp({
    frontendOrigin: "http://localhost:3000",
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds
  });
}

async function session(userId: number, role: UserRole): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => seconds }).sign({ userId, role });
  return `rentmate_session=${token}`;
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

describe("RM-037 PostgreSQL public listing detail", () => {
  it("returns one ordered public aggregate, retired associations, and current owner contact only to tenant", async () => {
    const ownerId = await insertUser("LANDLORD", 1);
    const tenantId = await insertUser("TENANT", 2);
    const adminId = await insertUser("ADMIN", 3);
    const propertyTypeId = await lookupId("property_types", "STUDIO");
    const wifiId = await lookupId("amenities", "WIFI");
    const parkingId = await lookupId("amenities", "PARKING");
    const listingId = await insertListing(ownerId, 1, "APPROVED", propertyTypeId);
    await pool.query({
      text: "INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2), ($1, $3)",
      values: [listingId, wifiId, parkingId]
    });
    await insertImage(listingId, 13, 3);
    await insertImage(listingId, 11, 1);
    await pool.query({
      text: `INSERT INTO moderation_history
        (listing_id, admin_id, previous_status, new_status, reason)
        VALUES ($1, $2, 'PENDING', 'APPROVED', $3)`,
      values: [listingId, adminId, privateModeration]
    });
    await pool.query("UPDATE property_types SET is_active = false WHERE id = $1", [propertyTypeId]);
    await pool.query("UPDATE amenities SET is_active = false WHERE id IN ($1, $2)", [wifiId, parkingId]);

    const anonymousExecutor = new CountingExecutor(realExecutor);
    const anonymous = await request(await app(anonymousExecutor))
      .get(`/api/v1/listings/${listingId}`)
      .expect(200);
    expect(anonymous.body.data).toStrictEqual({
      id: listingId,
      title: "RM037 listing 1",
      description: "RM037 description 1",
      monthlyRent: 7500000,
      roomAreaSqm: 28.5,
      areaName: "District 1",
      latitude: 10.773,
      longitude: 106.698,
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [
        { code: "PARKING", label: "Parking" },
        { code: "WIFI", label: "Wi-Fi" }
      ],
      images: [
        { url: `https://cdn.example.test/rm037-${listingId}-11.webp`, altText: "Image 1", displayOrder: 1 },
        { url: `https://cdn.example.test/rm037-${listingId}-13.webp`, altText: "Image 3", displayOrder: 3 }
      ],
      updatedAt: "2026-07-29T07:15:00.000Z"
    });
    expect(anonymousExecutor.queries).toHaveLength(1);
    const anonymousJson = JSON.stringify(anonymous.body);
    expect(anonymousJson).not.toContain(privateAddress);
    expect(anonymousJson).not.toContain(privateProvider);
    expect(anonymousJson).not.toContain(privateModeration);
    expect(anonymousJson).not.toContain(`rm037.landlord.1@example.com`);
    expect(anonymousJson).not.toContain("+849300000001");

    const tenantExecutor = new CountingExecutor(realExecutor);
    const tenant = await request(await app(tenantExecutor))
      .get(`/api/v1/listings/${listingId}`)
      .set("Cookie", await session(tenantId, "TENANT"))
      .expect(200);
    expect(tenant.body.data.landlordContact).toStrictEqual({
      email: "rm037.landlord.1@example.com",
      phone: "+849300000001"
    });
    expect(tenantExecutor.queries).toHaveLength(2);
    expect(JSON.stringify(tenant.body)).not.toMatch(/RM037_PRIVATE|cloudinary|moderation|addressText|landlordId/);
  });

  it("returns the same 404 for missing, every non-public status, and an inactive owning landlord", async () => {
    const ownerId = await insertUser("LANDLORD", 10);
    const inactiveOwnerId = await insertUser("LANDLORD", 11, false);
    const propertyTypeId = await lookupId("property_types", "STUDIO");
    const ids: number[] = [];
    for (const [index, status] of (["DRAFT", "PENDING", "REJECTED", "INACTIVE", "HIDDEN"] as const).entries()) {
      const id = await insertListing(ownerId, 20 + index, status, propertyTypeId);
      await insertImage(id, 20 + index, 1);
      ids.push(id);
    }
    const inactiveOwnerListing = await insertListing(inactiveOwnerId, 30, "APPROVED", propertyTypeId);
    await insertImage(inactiveOwnerListing, 30, 1);
    ids.push(inactiveOwnerListing, 2_147_483_647);

    const application = await app();
    for (const id of ids) {
      const response = await request(application).get(`/api/v1/listings/${id}`).expect(404);
      expect(response.body.error).toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found."
      });
      expect(response.body.error.details).toBeUndefined();
    }
  });

  it("treats an approved row without images as an internal invariant failure", async () => {
    const ownerId = await insertUser("LANDLORD", 40);
    const propertyTypeId = await lookupId("property_types", "STUDIO");
    const listingId = await insertListing(ownerId, 40, "APPROVED", propertyTypeId);
    const response = await request(await app())
      .get(`/api/v1/listings/${listingId}`)
      .expect(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(response.text).not.toMatch(/SQL|stack|address|landlord/i);
  });
});
