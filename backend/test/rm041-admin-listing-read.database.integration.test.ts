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
import { createAdminListingReadRepository } from "../src/modules/listings/admin-listing-read-repository.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 4 });
const realExecutor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const secret = "rm041-database-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

class CountingExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  constructor(private readonly delegate: SqlExecutor) {}
  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return this.delegate.query<Row>(query);
  }
}

async function cleanSchema(): Promise<void> {
  for (const table of [
    "moderation_history",
    "favorites",
    "listing_amenities",
    "listing_images",
    "listings",
    "amenities",
    "property_types",
    "users"
  ]) {
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
  }
  await pool.query("DROP TYPE IF EXISTS listing_status");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

async function resetRows(): Promise<void> {
  await pool.query("DELETE FROM moderation_history");
  await pool.query("DELETE FROM listing_amenities");
  await pool.query("DELETE FROM listing_images");
  await pool.query("DELETE FROM listings");
  await pool.query("DELETE FROM users");
  await pool.query("UPDATE property_types SET is_active = true");
  await pool.query("UPDATE amenities SET is_active = true");
}

async function user(role: "ADMIN" | "LANDLORD", sequence: number, active = true): Promise<number> {
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO users (role,email,phone_e164,password_hash,is_active) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    values: [
      role,
      `rm041.${role.toLowerCase()}.${sequence}@example.com`,
      role === "LANDLORD" ? `+8498${String(sequence).padStart(8, "0")}` : null,
      role === "LANDLORD" ? "RM041_PASSWORD_HASH_SENTINEL" : "test-hash",
      active
    ]
  });
  return response.rows[0]!.id;
}

async function lookup(table: "property_types" | "amenities", code: string): Promise<number> {
  const response = await pool.query<{ id: number }>(`SELECT id FROM ${table} WHERE code=$1`, [code]);
  return response.rows[0]!.id;
}

async function listing(
  landlordId: number,
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN" | "INACTIVE",
  sequence: number,
  updatedAt = "2026-08-09T07:15:00.000Z"
): Promise<number> {
  const draft = status === "DRAFT";
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO listings
      (landlord_id,property_type_id,status,title,description,monthly_rent,room_area_sqm,address_text,area_name,latitude,longitude,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    values: [
      landlordId,
      draft ? null : await lookup("property_types", "STUDIO"),
      status,
      draft ? null : `Listing ${sequence}`,
      draft ? null : `Description ${sequence}`,
      draft ? null : "7500000",
      draft ? null : "28.50",
      draft ? null : `RM041_PRIVATE_ADDRESS_${sequence}`,
      draft ? null : "District 1",
      draft ? null : 10.772341,
      draft ? null : 106.697912,
      updatedAt
    ]
  });
  return response.rows[0]!.id;
}

async function session(adminId: number): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => seconds }).sign({
    userId: adminId,
    role: "ADMIN"
  });
  return `rentmate_session=${token}`;
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

beforeAll(async () => {
  await cleanSchema();
  await executeMigrationPlan(pool, createMigrationPlan("clean", await discoverMigrations(migrationDirectory)));
});
beforeEach(resetRows);
afterAll(async () => {
  await cleanSchema();
  await closeDatabasePool(pool);
});

describe("RM-041 PostgreSQL admin listing reads", () => {
  it("filters every status, defaults PENDING, includes inactive landlords, and uses stable pages", async () => {
    const admin = await user("ADMIN", 1);
    const activeOwner = await user("LANDLORD", 1);
    const inactiveOwner = await user("LANDLORD", 2, false);
    const ids = new Map<string, number>();
    for (const [index, status] of ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"].entries()) {
      ids.set(
        status,
        await listing(
          status === "PENDING" ? inactiveOwner : activeOwner,
          status as Parameters<typeof listing>[1],
          index
        )
      );
    }
    const higherPending = await listing(activeOwner, "PENDING", 99);
    const application = await app();
    const auth = await session(admin);
    const defaultResponse = await request(application)
      .get("/api/v1/admin/listings?pageSize=1")
      .set("Cookie", auth)
      .expect(200);
    expect(defaultResponse.body.data[0].id).toBe(higherPending);
    expect(defaultResponse.body.pagination.hasNextPage).toBe(true);
    const second = await request(application)
      .get("/api/v1/admin/listings?page=2&pageSize=1")
      .set("Cookie", auth)
      .expect(200);
    expect(second.body.data[0]).toMatchObject({ id: ids.get("PENDING"), landlord: { isActive: false } });
    for (const status of ["DRAFT", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"]) {
      const response = await request(application)
        .get(`/api/v1/admin/listings?status=${status}`)
        .set("Cookie", auth)
        .expect(200);
      expect(response.body.data.map((item: { status: string }) => item.status)).toStrictEqual([status]);
    }
    const draft = await request(application).get("/api/v1/admin/listings?status=DRAFT").set("Cookie", auth).expect(200);
    expect(draft.body.data[0]).toMatchObject({ title: null, areaName: null });
  });

  it("returns exact inactive-owner detail with retired lookups, ordered images, and latest current reason", async () => {
    const admin = await user("ADMIN", 10);
    const owner = await user("LANDLORD", 10, false);
    const listingId = await listing(owner, "REJECTED", 10);
    const wifi = await lookup("amenities", "WIFI");
    await pool.query("INSERT INTO listing_amenities (listing_id,amenity_id) VALUES ($1,$2)", [listingId, wifi]);
    await pool.query("UPDATE property_types SET is_active=false WHERE code='STUDIO'");
    await pool.query("UPDATE amenities SET is_active=false WHERE code='WIFI'");
    await pool.query({
      text: `INSERT INTO listing_images
        (listing_id,cloudinary_public_id,secure_url,format,width,height,byte_size,display_order,alt_text)
        VALUES ($1,$2,$3,'webp',800,600,1000,2,NULL),($1,$4,$5,'webp',900,700,1100,1,'Cover')`,
      values: [
        listingId,
        "RM041_PROVIDER_SENTINEL_A",
        "https://cdn.example.test/a.webp",
        "RM041_PROVIDER_SENTINEL_B",
        "https://cdn.example.test/b.webp"
      ]
    });
    await pool.query({
      text: `INSERT INTO moderation_history (listing_id,admin_id,previous_status,new_status,reason,created_at)
        VALUES ($1,$2,'PENDING','REJECTED','Older','2026-08-08T00:00:00Z'),
               ($1,$2,'PENDING','REJECTED','Latest','2026-08-09T00:00:00Z')`,
      values: [listingId, admin]
    });
    const response = await request(await app())
      .get(`/api/v1/admin/listings/${listingId}`)
      .set("Cookie", await session(admin))
      .expect(200);
    expect(response.body.data).toMatchObject({
      id: listingId,
      addressText: "RM041_PRIVATE_ADDRESS_10",
      latitude: 10.772341,
      longitude: 106.697912,
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [{ code: "WIFI", label: "Wi-Fi" }],
      landlord: { role: "LANDLORD", isActive: false },
      currentModerationReason: "Latest"
    });
    expect(response.body.data.images.map((image: { displayOrder: number }) => image.displayOrder)).toStrictEqual([
      1, 2
    ]);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("RM041_PASSWORD_HASH_SENTINEL");
    expect(serialized).not.toContain("RM041_PROVIDER_SENTINEL");
  });

  it("distinguishes missing from zero history and orders timestamp ties by history id", async () => {
    const admin = await user("ADMIN", 20);
    const owner = await user("LANDLORD", 20);
    const draft = await listing(owner, "DRAFT", 20);
    const application = await app();
    const auth = await session(admin);
    const empty = await request(application)
      .get(`/api/v1/admin/listings/${draft}/moderation-actions`)
      .set("Cookie", auth)
      .expect(200);
    expect(empty.body).toStrictEqual({ data: [], pagination: { page: 1, pageSize: 20, hasNextPage: false } });
    await request(application)
      .get("/api/v1/admin/listings/2147483647/moderation-actions")
      .set("Cookie", auth)
      .expect(404);

    const rejected = await listing(owner, "REJECTED", 21);
    const createdAt = "2026-08-09T00:00:00Z";
    await pool.query({
      text: `INSERT INTO moderation_history (listing_id,admin_id,previous_status,new_status,reason,created_at)
        VALUES ($1,$2,'PENDING','REJECTED','First',$3),($1,$2,'PENDING','REJECTED','Second',$3)`,
      values: [rejected, admin, createdAt]
    });
    const page1 = await request(application)
      .get(`/api/v1/admin/listings/${rejected}/moderation-actions?pageSize=1`)
      .set("Cookie", auth)
      .expect(200);
    const page2 = await request(application)
      .get(`/api/v1/admin/listings/${rejected}/moderation-actions?page=2&pageSize=1`)
      .set("Cookie", auth)
      .expect(200);
    expect(page1.body.data[0].id).toBeGreaterThan(page2.body.data[0].id);
    expect(page1.body.pagination.hasNextPage).toBe(true);
    expect(Object.keys(page1.body.data[0]).sort()).toStrictEqual(
      ["adminId", "createdAt", "id", "listingId", "newStatus", "previousStatus", "reason"].sort()
    );
  });

  it("keeps repository query counts bounded and read-only", async () => {
    const admin = await user("ADMIN", 30);
    const owner = await user("LANDLORD", 30);
    const ordinary = await listing(owner, "APPROVED", 30);
    const rejected = await listing(owner, "REJECTED", 31);
    await pool.query(
      "INSERT INTO moderation_history (listing_id,admin_id,previous_status,new_status,reason) VALUES ($1,$2,'PENDING','REJECTED','Reason')",
      [rejected, admin]
    );

    const queueExecutor = new CountingExecutor(realExecutor);
    await createAdminListingReadRepository(queueExecutor).findListingPage({ status: "APPROVED", limit: 21, offset: 0 });
    expect(queueExecutor.queries).toHaveLength(1);
    const ordinaryExecutor = new CountingExecutor(realExecutor);
    const ordinaryRepository = createAdminListingReadRepository(ordinaryExecutor);
    const base = await ordinaryRepository.findListingDetailBase(ordinary);
    await ordinaryRepository.findAmenitiesForListing(ordinary);
    await ordinaryRepository.findImagesForListing(ordinary);
    expect(base?.listing.status).toBe("APPROVED");
    expect(ordinaryExecutor.queries).toHaveLength(3);
    const historyExecutor = new CountingExecutor(realExecutor);
    const historyRepository = createAdminListingReadRepository(historyExecutor);
    expect(await historyRepository.listingExists(rejected)).toBe(true);
    await historyRepository.findModerationHistoryPage({ listingId: rejected, limit: 21, offset: 0 });
    expect(historyExecutor.queries).toHaveLength(2);
    const sql = [...queueExecutor.queries, ...ordinaryExecutor.queries, ...historyExecutor.queries]
      .map((query) => query.text)
      .join("\n");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|FOR UPDATE|BEGIN|COMMIT|ROLLBACK)\b/i);
  });
});
