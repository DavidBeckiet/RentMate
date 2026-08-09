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
import { createFavoriteRepository } from "../src/modules/favorites/favorite-repository.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 4 });
const realExecutor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const secret = "rm039-database-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const origin = "http://localhost:3000";
const privateAddress = "RM039_PRIVATE_ADDRESS_SENTINEL";
const privateProvider = "rm039-private-provider-sentinel";
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

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
           VALUES ($1, $2, $3, 'rm039-test-hash', $4)
           RETURNING id`,
    values: [
      role,
      `rm039.${role.toLowerCase()}.${sequence}@example.com`,
      role === "LANDLORD" ? `+8495${String(sequence).padStart(8, "0")}` : null,
      active
    ]
  });
  return response.rows[0]!.id;
}

async function insertListing(landlordId: number, sequence: number, status = "APPROVED"): Promise<number> {
  const propertyType = await pool.query<{ id: number }>("SELECT id FROM property_types WHERE code = 'STUDIO'");
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO listings (
      landlord_id, property_type_id, status, title, description, monthly_rent,
      room_area_sqm, address_text, area_name, latitude, longitude, updated_at
    ) VALUES ($1,$2,$3,$4,$5,'7500000','28.50',$6,'District 1',10.772549,106.697912,$7)
    RETURNING id`,
    values: [
      landlordId,
      propertyType.rows[0]!.id,
      status,
      `RM039 listing ${sequence}`,
      `RM039 description ${sequence}`,
      sequence === 1 ? privateAddress : `Private address ${sequence}`,
      "2026-08-01T07:15:00.000Z"
    ]
  });
  const listingId = response.rows[0]!.id;
  await pool.query({
    text: `INSERT INTO listing_images
      (listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order, alt_text)
      VALUES ($1,$2,$3,'webp',800,600,1000,1,'Room')`,
    values: [
      listingId,
      sequence === 1 ? privateProvider : `rm039-provider-${sequence}`,
      `https://cdn.example.test/rm039-${listingId}.webp`
    ]
  });
  return listingId;
}

async function insertFavorite(tenantId: number, listingId: number, createdAt: string): Promise<void> {
  await pool.query({
    text: "INSERT INTO favorites (tenant_id, listing_id, created_at) VALUES ($1, $2, $3)",
    values: [tenantId, listingId, createdAt]
  });
}

async function makeApp(executor: SqlExecutor = realExecutor) {
  return createBackendApp({
    frontendOrigin: origin,
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

describe("RM-039 PostgreSQL favorites", () => {
  it("returns only currently public retained rows in favorite order with one collection query", async () => {
    const tenant = await insertUser("TENANT", 1);
    const owner = await insertUser("LANDLORD", 1);
    const inactiveOwner = await insertUser("LANDLORD", 2, false);
    const older = await insertListing(owner, 1);
    const tiedLow = await insertListing(owner, 2);
    const tiedHigh = await insertListing(owner, 3);
    const hidden = await insertListing(owner, 4, "HIDDEN");
    const inactive = await insertListing(inactiveOwner, 5);
    await insertFavorite(tenant, older, "2026-08-01T00:00:00.000Z");
    await insertFavorite(tenant, tiedLow, "2026-08-02T00:00:00.000Z");
    await insertFavorite(tenant, tiedHigh, "2026-08-02T00:00:00.000Z");
    await insertFavorite(tenant, hidden, "2026-08-03T00:00:00.000Z");
    await insertFavorite(tenant, inactive, "2026-08-04T00:00:00.000Z");
    const retiredAmenity = await pool.query<{ id: number }>("SELECT id FROM amenities WHERE code = 'WIFI'");
    await pool.query("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2)", [
      tiedHigh,
      retiredAmenity.rows[0]!.id
    ]);
    await pool.query("UPDATE amenities SET is_active = false WHERE id = $1", [retiredAmenity.rows[0]!.id]);
    await pool.query("UPDATE property_types SET is_active = false WHERE code = 'STUDIO'");

    const counting = new CountingExecutor(realExecutor);
    const response = await request(await makeApp(counting))
      .get("/api/v1/favorites?pageSize=2")
      .set("Cookie", await session(tenant, "TENANT"))
      .expect(200);
    expect(response.body.data.map((item: { id: number }) => item.id)).toStrictEqual([tiedHigh, tiedLow]);
    expect(response.body.pagination).toStrictEqual({ page: 1, pageSize: 2, hasNextPage: true });
    expect(Object.keys(response.body.data[0]).sort()).toStrictEqual([
      "amenities",
      "areaName",
      "coverImage",
      "id",
      "latitude",
      "longitude",
      "monthlyRent",
      "propertyType",
      "roomAreaSqm",
      "title",
      "updatedAt"
    ]);
    expect(response.body.data[0].propertyType).toStrictEqual({ code: "STUDIO", label: "Studio" });
    expect(response.body.data[0].amenities).toContainEqual({ code: "WIFI", label: "Wi-Fi" });
    expect(counting.queries).toHaveLength(2);
    expect(counting.queries.filter((query) => query.text.includes("WITH page_candidates AS"))).toHaveLength(1);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(privateAddress);
    expect(serialized).not.toContain(privateProvider);
    expect(serialized).not.toMatch(/addressText|description|cloudinary|landlord|favoriteCreatedAt/i);

    const retainedBefore = await pool.query<{ created_at: Date }>(
      "SELECT created_at FROM favorites WHERE tenant_id = $1 AND listing_id = $2",
      [tenant, tiedHigh]
    );
    await pool.query("UPDATE listings SET status = 'HIDDEN' WHERE id = $1", [tiedHigh]);
    const hiddenPage = await createFavoriteRepository(realExecutor).findPage({
      tenantId: tenant,
      pageSize: 20,
      offset: 0
    });
    expect(hiddenPage.map((item) => item.id)).not.toContain(tiedHigh);
    const retainedHidden = await pool.query<{ count: string }>(
      "SELECT count(*) FROM favorites WHERE tenant_id = $1 AND listing_id = $2",
      [tenant, tiedHigh]
    );
    expect(retainedHidden.rows[0]?.count).toBe("1");
    await pool.query("UPDATE listings SET status = 'APPROVED' WHERE id = $1", [tiedHigh]);
    const visibleAgain = await createFavoriteRepository(realExecutor).findPage({
      tenantId: tenant,
      pageSize: 20,
      offset: 0
    });
    expect(visibleAgain.map((item) => item.id)).toContain(tiedHigh);
    const retainedAfter = await pool.query<{ created_at: Date }>(
      "SELECT created_at FROM favorites WHERE tenant_id = $1 AND listing_id = $2",
      [tenant, tiedHigh]
    );
    expect(retainedAfter.rows[0]?.created_at.toISOString()).toBe(retainedBefore.rows[0]?.created_at.toISOString());
  });

  it("makes PUT idempotent, preserves created_at, and hides target existence", async () => {
    const tenant = await insertUser("TENANT", 10);
    const owner = await insertUser("LANDLORD", 10);
    const inactiveOwner = await insertUser("LANDLORD", 11, false);
    const visible = await insertListing(owner, 10);
    const hidden = await insertListing(owner, 11, "HIDDEN");
    const inactive = await insertListing(inactiveOwner, 12);
    const application = await makeApp();
    const auth = await session(tenant, "TENANT");

    await request(application)
      .put(`/api/v1/favorites/${visible}`)
      .set("Origin", origin)
      .set("Cookie", auth)
      .expect(204);
    const first = await pool.query<{ created_at: Date }>("SELECT created_at FROM favorites WHERE tenant_id = $1", [
      tenant
    ]);
    await request(application)
      .put(`/api/v1/favorites/${visible}`)
      .set("Origin", origin)
      .set("Cookie", auth)
      .expect(204);
    const repeated = await pool.query<{ created_at: Date }>("SELECT created_at FROM favorites WHERE tenant_id = $1", [
      tenant
    ]);
    expect(repeated.rows).toHaveLength(1);
    expect(repeated.rows[0]?.created_at.toISOString()).toBe(first.rows[0]?.created_at.toISOString());

    for (const listingId of [hidden, inactive, 2_147_483_647]) {
      const response = await request(application)
        .put(`/api/v1/favorites/${listingId}`)
        .set("Origin", origin)
        .set("Cookie", auth)
        .expect(404);
      expect(response.body.error).toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found."
      });
    }
  });

  it("handles concurrent PUT with one durable row and no error", async () => {
    const tenant = await insertUser("TENANT", 20);
    const owner = await insertUser("LANDLORD", 20);
    const listing = await insertListing(owner, 20);
    const repository = createFavoriteRepository(realExecutor);
    const outcomes = await Promise.all([
      repository.ensurePresent(tenant, listing),
      repository.ensurePresent(tenant, listing)
    ]);
    expect(outcomes.every((outcome) => outcome.isVisible)).toBe(true);
    expect(outcomes.filter((outcome) => outcome.wasInserted)).toHaveLength(1);
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM favorites WHERE tenant_id = $1 AND listing_id = $2",
      [tenant, listing]
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("makes DELETE unconditional and repeat-safe for every target state", async () => {
    const tenant = await insertUser("TENANT", 30);
    const owner = await insertUser("LANDLORD", 30);
    const inactiveOwner = await insertUser("LANDLORD", 31, false);
    const visible = await insertListing(owner, 30);
    const hidden = await insertListing(owner, 31, "HIDDEN");
    const inactive = await insertListing(inactiveOwner, 32);
    await insertFavorite(tenant, visible, "2026-08-01T00:00:00.000Z");
    await insertFavorite(tenant, hidden, "2026-08-02T00:00:00.000Z");
    await insertFavorite(tenant, inactive, "2026-08-03T00:00:00.000Z");
    const application = await makeApp();
    const auth = await session(tenant, "TENANT");

    for (const listingId of [visible, visible, hidden, hidden, inactive, inactive, 2_147_483_647]) {
      await request(application)
        .delete(`/api/v1/favorites/${listingId}`)
        .set("Origin", origin)
        .set("Cookie", auth)
        .expect(204);
    }
    const remaining = await pool.query<{ count: string }>("SELECT count(*) FROM favorites WHERE tenant_id = $1", [
      tenant
    ]);
    expect(remaining.rows[0]?.count).toBe("0");
  });
});
