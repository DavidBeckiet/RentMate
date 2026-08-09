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
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 4 });
const realExecutor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const origin = "http://localhost:3000";
const secret = "rm040-concurrency-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

class TwoQueryBarrierExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  private arrivals = 0;
  private release!: () => void;
  private readonly ready = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  constructor(private readonly delegate: SqlExecutor) {}

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    this.arrivals += 1;
    if (this.arrivals === 2) this.release();
    await this.ready;
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
}

async function seedPublicFavoriteTarget(): Promise<{ tenantId: number; listingId: number }> {
  const tenant = await pool.query<{ id: number }>(
    `INSERT INTO users (role, email, password_hash)
     VALUES ('TENANT', 'rm040.concurrent.tenant@example.com', 'test-hash') RETURNING id`
  );
  const landlord = await pool.query<{ id: number }>(
    `INSERT INTO users (role, email, phone_e164, password_hash)
     VALUES ('LANDLORD', 'rm040.concurrent.owner@example.com', '+849700000001', 'test-hash') RETURNING id`
  );
  const propertyType = await pool.query<{ id: number }>("SELECT id FROM property_types WHERE code = 'STUDIO'");
  const listing = await pool.query<{ id: number }>({
    text: `INSERT INTO listings (
      landlord_id, property_type_id, status, title, description, monthly_rent,
      room_area_sqm, address_text, area_name, latitude, longitude
    ) VALUES ($1,$2,'APPROVED','Concurrent studio','Description','7500000','28.50',
      'Private address','District 1',10.772549,106.697912) RETURNING id`,
    values: [landlord.rows[0]!.id, propertyType.rows[0]!.id]
  });
  await pool.query({
    text: `INSERT INTO listing_images
      (listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order)
      VALUES ($1,'rm040-concurrent-provider','https://cdn.example.test/concurrent.webp','webp',800,600,1000,1)`,
    values: [listing.rows[0]!.id]
  });
  return { tenantId: tenant.rows[0]!.id, listingId: listing.rows[0]!.id };
}

async function makeApp() {
  return createBackendApp({
    frontendOrigin: origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: realExecutor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds
  });
}

async function session(userId: number): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => seconds }).sign({
    userId,
    role: "TENANT"
  });
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

describe("RM-040 concurrent favorite PUT", () => {
  it("releases two real PostgreSQL statements together and converges to one original favorite", async () => {
    const { tenantId, listingId } = await seedPublicFavoriteTarget();
    const executor = new TwoQueryBarrierExecutor(realExecutor);
    const repository = createFavoriteRepository(executor);

    const outcomes = await Promise.all([
      repository.ensurePresent(tenantId, listingId),
      repository.ensurePresent(tenantId, listingId)
    ]);

    expect(executor.queries).toHaveLength(2);
    expect(outcomes.every((outcome) => outcome.isVisible)).toBe(true);
    expect(outcomes.filter((outcome) => outcome.wasInserted)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome.wasInserted)).toHaveLength(1);
    const stored = await pool.query<{ tenant_id: number; listing_id: number; created_at: Date }>(
      "SELECT tenant_id, listing_id, created_at FROM favorites WHERE tenant_id = $1 AND listing_id = $2",
      [tenantId, listingId]
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({ tenant_id: tenantId, listing_id: listingId });
    expect(stored.rows[0]?.created_at).toBeInstanceOf(Date);

    const response = await request(await makeApp())
      .get("/api/v1/favorites")
      .set("Cookie", await session(tenantId))
      .expect(200);
    expect(response.body.data.map((item: { id: number }) => item.id)).toStrictEqual([listingId]);
  });
});
