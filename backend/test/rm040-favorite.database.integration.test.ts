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
const origin = "http://localhost:3000";
const secret = "rm040-database-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

type Status = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "INACTIVE" | "HIDDEN";

interface ListingOptions {
  readonly status?: Status;
  readonly propertyType?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly address?: string;
  readonly image?: boolean;
}

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

async function insertUser(
  role: UserRole,
  sequence: number,
  options: Readonly<{
    active?: boolean;
    email?: string;
    phone?: string | null;
    passwordHash?: string;
  }> = {}
): Promise<number> {
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO users (role, email, phone_e164, password_hash, is_active)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
    values: [
      role,
      options.email ?? `rm040.${role.toLowerCase()}.${sequence}@example.com`,
      options.phone === undefined
        ? role === "LANDLORD"
          ? `+8497${String(sequence).padStart(8, "0")}`
          : null
        : options.phone,
      options.passwordHash ?? "rm040-test-hash",
      options.active ?? true
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

async function insertImage(
  listingId: number,
  sequence: number,
  displayOrder: number,
  publicId = `rm040-provider-${sequence}`,
  url = `https://cdn.example.test/rm040-${sequence}.webp`
): Promise<number> {
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO listing_images
      (listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order, alt_text)
      VALUES ($1,$2,$3,'webp',800,600,1000,$4,$5)
      RETURNING id`,
    values: [listingId, publicId, url, displayOrder, `Room ${displayOrder}`]
  });
  return response.rows[0]!.id;
}

async function insertListing(landlordId: number, sequence: number, options: ListingOptions = {}): Promise<number> {
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO listings (
      landlord_id, property_type_id, status, title, description, monthly_rent,
      room_area_sqm, address_text, area_name, latitude, longitude, updated_at
    ) VALUES ($1,$2,$3,$4,$5,'7500000','28.50',$6,'District 1',$7,$8,$9)
    RETURNING id`,
    values: [
      landlordId,
      await lookupId("property_types", options.propertyType ?? "STUDIO"),
      options.status ?? "APPROVED",
      `RM040 listing ${sequence}`,
      `RM040 description ${sequence}`,
      options.address ?? `RM040 private address ${sequence}`,
      options.latitude ?? 10.772549,
      options.longitude ?? 106.697912,
      "2026-08-01T07:15:00.000Z"
    ]
  });
  const listingId = response.rows[0]!.id;
  if (options.image !== false) await insertImage(listingId, sequence, 1);
  return listingId;
}

async function insertFavorite(tenantId: number, listingId: number, createdAt: string): Promise<void> {
  await pool.query({
    text: "INSERT INTO favorites (tenant_id, listing_id, created_at) VALUES ($1, $2, $3)",
    values: [tenantId, listingId, createdAt]
  });
}

async function favoriteState(
  tenantId: number,
  listingId: number
): Promise<{ count: string; createdAt: string | null }> {
  const response = await pool.query<{ count: string; created_at: Date | null }>({
    text: `SELECT count(*)::text AS count, min(created_at) AS created_at
           FROM favorites WHERE tenant_id = $1 AND listing_id = $2`,
    values: [tenantId, listingId]
  });
  return { count: response.rows[0]!.count, createdAt: response.rows[0]!.created_at?.toISOString() ?? null };
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

async function getFavorites(tenantId: number, query = ""): Promise<request.Response> {
  return request(await makeApp())
    .get(`/api/v1/favorites${query}`)
    .set("Cookie", await session(tenantId, "TENANT"));
}

function responseIds(response: request.Response): number[] {
  return (response.body.data as Array<{ id: number }>).map((item) => item.id);
}

async function nonFavoriteSnapshot(landlordId: number, listingId: number): Promise<string> {
  const [listing, landlord, history, images, amenities] = await Promise.all([
    pool.query("SELECT * FROM listings WHERE id = $1", [listingId]),
    pool.query("SELECT * FROM users WHERE id = $1", [landlordId]),
    pool.query("SELECT * FROM moderation_history WHERE listing_id = $1 ORDER BY id", [listingId]),
    pool.query("SELECT * FROM listing_images WHERE listing_id = $1 ORDER BY id", [listingId]),
    pool.query("SELECT * FROM listing_amenities WHERE listing_id = $1 ORDER BY amenity_id", [listingId])
  ]);
  return JSON.stringify([listing.rows, landlord.rows, history.rows, images.rows, amenities.rows]);
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

describe("RM-040 PostgreSQL favorite acceptance", () => {
  it("returns only APPROVED listings of active landlords while retaining every hidden relationship", async () => {
    const tenant = await insertUser("TENANT", 1);
    const activeOwner = await insertUser("LANDLORD", 1);
    const inactiveOwner = await insertUser("LANDLORD", 2, { active: false });
    const visible = await insertListing(activeOwner, 1);
    const hidden: number[] = [];
    for (const [index, status] of (["DRAFT", "PENDING", "REJECTED", "HIDDEN", "INACTIVE"] as const).entries()) {
      hidden.push(await insertListing(activeOwner, 10 + index, { status }));
    }
    hidden.push(await insertListing(inactiveOwner, 20));
    for (const [index, listingId] of [visible, ...hidden].entries()) {
      await insertFavorite(tenant, listingId, `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`);
    }

    const response = await getFavorites(tenant);
    expect(response.status).toBe(200);
    expect(responseIds(response)).toStrictEqual([visible]);
    const stored = await pool.query<{ count: string }>("SELECT count(*) FROM favorites WHERE tenant_id = $1", [tenant]);
    expect(stored.rows[0]?.count).toBe("7");
  });

  it("retains and restores HIDDEN, PENDING, and INACTIVE favorites without changing created_at", async () => {
    const tenant = await insertUser("TENANT", 30);
    const owner = await insertUser("LANDLORD", 30);
    const fixtures = await Promise.all(
      (["HIDDEN", "PENDING", "INACTIVE"] as const).map(async (status, index) => {
        const listingId = await insertListing(owner, 30 + index);
        await insertFavorite(tenant, listingId, `2026-09-0${index + 1}T00:00:00.000Z`);
        return { status, listingId, before: await favoriteState(tenant, listingId) };
      })
    );
    expect(responseIds(await getFavorites(tenant))).toHaveLength(3);

    for (const fixture of fixtures) {
      await pool.query("UPDATE listings SET status = $1 WHERE id = $2", [fixture.status, fixture.listingId]);
      expect(responseIds(await getFavorites(tenant))).not.toContain(fixture.listingId);
      expect(await favoriteState(tenant, fixture.listingId)).toStrictEqual(fixture.before);
      await pool.query("UPDATE listings SET status = 'APPROVED' WHERE id = $1", [fixture.listingId]);
      expect(responseIds(await getFavorites(tenant))).toContain(fixture.listingId);
      expect(await favoriteState(tenant, fixture.listingId)).toStrictEqual(fixture.before);
    }
  });

  it("hides and restores a favorite solely through landlord activity without status, history, or timestamp changes", async () => {
    const tenant = await insertUser("TENANT", 40);
    const owner = await insertUser("LANDLORD", 40);
    const listing = await insertListing(owner, 40);
    await insertFavorite(tenant, listing, "2026-09-10T00:00:00.000Z");
    const before = await favoriteState(tenant, listing);

    expect(responseIds(await getFavorites(tenant))).toContain(listing);
    await pool.query("UPDATE users SET is_active = false WHERE id = $1", [owner]);
    expect(responseIds(await getFavorites(tenant))).not.toContain(listing);
    expect(await favoriteState(tenant, listing)).toStrictEqual(before);
    const unchanged = await pool.query<{ status: string; history_count: string }>({
      text: `SELECT l.status, count(mh.id)::text AS history_count
             FROM listings AS l LEFT JOIN moderation_history AS mh ON mh.listing_id = l.id
             WHERE l.id = $1 GROUP BY l.status`,
      values: [listing]
    });
    expect(unchanged.rows[0]).toStrictEqual({ status: "APPROVED", history_count: "0" });
    await pool.query("UPDATE users SET is_active = true WHERE id = $1", [owner]);
    expect(responseIds(await getFavorites(tenant))).toContain(listing);
    expect(await favoriteState(tenant, listing)).toStrictEqual(before);
  });

  it("gives identical PUT 404s to every non-public target and preserves one timestamp across three PUTs", async () => {
    const tenant = await insertUser("TENANT", 50);
    const activeOwner = await insertUser("LANDLORD", 50);
    const inactiveOwner = await insertUser("LANDLORD", 51, { active: false });
    const visible = await insertListing(activeOwner, 50);
    const nonPublic: number[] = [];
    for (const [index, status] of (["DRAFT", "PENDING", "REJECTED", "HIDDEN", "INACTIVE"] as const).entries()) {
      nonPublic.push(await insertListing(activeOwner, 60 + index, { status }));
    }
    nonPublic.push(await insertListing(inactiveOwner, 70));
    const application = await makeApp();
    const auth = await session(tenant, "TENANT");

    let original: { count: string; createdAt: string | null } | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(application)
        .put(`/api/v1/favorites/${visible}`)
        .set("Origin", origin)
        .set("Cookie", auth)
        .expect(204);
      const current = await favoriteState(tenant, visible);
      original ??= current;
      expect(current).toStrictEqual(original);
    }
    expect(original?.count).toBe("1");

    for (const listingId of [...nonPublic, 2_147_483_647]) {
      const response = await request(application)
        .put(`/api/v1/favorites/${listingId}`)
        .set("Origin", origin)
        .set("Cookie", auth)
        .expect(404);
      expect(response.body.error).toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found."
      });
      expect(response.body.error.details).toBeUndefined();
      expect((await favoriteState(tenant, listingId)).count).toBe("0");
    }
  });

  it("converges DELETE for existing, absent, non-public, inactive-owner, missing, and hard-deleted targets", async () => {
    const tenant = await insertUser("TENANT", 80);
    const owner = await insertUser("LANDLORD", 80);
    const inactiveOwner = await insertUser("LANDLORD", 81, { active: false });
    const targets = [
      await insertListing(owner, 80),
      await insertListing(owner, 81, { status: "HIDDEN" }),
      await insertListing(owner, 82, { status: "PENDING" }),
      await insertListing(owner, 83, { status: "INACTIVE" }),
      await insertListing(inactiveOwner, 84)
    ];
    for (const [index, listingId] of targets.entries()) {
      await insertFavorite(tenant, listingId, `2026-10-0${index + 1}T00:00:00.000Z`);
    }
    const deletedListing = await insertListing(owner, 85, { status: "DRAFT" });
    await insertFavorite(tenant, deletedListing, "2026-10-10T00:00:00.000Z");
    await pool.query("DELETE FROM listings WHERE id = $1", [deletedListing]);
    expect((await favoriteState(tenant, deletedListing)).count).toBe("0");

    const application = await makeApp();
    const auth = await session(tenant, "TENANT");
    for (const listingId of [...targets, targets[0]!, targets[0]!, 2_147_483_647, deletedListing]) {
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

  it("isolates tenant relationships for collection, DELETE, and PUT", async () => {
    const tenantA = await insertUser("TENANT", 90);
    const tenantB = await insertUser("TENANT", 91);
    const owner = await insertUser("LANDLORD", 90);
    const listing = await insertListing(owner, 90);
    const application = await makeApp();
    const authA = await session(tenantA, "TENANT");
    const authB = await session(tenantB, "TENANT");

    await request(application)
      .put(`/api/v1/favorites/${listing}`)
      .set("Origin", origin)
      .set("Cookie", authA)
      .expect(204);
    expect(responseIds(await getFavorites(tenantA))).toStrictEqual([listing]);
    expect(responseIds(await getFavorites(tenantB))).toStrictEqual([]);
    await request(application)
      .delete(`/api/v1/favorites/${listing}`)
      .set("Origin", origin)
      .set("Cookie", authB)
      .expect(204);
    expect((await favoriteState(tenantA, listing)).count).toBe("1");
    await request(application)
      .put(`/api/v1/favorites/${listing}`)
      .set("Origin", origin)
      .set("Cookie", authB)
      .expect(204);
    const rows = await pool.query<{ tenant_id: number }>(
      "SELECT tenant_id FROM favorites WHERE listing_id = $1 ORDER BY tenant_id",
      [listing]
    );
    expect(rows.rows.map((row) => row.tenant_id)).toStrictEqual([tenantA, tenantB].sort((a, b) => a - b));
  });

  it("keeps hidden rows out of stable pages and returns only the exact privacy-safe ordered projection", async () => {
    const privateAddress = "RM040_PRIVATE_ADDRESS_SENTINEL";
    const privateEmail = "rm040.private.owner@example.com";
    const privatePhone = "+849799999999";
    const privatePassword = "RM040_PRIVATE_PASSWORD_SENTINEL";
    const privateProvider = "rm040-private-provider-sentinel";
    const privateModeration = "RM040_PRIVATE_MODERATION_SENTINEL";
    const privateFavoriteTime = "2099-12-31T23:59:59.000Z";
    const tenant = await insertUser("TENANT", 100);
    const owner = await insertUser("LANDLORD", 100, {
      email: privateEmail,
      phone: privatePhone,
      passwordHash: privatePassword
    });
    const admin = await insertUser("ADMIN", 100);
    const olderA = await insertListing(owner, 100);
    const olderB = await insertListing(owner, 101);
    const tiedLow = await insertListing(owner, 102);
    const tiedHigh = await insertListing(owner, 103, {
      image: false,
      address: privateAddress,
      latitude: 10.772549,
      longitude: 106.697912
    });
    const hiddenNewest = await insertListing(owner, 104, { status: "HIDDEN" });
    await insertImage(tiedHigh, 201, 2);
    await pool.query("SELECT setval('listing_images_id_seq', 987654320, true)");
    const coverImageId = await insertImage(
      tiedHigh,
      202,
      1,
      privateProvider,
      "https://cdn.example.test/rm040-selected-cover.webp"
    );
    for (const code of ["WIFI", "AIR_CONDITIONING", "FURNISHED"]) {
      await pool.query("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2)", [
        tiedHigh,
        await lookupId("amenities", code)
      ]);
    }
    await pool.query("UPDATE property_types SET is_active = false WHERE code = 'STUDIO'");
    await pool.query("UPDATE amenities SET is_active = false WHERE code = 'WIFI'");
    await pool.query({
      text: `INSERT INTO moderation_history
        (listing_id, admin_id, previous_status, new_status, reason)
        VALUES ($1,$2,'APPROVED','HIDDEN',$3)`,
      values: [tiedHigh, admin, privateModeration]
    });
    await insertFavorite(tenant, olderA, "2026-11-01T00:00:00.000Z");
    await insertFavorite(tenant, olderB, "2026-11-02T00:00:00.000Z");
    await insertFavorite(tenant, tiedLow, "2026-11-03T00:00:00.000Z");
    await insertFavorite(tenant, tiedHigh, "2026-11-03T00:00:00.000Z");
    await insertFavorite(tenant, hiddenNewest, privateFavoriteTime);

    const page1 = await getFavorites(tenant, "?page=1&pageSize=2");
    const page2 = await getFavorites(tenant, "?page=2&pageSize=2");
    const page1Again = await getFavorites(tenant, "?page=1&pageSize=2");
    const page2Again = await getFavorites(tenant, "?page=2&pageSize=2");
    expect(responseIds(page1)).toStrictEqual([tiedHigh, tiedLow]);
    expect(responseIds(page2)).toStrictEqual([olderB, olderA]);
    expect(responseIds(page1Again)).toStrictEqual(responseIds(page1));
    expect(responseIds(page2Again)).toStrictEqual(responseIds(page2));
    expect(page1.body.pagination).toStrictEqual({ page: 1, pageSize: 2, hasNextPage: true });
    expect(page2.body.pagination).toStrictEqual({ page: 2, pageSize: 2, hasNextPage: false });
    expect(new Set([...responseIds(page1), ...responseIds(page2)]).size).toBe(4);
    expect(responseIds(page1)).not.toContain(hiddenNewest);

    const item = page1.body.data[0];
    expect(Object.keys(item).sort()).toStrictEqual([
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
    expect(item.latitude).toBe(10.773);
    expect(item.longitude).toBe(106.698);
    expect(item.propertyType).toStrictEqual({ code: "STUDIO", label: "Studio" });
    expect(item.coverImage).toStrictEqual({
      url: "https://cdn.example.test/rm040-selected-cover.webp",
      altText: "Room 1",
      displayOrder: 1
    });
    expect(Object.keys(item.coverImage).sort()).toStrictEqual(["altText", "displayOrder", "url"]);
    expect(item.amenities).toStrictEqual([
      { code: "AIR_CONDITIONING", label: "Air conditioning" },
      { code: "FURNISHED", label: "Furnished" },
      { code: "WIFI", label: "Wi-Fi" }
    ]);
    expect(page1.body.pagination).not.toHaveProperty("total");
    expect(page1.body.pagination).not.toHaveProperty("totalCount");
    expect(page1.body.pagination).not.toHaveProperty("pageCount");
    expect(item).not.toHaveProperty("landlordContact");
    const serialized = JSON.stringify(page1.body);
    for (const sentinel of [
      privateAddress,
      privateEmail,
      privatePhone,
      privatePassword,
      privateProvider,
      privateModeration,
      privateFavoriteTime,
      String(coverImageId),
      "10.772549",
      "106.697912"
    ]) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  it("keeps repository query count at one for 1, 5, and 10 rows and for each mutation", async () => {
    const owner = await insertUser("LANDLORD", 120);
    const listings: number[] = [];
    for (let index = 0; index < 10; index += 1) listings.push(await insertListing(owner, 120 + index));

    for (const count of [1, 5, 10]) {
      const tenant = await insertUser("TENANT", 120 + count);
      for (let index = 0; index < count; index += 1) {
        await insertFavorite(tenant, listings[index]!, `2026-12-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`);
      }
      const executor = new CountingExecutor(realExecutor);
      const rows = await createFavoriteRepository(executor).findPage({ tenantId: tenant, pageSize: 20, offset: 0 });
      expect(rows).toHaveLength(count);
      expect(executor.queries).toHaveLength(1);
    }

    const mutationTenant = await insertUser("TENANT", 140);
    const putExecutor = new CountingExecutor(realExecutor);
    await createFavoriteRepository(putExecutor).ensurePresent(mutationTenant, listings[0]!);
    expect(putExecutor.queries).toHaveLength(1);
    const deleteExecutor = new CountingExecutor(realExecutor);
    await createFavoriteRepository(deleteExecutor).ensureAbsent(mutationTenant, listings[0]!);
    expect(deleteExecutor.queries).toHaveLength(1);
  });

  it("mutates only the favorites relationship during PUT and DELETE", async () => {
    const tenant = await insertUser("TENANT", 150);
    const owner = await insertUser("LANDLORD", 150);
    const listing = await insertListing(owner, 150);
    await pool.query("INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2)", [
      listing,
      await lookupId("amenities", "WIFI")
    ]);
    const before = await nonFavoriteSnapshot(owner, listing);
    const application = await makeApp();
    const auth = await session(tenant, "TENANT");
    await request(application)
      .put(`/api/v1/favorites/${listing}`)
      .set("Origin", origin)
      .set("Cookie", auth)
      .expect(204);
    expect((await favoriteState(tenant, listing)).count).toBe("1");
    expect(await nonFavoriteSnapshot(owner, listing)).toBe(before);
    await request(application)
      .delete(`/api/v1/favorites/${listing}`)
      .set("Origin", origin)
      .set("Cookie", auth)
      .expect(204);
    expect((await favoriteState(tenant, listing)).count).toBe("0");
    expect(await nonFavoriteSnapshot(owner, listing)).toBe(before);
  });
});
