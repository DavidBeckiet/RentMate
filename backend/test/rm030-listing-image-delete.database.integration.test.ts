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
let fixture: Phase4DatabaseFixture;
let sequence = 0;

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: vi.fn(),
  error: vi.fn()
};

interface ProviderFixture {
  readonly client: CloudinaryClient;
  readonly removed: string[];
}

interface AppOptions {
  readonly provider?: ProviderFixture;
  readonly failListingUpdate?: boolean;
  readonly transactionRunner?: TransactionRunner;
}

function createProvider(
  options: Readonly<{ fail?: boolean; afterRemove?: () => Promise<void> }> = {}
): ProviderFixture {
  const removed: string[] = [];
  return {
    removed,
    client: {
      uploadImage: vi.fn(async () => {
        throw new Error("Upload is outside RM-030 database tests");
      }),
      removeImage: vi.fn(async (publicId) => {
        removed.push(publicId);
        await options.afterRemove?.();
        if (options.fail) throw new Error("synthetic private provider failure");
      })
    }
  };
}

function faultingExecutor(delegate: SqlExecutor, failListingUpdate: boolean): SqlExecutor {
  return {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      if (failListingUpdate && query.text.includes("UPDATE listings SET status")) {
        return { command: "UPDATE", rowCount: 0, oid: 0, fields: [], rows: [] } as QueryResult<Row>;
      }
      return delegate.query<Row>(query);
    }
  };
}

async function createApp(options: AppOptions = {}): Promise<{ app: Express; provider: ProviderFixture }> {
  const provider = options.provider ?? createProvider();
  const executor = createSqlExecutor(fixture.pool);
  const transactionRunner: TransactionRunner =
    options.transactionRunner ??
    ((operation) =>
      withTransaction(fixture.pool, logger, async (transaction) =>
        operation(faultingExecutor(transaction, options.failListingUpdate ?? false))
      ));
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
  return { app, provider };
}

async function insertListing(landlordId: number, status: string): Promise<number> {
  const inserted = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude, updated_at
      ) VALUES (
        $1, (SELECT id FROM property_types WHERE code = 'STUDIO'), $2::listing_status,
        'RM-030 listing', 'Listing image deletion integration test', 5000000,
        25.50, 'Private address', 'District', 10.75, 106.67, '2000-01-01T00:00:00Z'
      ) RETURNING id
    `,
    values: [landlordId, status]
  });
  return inserted.rows[0]!.id;
}

async function addImage(listingId: number, displayOrder: number): Promise<{ id: number; publicId: string }> {
  sequence += 1;
  const publicId = `rm030/seed-${sequence}`;
  const inserted = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listing_images (
        listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order
      ) VALUES ($1, $2, $3, 'jpg', 800, 600, 1234, $4) RETURNING id
    `,
    values: [listingId, publicId, `https://provider.test/rm030-${sequence}.jpg`, displayOrder]
  });
  return { id: inserted.rows[0]!.id, publicId };
}

async function state(listingId: number) {
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

async function remove(app: Express, landlordId: number, listingId: number, imageId: number, expected: number) {
  return request(app)
    .delete(`/api/v1/landlord/listings/${listingId}/images/${imageId}`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${await fixture.signToken(landlordId)}`)
    .expect(expected);
}

async function rollbackRunner(operation: (executor: SqlExecutor) => Promise<unknown>): Promise<never> {
  const client: PoolClient = await fixture.pool.connect();
  const executor = createSqlExecutor(client);
  try {
    await executor.query({ text: "BEGIN", values: [] });
    await operation(executor);
    await executor.query({ text: "ROLLBACK", values: [] });
    throw new Error("synthetic RM-030 commit failure");
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
  vi.mocked(logger.error).mockClear();
});

afterAll(async () => {
  await fixture.dropSchema();
  await fixture.close();
});

describe("RM-030 listing image deletion PostgreSQL integration", () => {
  it("deletes a DRAFT final image, updates timestamp, and calls provider only after commit", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const image = await addImage(listingId, 1);
    const provider = createProvider({
      afterRemove: async () => {
        expect(await state(listingId)).toMatchObject({ status: "DRAFT", image_count: 0, history_count: 0 });
      }
    });
    const application = await createApp({ provider });
    await remove(application.app, landlordId, listingId, image.id, 204);
    const current = await state(listingId);
    expect(current).toMatchObject({ status: "DRAFT", image_count: 0, history_count: 0 });
    expect(current!.updated_at.getTime()).toBeGreaterThan(new Date("2000-01-01Z").getTime());
    expect(provider.removed).toStrictEqual([image.publicId]);
  });

  it("protects an APPROVED final image without database or provider side effects", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "APPROVED");
    const image = await addImage(listingId, 1);
    const before = await state(listingId);
    const application = await createApp();
    const response = await remove(application.app, landlordId, listingId, image.id, 422);
    expect(response.body.error.code).toBe("LAST_IMAGE_REQUIRED");
    expect(await state(listingId)).toStrictEqual(before);
    expect(application.provider.client.removeImage).not.toHaveBeenCalled();
  });

  it.each([
    ["APPROVED", "PENDING"],
    ["INACTIVE", "PENDING"]
  ] as const)("atomically applies %s -> %s while deleting one of two images", async (source, target) => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, source);
    const image = await addImage(listingId, 1);
    await addImage(listingId, 2);
    const application = await createApp();
    await remove(application.app, landlordId, listingId, image.id, 204);
    const current = await state(listingId);
    expect(current).toMatchObject({ status: target, image_count: 1, history_count: 0 });
    expect(current!.updated_at.getTime()).toBeGreaterThan(new Date("2000-01-01Z").getTime());
    expect(application.provider.removed).toStrictEqual([image.publicId]);
  });

  it("keeps HIDDEN status and moderation history while updating timestamp", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertListing(landlordId, "HIDDEN");
    await fixture.pool.query({
      text: `INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status, reason) VALUES ($1, $2, 'APPROVED', 'HIDDEN', 'Policy reason')`,
      values: [listingId, adminId]
    });
    const image = await addImage(listingId, 1);
    await addImage(listingId, 2);
    const application = await createApp();
    await remove(application.app, landlordId, listingId, image.id, 204);
    const current = await state(listingId);
    expect(current).toMatchObject({ status: "HIDDEN", image_count: 1, history_count: 1 });
    expect(current!.updated_at.getTime()).toBeGreaterThan(new Date("2000-01-01Z").getTime());
  });

  it("preserves display-order gaps exactly", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    await addImage(listingId, 1);
    const target = await addImage(listingId, 2);
    await addImage(listingId, 4);
    const application = await createApp();
    await remove(application.app, landlordId, listingId, target.id, 204);
    const orders = await fixture.pool.query<{ display_order: number }>({
      text: "SELECT display_order FROM listing_images WHERE listing_id = $1 ORDER BY display_order",
      values: [listingId]
    });
    expect(orders.rows.map((row) => row.display_order)).toStrictEqual([1, 4]);
  });

  it("returns generic 404 for an image nested under a different owned listing", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingA = await insertListing(landlordId, "DRAFT");
    const listingB = await insertListing(landlordId, "DRAFT");
    const image = await addImage(listingB, 1);
    const beforeA = await state(listingA);
    const beforeB = await state(listingB);
    const application = await createApp();
    const response = await remove(application.app, landlordId, listingA, image.id, 404);
    expect(response.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(await state(listingA)).toStrictEqual(beforeA);
    expect(await state(listingB)).toStrictEqual(beforeB);
    expect(application.provider.client.removeImage).not.toHaveBeenCalled();
  });

  it("rolls back metadata when the conditional listing update loses", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "APPROVED");
    const image = await addImage(listingId, 1);
    await addImage(listingId, 2);
    const before = await state(listingId);
    const application = await createApp({ failListingUpdate: true });
    const response = await remove(application.app, landlordId, listingId, image.id, 409);
    expect(response.body.error.code).toBe("CONCURRENT_MODIFICATION");
    expect(await state(listingId)).toStrictEqual(before);
    expect(application.provider.client.removeImage).not.toHaveBeenCalled();
  });

  it("rolls back local mutation on commit failure and never calls provider", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "APPROVED");
    const image = await addImage(listingId, 1);
    await addImage(listingId, 2);
    const before = await state(listingId);
    const application = await createApp({ transactionRunner: rollbackRunner as TransactionRunner });
    const response = await remove(application.app, landlordId, listingId, image.id, 500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(await state(listingId)).toStrictEqual(before);
    expect(application.provider.client.removeImage).not.toHaveBeenCalled();
  });

  it("keeps committed deletion after provider failure and logs safely", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "APPROVED");
    const image = await addImage(listingId, 1);
    await addImage(listingId, 2);
    const provider = createProvider({ fail: true });
    const application = await createApp({ provider });
    await remove(application.app, landlordId, listingId, image.id, 204);
    expect(await state(listingId)).toMatchObject({ status: "PENDING", image_count: 1 });
    expect(provider.client.removeImage).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toMatch(
      /rm030\/seed|provider\.test|synthetic private/i
    );
  });
});
