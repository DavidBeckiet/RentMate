import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
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
const baselineTimestamp = new Date("2000-01-01T00:00:00Z");
let fixture: Phase4DatabaseFixture;
let sequence = 0;

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

interface AppOptions {
  readonly recorded?: ParameterizedQuery[];
  readonly failTouch?: boolean;
}

function recordingExecutor(delegate: SqlExecutor, options: AppOptions): SqlExecutor {
  return {
    async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
      options.recorded?.push(query);
      if (options.failTouch && query.text.startsWith("UPDATE listings SET updated_at")) {
        return { command: "UPDATE", rowCount: 0, oid: 0, fields: [], rows: [] } as QueryResult<Row>;
      }
      return delegate.query<Row>(query);
    }
  };
}

async function createApp(options: AppOptions = {}): Promise<Express> {
  const executor = createSqlExecutor(fixture.pool);
  const transactionRunner: TransactionRunner = (operation) =>
    withTransaction(fixture.pool, logger, async (transaction) => operation(recordingExecutor(transaction, options)));
  return createBackendApp({
    frontendOrigin: phase4Origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: phase4JwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => phase4NowSeconds,
    authRateLimitClock: () => 0,
    transactionRunner
  });
}

async function insertListing(landlordId: number, status: string): Promise<number> {
  const inserted = await fixture.pool.query<{ id: number }>({
    text: `INSERT INTO listings (
      landlord_id, property_type_id, status, title, description, monthly_rent,
      room_area_sqm, address_text, area_name, latitude, longitude, updated_at
    ) VALUES (
      $1, (SELECT id FROM property_types WHERE code = 'STUDIO'), $2::listing_status,
      'RM-031 listing', 'Listing image reorder integration test', 5000000,
      25.50, 'Private address', 'District', 10.75, 106.67, $3
    ) RETURNING id`,
    values: [landlordId, status, baselineTimestamp]
  });
  return inserted.rows[0]!.id;
}

async function addImage(listingId: number, displayOrder: number): Promise<number> {
  sequence += 1;
  const inserted = await fixture.pool.query<{ id: number }>({
    text: `INSERT INTO listing_images (
      listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order
    ) VALUES ($1, $2, $3, 'jpg', 800, 600, 1234, $4) RETURNING id`,
    values: [listingId, `rm031/seed-${sequence}`, `https://provider.test/rm031-${sequence}.jpg`, displayOrder]
  });
  return inserted.rows[0]!.id;
}

async function currentState(listingId: number) {
  const listing = await fixture.pool.query<{ status: string; updated_at: Date; history_count: number }>({
    text: `SELECT l.status, l.updated_at,
      (SELECT count(*)::integer FROM moderation_history WHERE listing_id = l.id) AS history_count
      FROM listings AS l WHERE l.id = $1`,
    values: [listingId]
  });
  const images = await fixture.pool.query<{ id: number; display_order: number }>({
    text: "SELECT id, display_order FROM listing_images WHERE listing_id = $1 ORDER BY display_order ASC, id ASC",
    values: [listingId]
  });
  return { listing: listing.rows[0]!, images: images.rows };
}

async function reorder(
  app: Express,
  landlordId: number,
  listingId: number,
  imageIds: readonly number[],
  expected: number
) {
  return request(app)
    .put(`/api/v1/landlord/listings/${listingId}/images/order`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${await fixture.signToken(landlordId)}`)
    .send({ imageIds })
    .expect(expected);
}

beforeAll(async () => {
  fixture = createPhase4DatabaseFixture(migrationDirectory);
  await fixture.rebuildSchema();
});

beforeEach(async () => {
  await fixture.resetData();
});

afterAll(async () => {
  await fixture.dropSchema();
  await fixture.close();
});

describe("RM-031 listing image reorder PostgreSQL integration", () => {
  it("performs an ordinary reorder with contiguous positions, unchanged status/history, and safe output", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertListing(landlordId, "APPROVED");
    await fixture.pool.query({
      text: `INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status)
        VALUES ($1, $2, 'PENDING', 'APPROVED')`,
      values: [listingId, adminId]
    });
    const a = await addImage(listingId, 1);
    const b = await addImage(listingId, 2);
    const c = await addImage(listingId, 3);
    const response = await reorder(await createApp(), landlordId, listingId, [c, a, b], 200);
    expect(
      response.body.data.map((image: { id: number; displayOrder: number }) => [image.id, image.displayOrder])
    ).toStrictEqual([
      [c, 1],
      [a, 2],
      [b, 3]
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/cloudinaryPublicId/i);
    const state = await currentState(listingId);
    expect(state.images).toStrictEqual([
      { id: c, display_order: 1 },
      { id: a, display_order: 2 },
      { id: b, display_order: 3 }
    ]);
    expect(state.listing.status).toBe("APPROVED");
    expect(state.listing.history_count).toBe(1);
    expect(state.listing.updated_at.getTime()).toBeGreaterThan(baselineTimestamp.getTime());
  });

  it("commits a direct two-image uniqueness swap using the named deferred constraint", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const a = await addImage(listingId, 1);
    const b = await addImage(listingId, 2);
    const recorded: ParameterizedQuery[] = [];
    await reorder(await createApp({ recorded }), landlordId, listingId, [b, a], 200);
    expect(
      recorded.filter((query) => query.text === "SET CONSTRAINTS uq_listing_images_listing_display_order DEFERRED")
    ).toHaveLength(1);
    expect((await currentState(listingId)).images).toStrictEqual([
      { id: b, display_order: 1 },
      { id: a, display_order: 2 }
    ]);
  });

  it("compacts a real gapped reorder to final slots 1..N", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const a = await addImage(listingId, 1);
    const b = await addImage(listingId, 3);
    const c = await addImage(listingId, 5);
    await reorder(await createApp(), landlordId, listingId, [c, a, b], 200);
    expect((await currentState(listingId)).images).toStrictEqual([
      { id: c, display_order: 1 },
      { id: a, display_order: 2 },
      { id: b, display_order: 3 }
    ]);
  });

  it("preserves gapped positions and timestamp on a normalized no-op with zero mutation statements", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const ids = [await addImage(listingId, 1), await addImage(listingId, 3), await addImage(listingId, 5)];
    const before = await currentState(listingId);
    const recorded: ParameterizedQuery[] = [];
    await reorder(await createApp({ recorded }), landlordId, listingId, ids, 200);
    expect(await currentState(listingId)).toStrictEqual(before);
    expect(recorded.some((query) => /SET CONSTRAINTS|UPDATE listing_images|UPDATE listings/i.test(query.text))).toBe(
      false
    );
  });

  it("preserves a one-image gapped slot on no-op", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const imageId = await addImage(listingId, 6);
    const before = await currentState(listingId);
    await reorder(await createApp(), landlordId, listingId, [imageId], 200);
    expect(await currentState(listingId)).toStrictEqual(before);
  });

  it("accepts an exact empty set as a zero-write no-op", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const before = await currentState(listingId);
    const response = await reorder(await createApp(), landlordId, listingId, [], 200);
    expect(response.body).toStrictEqual({ data: [] });
    expect(await currentState(listingId)).toStrictEqual(before);
  });

  it("returns stale-set 409 without image or timestamp writes", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "DRAFT");
    const a = await addImage(listingId, 1);
    await addImage(listingId, 2);
    const before = await currentState(listingId);
    const response = await reorder(await createApp(), landlordId, listingId, [a], 409);
    expect(response.body.error.code).toBe("CONCURRENT_MODIFICATION");
    expect(await currentState(listingId)).toStrictEqual(before);
  });

  it("returns generic owner-scoped 404 without writes", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const otherId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, "DRAFT");
    const imageId = await addImage(listingId, 1);
    const before = await currentState(listingId);
    const response = await reorder(await createApp(), otherId, listingId, [imageId], 404);
    expect(response.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(await currentState(listingId)).toStrictEqual(before);
  });

  it.each(["APPROVED", "REJECTED", "INACTIVE"])(
    "keeps real PostgreSQL status %s on changed reorder",
    async (status) => {
      const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
      const listingId = await insertListing(landlordId, status);
      const a = await addImage(listingId, 1);
      const b = await addImage(listingId, 2);
      await reorder(await createApp(), landlordId, listingId, [b, a], 200);
      const current = await currentState(listingId);
      expect(current.listing.status).toBe(status);
      expect(current.listing.updated_at.getTime()).toBeGreaterThan(baselineTimestamp.getTime());
      expect(current.listing.history_count).toBe(0);
    }
  );

  it("rolls back the bulk reorder when the timestamp expected-state update loses", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, "APPROVED");
    const a = await addImage(listingId, 1);
    const b = await addImage(listingId, 2);
    const before = await currentState(listingId);
    const response = await reorder(await createApp({ failTouch: true }), landlordId, listingId, [b, a], 409);
    expect(response.body.error.code).toBe("CONCURRENT_MODIFICATION");
    expect(await currentState(listingId)).toStrictEqual(before);
  });
});
