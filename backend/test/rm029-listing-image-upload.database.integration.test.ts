import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
import type { CloudinaryClient } from "../src/integrations/cloudinary.client.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import {
  createPhase4DatabaseFixture,
  phase4JwtSecret,
  phase4NowSeconds,
  phase4Origin,
  type Phase4DatabaseFixture
} from "./helpers/listings-phase4-fixture.js";

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
let fixture: Phase4DatabaseFixture;
let sequence = 0;

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: vi.fn(),
  error: () => undefined
};

interface ProviderFixture {
  readonly client: CloudinaryClient;
  readonly calls: string[];
  readonly removed: string[];
}

interface AppOptions {
  readonly provider?: ProviderFixture;
  readonly beforeUploadResult?: () => Promise<void>;
  readonly failImageInsert?: boolean;
  readonly transactionRunner?: TransactionRunner;
}

function createProvider(options: Readonly<{ removeFailureId?: string }> = {}): ProviderFixture {
  const calls: string[] = [];
  const removed: string[] = [];
  const client: CloudinaryClient = {
    uploadImage: vi.fn(async () => {
      calls.push("provider-upload");
      sequence += 1;
      return {
        publicId: `rm029/upload-${sequence}`,
        secureUrl: `https://provider.test/rm029/upload-${sequence}.jpg`,
        format: "jpg" as const,
        width: 1200,
        height: 800,
        byteSize: 100_000
      };
    }),
    removeImage: vi.fn(async (publicId) => {
      calls.push(`provider-remove:${publicId}`);
      removed.push(publicId);
      if (publicId === options.removeFailureId) throw new Error("synthetic private provider removal failure");
    })
  };
  return { client, calls, removed };
}

function faultingExecutor(delegate: SqlExecutor, failImageInsert: boolean): SqlExecutor {
  return {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      if (failImageInsert && query.text.includes("INSERT INTO listing_images")) {
        throw new Error("synthetic RM-029 metadata persistence failure");
      }
      return delegate.query<Row>(query);
    }
  };
}

async function createApp(
  options: AppOptions = {}
): Promise<{ app: Express; provider: ProviderFixture; calls: string[] }> {
  const provider = options.provider ?? createProvider();
  const calls = provider.calls;
  if (options.beforeUploadResult) {
    vi.mocked(provider.client.uploadImage).mockImplementationOnce(async () => {
      calls.push("provider-upload");
      await options.beforeUploadResult!();
      sequence += 1;
      return {
        publicId: `rm029/upload-${sequence}`,
        secureUrl: `https://provider.test/rm029/upload-${sequence}.jpg`,
        format: "jpg" as const,
        width: 1200,
        height: 800,
        byteSize: 100_000
      };
    });
  }
  const executor = createSqlExecutor(fixture.pool);
  const transactionRunner: TransactionRunner =
    options.transactionRunner ??
    (async (operation) => {
      calls.push("transaction-start");
      return withTransaction(fixture.pool, logger, async (transaction) =>
        operation(faultingExecutor(transaction, options.failImageInsert ?? false))
      );
    });
  const app = await createBackendApp({
    frontendOrigin: phase4Origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: phase4JwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => phase4NowSeconds,
    authRateLimitClock: () => 0,
    transactionRunner,
    cloudinaryClient: provider.client
  });
  return { app, provider, calls };
}

async function insertListing(landlordId: number, status: string): Promise<number> {
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude, updated_at
      )
      VALUES (
        $1, (SELECT id FROM property_types WHERE code = 'STUDIO'), $2::listing_status,
        'RM-029 listing', 'Listing image upload integration test', 5000000,
        25.50, 'Private address', 'District', 10.75, 106.67, '2000-01-01T00:00:00Z'
      )
      RETURNING id
    `,
    values: [landlordId, status]
  });
  return result.rows[0]!.id;
}

async function addImage(listingId: number, displayOrder: number, publicId?: string): Promise<string> {
  sequence += 1;
  const id = publicId ?? `rm029/seed-${sequence}`;
  await fixture.pool.query({
    text: `
      INSERT INTO listing_images (
        listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order
      ) VALUES ($1, $2, $3, 'jpg', 800, 600, 1234, $4)
    `,
    values: [listingId, id, `https://provider.test/${encodeURIComponent(id)}.jpg`, displayOrder]
  });
  return id;
}

async function upload(app: Express, landlordId: number, listingId: number, expectedStatus: number) {
  return request(app)
    .post(`/api/v1/landlord/listings/${listingId}/images`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${await fixture.signToken(landlordId)}`)
    .field("altText", "  Bedroom  ")
    .attach("image", jpeg, { filename: "room.jpg", contentType: "image/jpeg" })
    .expect(expectedStatus);
}

async function listingState(listingId: number) {
  const result = await fixture.pool.query<{
    status: string;
    updated_at: Date;
    image_count: number;
    history_count: number;
  }>({
    text: `
      SELECT l.status, l.updated_at,
        (SELECT count(*)::integer FROM listing_images WHERE listing_id = l.id) AS image_count,
        (SELECT count(*)::integer FROM moderation_history WHERE listing_id = l.id) AS history_count
      FROM listings AS l WHERE l.id = $1
    `,
    values: [listingId]
  });
  return result.rows[0] ?? null;
}

async function rollbackRunner(operation: (executor: SqlExecutor) => Promise<unknown>): Promise<never> {
  const client: PoolClient = await fixture.pool.connect();
  const executor = createSqlExecutor(client);
  try {
    await executor.query({ text: "BEGIN", values: [] });
    await operation(executor);
    await executor.query({ text: "ROLLBACK", values: [] });
    throw new Error("synthetic RM-029 commit failure");
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  fixture = createPhase4DatabaseFixture(migrationDirectory);
  await fixture.rebuildSchema();
});

beforeEach(async () => {
  await fixture.resetData();
  vi.mocked(logger.warn).mockClear();
});

afterAll(async () => {
  await fixture.dropSchema();
  await fixture.close();
});

describe("RM-029 listing image upload PostgreSQL integration", () => {
  it("uploads before the transaction and atomically persists a DRAFT image in slot one", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const application = await createApp();
    const response = await upload(application.app, landlordId, listingId, 201);
    expect(application.calls.slice(0, 2)).toStrictEqual(["provider-upload", "transaction-start"]);
    expect(response.body.data).toMatchObject({ displayOrder: 1, altText: "Bedroom" });
    expect(response.body.data).not.toHaveProperty("cloudinaryPublicId");
    expect(await listingState(listingId)).toMatchObject({ status: "DRAFT", image_count: 1, history_count: 0 });
    const row = await fixture.pool.query({
      text: "SELECT * FROM listing_images WHERE listing_id = $1",
      values: [listingId]
    });
    expect(row.rows[0]).toMatchObject({ display_order: 1, alt_text: "Bedroom", format: "jpg", byte_size: 100_000 });
    expect((await listingState(listingId))!.updated_at.getTime()).toBeGreaterThan(new Date("2000-01-01Z").getTime());
  });

  it("fills the smallest gap instead of appending after the maximum", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    for (const order of [1, 2, 4]) await addImage(listingId, order);
    const application = await createApp();
    const response = await upload(application.app, landlordId, listingId, 201);
    expect(response.body.data.displayOrder).toBe(3);
    const orders = await fixture.pool.query<{ display_order: number }>({
      text: "SELECT display_order FROM listing_images WHERE listing_id = $1 ORDER BY display_order",
      values: [listingId]
    });
    expect(orders.rows.map((row) => row.display_order)).toStrictEqual([1, 2, 3, 4]);
  });

  it("moves INACTIVE to PENDING with metadata, timestamp, and no history in one commit", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "INACTIVE");
    const application = await createApp();
    await upload(application.app, landlordId, listingId, 201);
    const state = await listingState(listingId);
    expect(state).toMatchObject({ status: "PENDING", image_count: 1, history_count: 0 });
    expect(state!.updated_at.getTime()).toBeGreaterThan(new Date("2000-01-01Z").getTime());
  });

  it("lets the authoritative locked count reject a stale seven-image preflight and compensates once", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    for (let order = 1; order <= 7; order += 1) await addImage(listingId, order);
    const before = await listingState(listingId);
    const application = await createApp({
      beforeUploadResult: async () => addImage(listingId, 8).then(() => undefined)
    });
    const response = await upload(application.app, landlordId, listingId, 422);
    expect(response.body.error.code).toBe("IMAGE_LIMIT_EXCEEDED");
    expect(application.provider.client.uploadImage).toHaveBeenCalledOnce();
    expect(application.provider.client.removeImage).toHaveBeenCalledOnce();
    expect(await listingState(listingId)).toMatchObject({
      status: before!.status,
      image_count: 8,
      history_count: before!.history_count
    });
    expect((await listingState(listingId))!.updated_at).toStrictEqual(before!.updated_at);
  });

  it("rolls back metadata and listing mutation on persistence failure then compensates once", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "APPROVED");
    const before = await fixture.stateSnapshot();
    const application = await createApp({ failImageInsert: true });
    await upload(application.app, landlordId, listingId, 500);
    expect(await fixture.stateSnapshot()).toStrictEqual(before);
    expect(application.provider.client.removeImage).toHaveBeenCalledOnce();
  });

  it("rolls back local mutation on commit failure and preserves the original error contract", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "APPROVED");
    const before = await fixture.stateSnapshot();
    const application = await createApp({ transactionRunner: rollbackRunner as TransactionRunner });
    const response = await upload(application.app, landlordId, listingId, 500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/synthetic|commit failure|SQL|stack/i);
    expect(await fixture.stateSnapshot()).toStrictEqual(before);
    expect(application.provider.client.removeImage).toHaveBeenCalledOnce();
  });

  it("commits hard deletion and cascades before attempting every provider removal", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const tenantId = await fixture.insertUser("TENANT", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const ids = [await addImage(listingId, 1), await addImage(listingId, 2)];
    await fixture.pool.query({
      text: "INSERT INTO listing_amenities (listing_id, amenity_id) SELECT $1, id FROM amenities WHERE code = 'WIFI'",
      values: [listingId]
    });
    await fixture.pool.query({
      text: "INSERT INTO favorites (tenant_id, listing_id) VALUES ($1, $2)",
      values: [tenantId, listingId]
    });
    const provider = createProvider();
    vi.mocked(provider.client.removeImage).mockImplementation(async (publicId) => {
      provider.removed.push(publicId);
      const remaining = await fixture.pool.query<{ count: number }>({
        text: "SELECT count(*)::integer AS count FROM listings WHERE id = $1",
        values: [listingId]
      });
      expect(remaining.rows[0]!.count).toBe(0);
    });
    const application = await createApp({ provider });
    await request(application.app)
      .delete(`/api/v1/landlord/listings/${listingId}`)
      .set("Origin", phase4Origin)
      .set("Cookie", `rentmate_session=${await fixture.signToken(landlordId)}`)
      .expect(204);
    expect(provider.removed.sort()).toStrictEqual([...ids].sort());
    for (const table of ["listings", "listing_images", "listing_amenities", "favorites"]) {
      const column = table === "listings" ? "id" : "listing_id";
      const count = await fixture.pool.query<{ count: number }>({
        text: `SELECT count(*)::integer AS count FROM ${table} WHERE ${column} = $1`,
        values: [listingId]
      });
      expect(count.rows[0]!.count).toBe(0);
    }
  });

  it("keeps hard deletion committed after partial cleanup failure, attempts all IDs, and warns once", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const first = await addImage(listingId, 1);
    const failed = await addImage(listingId, 2);
    const third = await addImage(listingId, 3);
    const provider = createProvider({ removeFailureId: failed });
    const application = await createApp({ provider });
    await request(application.app)
      .delete(`/api/v1/landlord/listings/${listingId}`)
      .set("Origin", phase4Origin)
      .set("Cookie", `rentmate_session=${await fixture.signToken(landlordId)}`)
      .expect(204);
    expect(provider.removed.sort()).toStrictEqual([first, failed, third].sort());
    expect(provider.client.removeImage).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(await listingState(listingId)).toBeNull();
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toMatch(
      /rm029\/seed|provider\.test|synthetic private/i
    );
  });
});
