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
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 2 });
const realExecutor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const frontendOrigin = "http://localhost:3000";
const jwtSecret = "rm021-database-test-only-secret-not-for-production";
const nowSeconds = 1_900_000_000;

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

class CountingExecutor implements SqlExecutor {
  readonly ownerReadQueries: ParameterizedQuery[] = [];

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    if (
      query.text.includes("FROM listings AS l") ||
      query.text.includes("FROM listing_amenities AS la") ||
      query.text.includes("FROM listing_images") ||
      query.text.includes("FROM moderation_history")
    ) {
      this.ownerReadQueries.push(query);
    }
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

async function insertUser(role: "LANDLORD" | "ADMIN", sequence: number): Promise<number> {
  const result = await pool.query<{ id: number }>({
    text: `
      INSERT INTO users (role, email, phone_e164, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    values: [
      role,
      `rm021.${role.toLowerCase()}.${sequence}@example.com`,
      role === "LANDLORD" ? `+8491000${String(sequence).padStart(4, "0")}` : null,
      "test-only-non-authenticating-hash"
    ]
  });
  return result.rows[0]!.id;
}

async function propertyTypeId(code = "STUDIO"): Promise<number> {
  const result = await pool.query<{ id: number }>({
    text: "SELECT id FROM property_types WHERE code = $1",
    values: [code]
  });
  return result.rows[0]!.id;
}

async function amenityId(code: string): Promise<number> {
  const result = await pool.query<{ id: number }>({
    text: "SELECT id FROM amenities WHERE code = $1",
    values: [code]
  });
  return result.rows[0]!.id;
}

async function insertListing(
  landlordId: number,
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN" | "INACTIVE",
  sequence: number,
  complete = status !== "DRAFT"
): Promise<number> {
  const typeId = complete ? await propertyTypeId() : null;
  const updatedAt = new Date(Date.UTC(2026, 6, 20, 0, sequence, 0));
  const result = await pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
      RETURNING id
    `,
    values: [
      landlordId,
      typeId,
      status,
      complete ? `Listing ${sequence}` : null,
      complete ? `Private description ${sequence}` : null,
      complete ? String(5_000_000 + sequence) : null,
      complete ? "25.50" : null,
      complete ? `${sequence} Exact Street` : null,
      complete ? "District 1" : null,
      complete ? 10.772341 + sequence / 100_000 : null,
      complete ? 106.697912 + sequence / 100_000 : null,
      updatedAt
    ]
  });
  return result.rows[0]!.id;
}

async function insertImage(listingId: number, displayOrder: number, sequence: number): Promise<number> {
  const result = await pool.query<{ id: number }>({
    text: `
      INSERT INTO listing_images (
        listing_id, cloudinary_public_id, secure_url, format, width, height,
        byte_size, display_order, alt_text
      )
      VALUES ($1, $2, $3, 'webp', 800, 600, 12345, $4, $5)
      RETURNING id
    `,
    values: [
      listingId,
      `rm021-private-provider-id-${sequence}`,
      `https://cdn.example.test/rm021-${sequence}.webp`,
      displayOrder,
      `Image ${sequence}`
    ]
  });
  return result.rows[0]!.id;
}

async function insertModerationReason(
  listingId: number,
  adminId: number,
  newStatus: "REJECTED" | "HIDDEN",
  reason: string,
  sequence: number
): Promise<void> {
  await pool.query({
    text: `
      INSERT INTO moderation_history (
        listing_id, admin_id, previous_status, new_status, reason, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    values: [
      listingId,
      adminId,
      newStatus === "REJECTED" ? "PENDING" : "APPROVED",
      newStatus,
      reason,
      new Date(Date.UTC(2026, 6, 21, 0, sequence, 0))
    ]
  });
}

async function signLandlordToken(userId: number): Promise<string> {
  return createSessionTokenService({ secret: jwtSecret, nowSeconds: () => nowSeconds }).sign({
    userId,
    role: "LANDLORD"
  });
}

async function makeApp(executor: SqlExecutor) {
  return createBackendApp({
    frontendOrigin,
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => nowSeconds,
    authRateLimitClock: () => 0
  });
}

function ownerGet(app: Awaited<ReturnType<typeof makeApp>>, token: string, path: string) {
  return request(app).get(path).set("Cookie", `rentmate_session=${token}`);
}

async function databaseSnapshot(): Promise<unknown> {
  const listings = await pool.query({
    text: "SELECT id, status, updated_at FROM listings ORDER BY id",
    values: []
  });
  const counts = await pool.query({
    text: `
      SELECT
        (SELECT count(*)::integer FROM listings) AS listings,
        (SELECT count(*)::integer FROM listing_images) AS images,
        (SELECT count(*)::integer FROM listing_amenities) AS amenities,
        (SELECT count(*)::integer FROM moderation_history) AS moderation
    `,
    values: []
  });
  return { listings: listings.rows, counts: counts.rows[0] };
}

beforeAll(async () => {
  await cleanFrozenSchema();
  const migrations = await discoverMigrations(migrationDirectory);
  await executeMigrationPlan(pool, createMigrationPlan("clean", migrations));
});

beforeEach(async () => {
  await pool.query("DELETE FROM moderation_history");
  await pool.query("DELETE FROM favorites");
  await pool.query("DELETE FROM listings");
  await pool.query("DELETE FROM users");
  await pool.query("UPDATE property_types SET is_active = true");
  await pool.query("UPDATE amenities SET is_active = true");
});

afterAll(async () => {
  await cleanFrozenSchema();
  await closeDatabasePool(pool);
});

describe("RM-021 PostgreSQL owner listing read acceptance", () => {
  it("returns only the principal owner's six statuses in deterministic limit-plus-one pages", async () => {
    const ownerId = await insertUser("LANDLORD", 1);
    const otherOwnerId = await insertUser("LANDLORD", 2);
    const adminId = await insertUser("ADMIN", 3);
    const statuses = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const;
    const ids: number[] = [];
    for (const [index, status] of statuses.entries()) {
      ids.push(await insertListing(ownerId, status, index + 1));
    }
    await insertListing(otherOwnerId, "APPROVED", 20);
    await insertImage(ids[2]!, 2, 1);
    const coverId = await insertImage(ids[2]!, 1, 2);
    await insertModerationReason(ids[3]!, adminId, "REJECTED", "First rejection", 1);
    await insertModerationReason(ids[3]!, adminId, "REJECTED", "Current rejection", 2);
    await insertModerationReason(ids[4]!, adminId, "HIDDEN", "Current hidden reason", 3);

    const executor = new CountingExecutor();
    const app = await makeApp(executor);
    const before = await databaseSnapshot();
    const token = await signLandlordToken(ownerId);
    const response = await ownerGet(app, token, "/api/v1/landlord/listings?page=1&pageSize=3").expect(200);

    expect(response.body.pagination).toStrictEqual({ page: 1, pageSize: 3, hasNextPage: true });
    expect(response.body.data.map((listing: { id: number }) => listing.id)).toStrictEqual(ids.slice(3).reverse());
    expect(response.body.data[0]).toMatchObject({
      id: ids[5],
      status: "INACTIVE",
      currentModerationReason: null
    });
    expect(response.body.data[1]).toMatchObject({
      id: ids[4],
      status: "HIDDEN",
      currentModerationReason: "Current hidden reason"
    });
    expect(response.body.data[2]).toMatchObject({
      id: ids[3],
      status: "REJECTED",
      currentModerationReason: "Current rejection"
    });
    expect(executor.ownerReadQueries).toHaveLength(1);

    executor.ownerReadQueries.length = 0;
    const filtered = await ownerGet(app, token, "/api/v1/landlord/listings?status=approved&pageSize=1").expect(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0]).toMatchObject({
      id: ids[2],
      status: "APPROVED",
      coverImage: { id: coverId, displayOrder: 1 }
    });
    expect(filtered.body.pagination.hasNextPage).toBe(false);
    expect(executor.ownerReadQueries).toHaveLength(1);
    expect(JSON.stringify(filtered.body)).not.toMatch(/cloudinary|provider|landlordId|addressText|latitude|longitude/i);
    expect(await databaseSnapshot()).toStrictEqual(before);
  });

  it("returns a complete private detail with retired controlled values and ordered associations in three queries", async () => {
    const ownerId = await insertUser("LANDLORD", 10);
    const listingId = await insertListing(ownerId, "APPROVED", 10);
    const wifiId = await amenityId("WIFI");
    const furnishedId = await amenityId("FURNISHED");
    await pool.query({
      text: "INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2), ($1, $3)",
      values: [listingId, wifiId, furnishedId]
    });
    const imageTwo = await insertImage(listingId, 2, 11);
    const imageOne = await insertImage(listingId, 1, 12);
    await pool.query("UPDATE property_types SET is_active = false WHERE code = 'STUDIO'");
    await pool.query("UPDATE amenities SET is_active = false WHERE code = 'WIFI'");

    const executor = new CountingExecutor();
    const app = await makeApp(executor);
    const before = await databaseSnapshot();
    const response = await ownerGet(
      app,
      await signLandlordToken(ownerId),
      `/api/v1/landlord/listings/${listingId}`
    ).expect(200);

    expect(response.body.data).toMatchObject({
      id: listingId,
      status: "APPROVED",
      title: "Listing 10",
      description: "Private description 10",
      monthlyRent: 5000010,
      roomAreaSqm: 25.5,
      addressText: "10 Exact Street",
      areaName: "District 1",
      latitude: 10.772441,
      longitude: 106.698012,
      propertyType: { code: "STUDIO", label: "Studio" },
      currentModerationReason: null
    });
    expect(response.body.data.amenities).toStrictEqual([
      { code: "FURNISHED", label: "Furnished" },
      { code: "WIFI", label: "Wi-Fi" }
    ]);
    expect(response.body.data.images.map((image: { id: number }) => image.id)).toStrictEqual([imageOne, imageTwo]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /cloudinary_public_id|cloudinaryPublicId|listing_id|landlord_id/i
    );
    expect(executor.ownerReadQueries).toHaveLength(3);
    expect(await databaseSnapshot()).toStrictEqual(before);
  });

  it.each([
    ["REJECTED", "Current rejection reason"],
    ["HIDDEN", "Current hidden reason"]
  ] as const)("loads the current %s reason in exactly four queries", async (status, reason) => {
    const ownerId = await insertUser("LANDLORD", status === "REJECTED" ? 20 : 21);
    const adminId = await insertUser("ADMIN", status === "REJECTED" ? 22 : 23);
    const listingId = await insertListing(ownerId, status, status === "REJECTED" ? 20 : 21);
    await insertModerationReason(listingId, adminId, status, reason, 1);
    const executor = new CountingExecutor();
    const app = await makeApp(executor);

    const response = await ownerGet(
      app,
      await signLandlordToken(ownerId),
      `/api/v1/landlord/listings/${listingId}`
    ).expect(200);
    expect(response.body.data.currentModerationReason).toBe(reason);
    expect(executor.ownerReadQueries).toHaveLength(4);
  });

  it("returns the same owner-scoped 404 for missing and non-owned rows after one query", async () => {
    const ownerId = await insertUser("LANDLORD", 30);
    const otherOwnerId = await insertUser("LANDLORD", 31);
    const otherListingId = await insertListing(otherOwnerId, "DRAFT", 30);
    const executor = new CountingExecutor();
    const app = await makeApp(executor);

    const token = await signLandlordToken(ownerId);
    const missing = await ownerGet(app, token, "/api/v1/landlord/listings/2147483647").expect(404);
    expect(executor.ownerReadQueries).toHaveLength(1);
    executor.ownerReadQueries.length = 0;
    const nonOwned = await ownerGet(app, token, `/api/v1/landlord/listings/${otherListingId}`).expect(404);
    expect(executor.ownerReadQueries).toHaveLength(1);
    const shape = (body: typeof missing.body) => ({
      code: body.error.code,
      message: body.error.message,
      details: body.error.details
    });
    expect(shape(nonOwned.body)).toStrictEqual(shape(missing.body));
  });

  it("returns an incomplete draft with null fields and empty associations", async () => {
    const ownerId = await insertUser("LANDLORD", 40);
    const listingId = await insertListing(ownerId, "DRAFT", 40, false);
    const executor = new CountingExecutor();
    const app = await makeApp(executor);

    const response = await ownerGet(
      app,
      await signLandlordToken(ownerId),
      `/api/v1/landlord/listings/${listingId}`
    ).expect(200);
    expect(response.body.data).toMatchObject({
      id: listingId,
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
      currentModerationReason: null
    });
    expect(executor.ownerReadQueries).toHaveLength(3);
  });

  it("treats a missing required current moderation reason as an internal integrity failure", async () => {
    const ownerId = await insertUser("LANDLORD", 50);
    const listingId = await insertListing(ownerId, "REJECTED", 50);
    const executor = new CountingExecutor();
    const app = await makeApp(executor);

    const response = await ownerGet(
      app,
      await signLandlordToken(ownerId),
      `/api/v1/landlord/listings/${listingId}`
    ).expect(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/moderation_history|reason row|SQL|stack/i);
    expect(executor.ownerReadQueries).toHaveLength(4);
  });
});
