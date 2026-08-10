import dotenv from "dotenv";
import path from "node:path";
import type { Express } from "express";
import type { QueryResultRow } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { closeDatabasePool } from "../src/db/pool.js";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
import { createFavoriteRepository } from "../src/modules/favorites/favorite-repository.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createPublicListingDetailRepository } from "../src/modules/listings/public-listing-detail-repository.js";
import { createPublicListingSearchRepository } from "../src/modules/listings/public-listing-search-repository.js";
import { validatePublicListingSearch } from "../src/modules/listings/public-listing-search-validation.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import { createAdminUserRepository } from "../src/modules/users/admin-user-repository.js";
import { createAdminUserService } from "../src/modules/users/admin-user-service.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const origin = "http://localhost:3000";
const secret = "rm043-database-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const pool = createTestDatabasePool(process.env, { max: 6 });
const executor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
let application: Express;
let sequence = 0;

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
  await pool.query("DELETE FROM favorites");
  await pool.query("DELETE FROM listing_amenities");
  await pool.query("DELETE FROM listing_images");
  await pool.query("DELETE FROM listings");
  await pool.query("DELETE FROM users");
}

async function insertUser(role: UserRole, active = true, timestamp = "2020-01-01T00:00:00Z"): Promise<number> {
  sequence += 1;
  const result = await pool.query<{ id: number }>({
    text: `
      INSERT INTO users (role,email,phone_e164,password_hash,is_active,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$6)
      RETURNING id
    `,
    values: [
      role,
      `rm043.${role.toLowerCase()}.${sequence}@example.com`,
      role === "LANDLORD" ? `+8496${String(sequence).padStart(8, "0")}` : null,
      `PASSWORD_HASH_SENTINEL_${sequence}`,
      active,
      timestamp
    ]
  });
  return result.rows[0]!.id;
}

async function insertListing(landlordId: number, status: ListingStatus): Promise<number> {
  sequence += 1;
  const result = await pool.query<{ id: number }>({
    text: `
      INSERT INTO listings
        (landlord_id,property_type_id,status,title,description,monthly_rent,room_area_sqm,address_text,area_name,latitude,longitude,created_at,updated_at)
      VALUES
        ($1,(SELECT id FROM property_types WHERE code='STUDIO'),$2,$3,'Description',5000000,25,'Private address','District 1',10.75,106.67,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z')
      RETURNING id
    `,
    values: [landlordId, status, `RM-043 listing ${sequence}`]
  });
  return result.rows[0]!.id;
}

function transactionRunner(counter?: { updates: number }): TransactionRunner {
  return async (operation) =>
    withTransaction(pool, logger, async (transaction) => {
      const countingExecutor: SqlExecutor = counter
        ? {
            async query<Row extends QueryResultRow>(query: ParameterizedQuery) {
              if (/^\s*UPDATE users\b/i.test(query.text)) counter.updates += 1;
              return transaction.query<Row>(query);
            }
          }
        : transaction;
      return operation(countingExecutor);
    });
}

function adminService(counter?: { updates: number }) {
  return createAdminUserService({
    repository: createAdminUserRepository(executor),
    transactionRunner: transactionRunner(counter)
  });
}

async function token(userId: number, role: UserRole): Promise<string> {
  const signed = await createSessionTokenService({ secret, nowSeconds: () => seconds }).sign({ userId, role });
  return `rentmate_session=${signed}`;
}

async function storedUser(userId: number) {
  return (
    await pool.query<{
      id: number;
      role: UserRole;
      email: string;
      phone_e164: string | null;
      password_hash: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>("SELECT id,role,email,phone_e164,password_hash,is_active,created_at,updated_at FROM users WHERE id=$1", [userId])
  ).rows[0]!;
}

beforeAll(async () => {
  await cleanSchema();
  await executeMigrationPlan(pool, createMigrationPlan("clean", await discoverMigrations(migrationDirectory)));
  application = await createBackendApp({
    frontendOrigin: origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds,
    transactionRunner: transactionRunner()
  });
});
beforeEach(resetRows);
afterAll(async () => {
  await cleanSchema();
  await closeDatabasePool(pool);
});

describe("RM-043 PostgreSQL admin users", () => {
  it("lists all roles and activation states with AND filters, stable ordering, and one limit-plus-one query", async () => {
    const oldestTenant = await insertUser("TENANT", true, "2020-01-01T00:00:00Z");
    const tiedLandlord = await insertUser("LANDLORD", false, "2020-01-02T00:00:00Z");
    const tiedAdmin = await insertUser("ADMIN", true, "2020-01-02T00:00:00Z");
    const inactiveAdmin = await insertUser("ADMIN", false, "2020-01-03T00:00:00Z");
    const calls: string[] = [];
    const counting: SqlExecutor = {
      async query<Row extends QueryResultRow>(query: ParameterizedQuery) {
        calls.push(query.text);
        return executor.query<Row>(query);
      }
    };
    const repository = createAdminUserRepository(counting);
    const all = await repository.findUserPage({ role: null, isActive: null, limit: 10, offset: 0 });
    expect(all.map((user) => user.id)).toStrictEqual([inactiveAdmin, tiedAdmin, tiedLandlord, oldestTenant]);
    expect(all.map((user) => user.role)).toStrictEqual(["ADMIN", "ADMIN", "LANDLORD", "TENANT"]);
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(all)).not.toMatch(/PASSWORD_HASH_SENTINEL|password_hash|phone_e164/);
    await expect(
      repository.findUserPage({ role: "ADMIN", isActive: false, limit: 2, offset: 0 })
    ).resolves.toMatchObject([{ id: inactiveAdmin, role: "ADMIN", isActive: false }]);
  });

  it("preserves exact timestamp on no-op and changes only activation state/timestamp on meaningful updates", async () => {
    const adminId = await insertUser("ADMIN");
    for (const role of ["TENANT", "LANDLORD"] as const) {
      for (const initial of [true, false]) {
        const targetId = await insertUser(role, initial);
        const before = await storedUser(targetId);
        const counter = { updates: 0 };
        const service = adminService(counter);
        await expect(
          service.setActivation({ userId: adminId, role: "ADMIN" }, targetId, { isActive: initial })
        ).resolves.toMatchObject({ id: targetId, role, isActive: initial });
        expect(await storedUser(targetId)).toStrictEqual(before);
        expect(counter.updates).toBe(0);

        await expect(
          service.setActivation({ userId: adminId, role: "ADMIN" }, targetId, { isActive: !initial })
        ).resolves.toMatchObject({ id: targetId, role, isActive: !initial });
        const after = await storedUser(targetId);
        expect(after).toMatchObject({
          id: before.id,
          role: before.role,
          email: before.email,
          phone_e164: before.phone_e164,
          password_hash: before.password_hash,
          is_active: !initial,
          created_at: before.created_at
        });
        expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
        expect(counter.updates).toBe(1);
      }
    }
  });

  it("distinguishes missing and forbidden ADMIN targets without durable mutation", async () => {
    const callerId = await insertUser("ADMIN");
    await expect(
      adminService().setActivation({ userId: callerId, role: "ADMIN" }, 2_147_483_647, { isActive: false })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    for (const targetId of [callerId, await insertUser("ADMIN", false)]) {
      const before = await storedUser(targetId);
      await expect(
        adminService().setActivation({ userId: callerId, role: "ADMIN" }, targetId, { isActive: !before.is_active })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await storedUser(targetId)).toStrictEqual(before);
    }
  });

  it("serializes concurrent same-value activation into one update and one no-op", async () => {
    const adminId = await insertUser("ADMIN");
    const targetId = await insertUser("LANDLORD", true);
    const counter = { updates: 0 };
    const service = adminService(counter);
    const results = await Promise.all([
      service.setActivation({ userId: adminId, role: "ADMIN" }, targetId, { isActive: false }),
      service.setActivation({ userId: adminId, role: "ADMIN" }, targetId, { isActive: false })
    ]);
    expect(results.map((profile) => profile.isActive)).toStrictEqual([false, false]);
    expect((await storedUser(targetId)).is_active).toBe(false);
    expect(counter.updates).toBe(1);
  });

  it("invalidates an existing JWT while inactive and allows the same unexpired JWT after reactivation", async () => {
    const adminId = await insertUser("ADMIN");
    const tenantId = await insertUser("TENANT", true);
    const tenantCookie = await token(tenantId, "TENANT");
    const adminCookie = await token(adminId, "ADMIN");
    await request(application).get("/api/v1/users/me").set("Cookie", tenantCookie).expect(200);
    await request(application)
      .patch(`/api/v1/admin/users/${tenantId}/activation`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ isActive: false })
      .expect(200);
    await request(application).get("/api/v1/users/me").set("Cookie", tenantCookie).expect(401);
    await request(application)
      .patch(`/api/v1/admin/users/${tenantId}/activation`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ isActive: true })
      .expect(200);
    await request(application).get("/api/v1/users/me").set("Cookie", tenantCookie).expect(200);
  });

  it("suppresses and restores landlord public/favorite visibility without touching listings, history, or favorites", async () => {
    const adminId = await insertUser("ADMIN");
    const landlordId = await insertUser("LANDLORD", true);
    const tenantId = await insertUser("TENANT", true);
    const statuses = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const;
    const listingIds = await Promise.all(statuses.map((status) => insertListing(landlordId, status)));
    const approvedId = listingIds[2]!;
    await pool.query(
      "INSERT INTO listing_images (listing_id,cloudinary_public_id,secure_url,format,width,height,byte_size,display_order) VALUES ($1,$2,$3,'webp',800,600,1000,1)",
      [approvedId, `rm043-public-${approvedId}`, `https://cdn.example.test/rm043-${approvedId}.webp`]
    );
    await pool.query("INSERT INTO favorites (tenant_id,listing_id) VALUES ($1,$2)", [tenantId, approvedId]);
    const listingSnapshot = (
      await pool.query<{ id: number; status: ListingStatus; updated_at: Date }>(
        "SELECT id,status,updated_at FROM listings WHERE landlord_id=$1 ORDER BY id",
        [landlordId]
      )
    ).rows;
    const search = validatePublicListingSearch({});
    if (search.mode !== "ordinary") throw new Error("Expected ordinary public search.");
    const searchRepository = createPublicListingSearchRepository(executor);
    const detailRepository = createPublicListingDetailRepository(executor);
    const favoriteRepository = createFavoriteRepository(executor);
    await expect(searchRepository.findOrdinaryPage(search)).resolves.toHaveLength(1);
    await expect(detailRepository.findPublicDetailById(approvedId, false)).resolves.not.toBeNull();
    await expect(favoriteRepository.findPage({ tenantId, pageSize: 20, offset: 0 })).resolves.toHaveLength(1);

    await adminService().setActivation({ userId: adminId, role: "ADMIN" }, landlordId, { isActive: false });
    await expect(searchRepository.findOrdinaryPage(search)).resolves.toHaveLength(0);
    await expect(detailRepository.findPublicDetailById(approvedId, false)).resolves.toBeNull();
    await expect(favoriteRepository.findPage({ tenantId, pageSize: 20, offset: 0 })).resolves.toHaveLength(0);
    expect(
      (await pool.query("SELECT 1 FROM favorites WHERE tenant_id=$1 AND listing_id=$2", [tenantId, approvedId]))
        .rowCount
    ).toBe(1);
    expect((await pool.query("SELECT 1 FROM moderation_history")).rowCount).toBe(0);
    expect(
      (await pool.query("SELECT id,status,updated_at FROM listings WHERE landlord_id=$1 ORDER BY id", [landlordId]))
        .rows
    ).toStrictEqual(listingSnapshot);

    await adminService().setActivation({ userId: adminId, role: "ADMIN" }, landlordId, { isActive: true });
    await expect(searchRepository.findOrdinaryPage(search)).resolves.toHaveLength(1);
    await expect(detailRepository.findPublicDetailById(approvedId, false)).resolves.not.toBeNull();
    await expect(favoriteRepository.findPage({ tenantId, pageSize: 20, offset: 0 })).resolves.toHaveLength(1);
    expect(
      (await pool.query("SELECT 1 FROM favorites WHERE tenant_id=$1 AND listing_id=$2", [tenantId, approvedId]))
        .rowCount
    ).toBe(1);
  });

  it("retains tenant favorites while deactivation removes protected access", async () => {
    const adminId = await insertUser("ADMIN");
    const tenantId = await insertUser("TENANT", true);
    const landlordId = await insertUser("LANDLORD", true);
    const listingId = await insertListing(landlordId, "APPROVED");
    await pool.query("INSERT INTO favorites (tenant_id,listing_id) VALUES ($1,$2)", [tenantId, listingId]);
    await adminService().setActivation({ userId: adminId, role: "ADMIN" }, tenantId, { isActive: false });
    expect(
      (await pool.query("SELECT 1 FROM favorites WHERE tenant_id=$1 AND listing_id=$2", [tenantId, listingId])).rowCount
    ).toBe(1);
    await request(application)
      .get("/api/v1/favorites")
      .set("Cookie", await token(tenantId, "TENANT"))
      .expect(401);
  });
});
