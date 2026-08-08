import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
import type { ListingDeleteCleanupHandoff } from "../src/modules/listings/listing-delete-cleanup.js";
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
type Mutation = "submit" | "deactivate" | "reactivate" | "delete" | "patch";
type RunnerSide = "leader" | "follower";

interface Deferred<Value = void> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
}

interface LockBarrier {
  leaderPid: number | null;
  followerPid: number | null;
  readonly leaderLocked: Deferred;
  readonly followerBeforeLock: Deferred;
  readonly releaseLeader: Deferred;
}

interface RaceOptions {
  readonly leader: Mutation;
  readonly follower: Mutation;
  readonly listingId: number;
  readonly token: string;
  readonly leaderBody?: object;
  readonly followerBody?: object;
}

let fixture: Phase4DatabaseFixture;
let sequence = 0;

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function deferred<Value = void>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createBarrier(): LockBarrier {
  return {
    leaderPid: null,
    followerPid: null,
    leaderLocked: deferred(),
    followerBeforeLock: deferred(),
    releaseLeader: deferred()
  };
}

function isListingLock(query: ParameterizedQuery): boolean {
  return query.text.includes("FOR UPDATE OF l");
}

function instrumentedRunner(
  side: RunnerSide,
  barrier: LockBarrier,
  statements: ParameterizedQuery[]
): TransactionRunner {
  return async <Value>(operation: (executor: SqlExecutor) => Promise<Value>): Promise<Value> =>
    withTransaction(fixture.pool, logger, async (transaction) => {
      const pidResult = await transaction.query<{ pid: number }>({
        text: "SELECT pg_backend_pid()::integer AS pid",
        values: []
      });
      const pid = pidResult.rows[0]!.pid;
      if (side === "leader") barrier.leaderPid = pid;
      else barrier.followerPid = pid;

      const executor: SqlExecutor = {
        async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
          statements.push(query);
          if (!isListingLock(query)) return transaction.query<Row>(query);
          if (side === "follower") {
            barrier.followerBeforeLock.resolve();
            return transaction.query<Row>(query);
          }
          const locked = await transaction.query<Row>(query);
          barrier.leaderLocked.resolve();
          await barrier.releaseLeader.promise;
          return locked;
        }
      };
      return operation(executor);
    });
}

async function createRaceApp(
  transactionRunner: TransactionRunner,
  cleanupHandoff: ListingDeleteCleanupHandoff
): Promise<Express> {
  return createBackendApp({
    frontendOrigin: phase4Origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: createSqlExecutor(fixture.pool),
    jwtSecret: phase4JwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => phase4NowSeconds,
    authRateLimitClock: () => 0,
    transactionRunner,
    listingDeleteCleanupHandoff: cleanupHandoff
  });
}

function sendMutation(app: Express, token: string, listingId: number, mutation: Mutation, body?: object) {
  const basePath = `/api/v1/landlord/listings/${listingId}`;
  if (mutation === "patch") {
    return request(app)
      .patch(basePath)
      .set("Origin", phase4Origin)
      .set("Cookie", `rentmate_session=${token}`)
      .send(body ?? { title: "RM-028 concurrent PATCH" });
  }
  if (mutation === "delete") {
    return request(app).delete(basePath).set("Origin", phase4Origin).set("Cookie", `rentmate_session=${token}`);
  }
  return request(app)
    .post(`${basePath}/${mutation}`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`);
}

async function awaitSignalOrEarlyCompletion(
  signal: Promise<void>,
  requestPromise: Promise<request.Response>,
  label: string
): Promise<void> {
  await Promise.race([
    signal,
    requestPromise.then((response) => {
      throw new Error(`${label} completed before reaching the lock barrier with HTTP ${response.status}.`);
    })
  ]);
}

async function proveFollowerIsBlocked(barrier: LockBarrier): Promise<void> {
  expect(barrier.leaderPid).not.toBeNull();
  expect(barrier.followerPid).not.toBeNull();
  await vi.waitFor(
    async () => {
      const result = await fixture.pool.query<{ blockers: number[] }>({
        text: "SELECT pg_blocking_pids($1::integer) AS blockers",
        values: [barrier.followerPid]
      });
      expect(result.rows[0]!.blockers).toContain(barrier.leaderPid);
    },
    { timeout: 5_000, interval: 20 }
  );
}

async function runRace(options: RaceOptions) {
  const barrier = createBarrier();
  const leaderStatements: ParameterizedQuery[] = [];
  const followerStatements: ParameterizedQuery[] = [];
  const cleanupCalls: (readonly string[])[] = [];
  const cleanupHandoff: ListingDeleteCleanupHandoff = {
    afterCommittedDelete: vi.fn(async (publicIds) => {
      cleanupCalls.push([...publicIds]);
    })
  };
  const leaderApp = await createRaceApp(instrumentedRunner("leader", barrier, leaderStatements), cleanupHandoff);
  const followerApp = await createRaceApp(instrumentedRunner("follower", barrier, followerStatements), cleanupHandoff);
  const leaderPromise = Promise.resolve(
    sendMutation(leaderApp, options.token, options.listingId, options.leader, options.leaderBody)
  );
  let followerPromise: Promise<request.Response> | null = null;

  try {
    await awaitSignalOrEarlyCompletion(barrier.leaderLocked.promise, leaderPromise, "Leader");
    followerPromise = Promise.resolve(
      sendMutation(followerApp, options.token, options.listingId, options.follower, options.followerBody)
    );
    await awaitSignalOrEarlyCompletion(barrier.followerBeforeLock.promise, followerPromise, "Follower");
    await proveFollowerIsBlocked(barrier);
  } finally {
    barrier.releaseLeader.resolve();
    await Promise.allSettled(followerPromise === null ? [leaderPromise] : [leaderPromise, followerPromise]);
  }

  if (followerPromise === null) throw new Error("Follower request did not start.");
  const [leaderResponse, followerResponse] = await Promise.all([leaderPromise, followerPromise]);
  return {
    leaderResponse,
    followerResponse,
    leaderStatements,
    followerStatements,
    cleanupCalls,
    leaderPid: barrier.leaderPid,
    followerPid: barrier.followerPid
  };
}

async function insertListing(landlordId: number, status: string): Promise<number> {
  sequence += 1;
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude
      )
      VALUES (
        $1, (SELECT id FROM property_types WHERE code = 'STUDIO'), $2::listing_status,
        $3, 'RM-028 concurrent listing', 5000000,
        25.50, 'Private address', 'District 1', 10.75, 106.67
      )
      RETURNING id
    `,
    values: [landlordId, status, `RM-028 race ${sequence}`]
  });
  return result.rows[0]!.id;
}

async function addImage(listingId: number): Promise<string> {
  sequence += 1;
  const publicId = `rm028/concurrency-${sequence}`;
  await fixture.pool.query({
    text: `
      INSERT INTO listing_images (
        listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order
      )
      VALUES ($1, $2, $3, 'webp', 800, 600, 1234, 1)
    `,
    values: [listingId, publicId, `https://example.test/rm028-race-${sequence}.webp`]
  });
  return publicId;
}

async function addDeleteChildren(listingId: number, tenantId: number): Promise<string> {
  const publicId = await addImage(listingId);
  await fixture.pool.query({
    text: `
      INSERT INTO listing_amenities (listing_id, amenity_id)
      SELECT $1, id FROM amenities WHERE code = 'WIFI'
    `,
    values: [listingId]
  });
  await fixture.pool.query({
    text: "INSERT INTO favorites (tenant_id, listing_id) VALUES ($1, $2)",
    values: [tenantId, listingId]
  });
  return publicId;
}

async function storedListing(listingId: number) {
  return (
    await fixture.pool.query({
      text: "SELECT id, status, title FROM listings WHERE id = $1",
      values: [listingId]
    })
  ).rows[0];
}

async function listingChildCount(table: "listing_images" | "listing_amenities" | "favorites", listingId: number) {
  const result = await fixture.pool.query<{ count: number }>({
    text: `SELECT count(*)::integer AS count FROM ${table} WHERE listing_id = $1`,
    values: [listingId]
  });
  return result.rows[0]!.count;
}

function mutationWrites(statements: readonly ParameterizedQuery[]): ParameterizedQuery[] {
  return statements.filter((statement) => /^(?:\s*)(?:UPDATE|DELETE FROM) listings/i.test(statement.text));
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

describe("RM-028 deterministic PostgreSQL listing-row concurrency", () => {
  it.each([
    ["submit", "DRAFT", "PENDING"],
    ["deactivate", "APPROVED", "INACTIVE"],
    ["reactivate", "INACTIVE", "APPROVED"]
  ] as const)("serializes %s versus %s with one winner", async (mutation, sourceStatus, finalStatus) => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, sourceStatus);
    if (mutation === "submit") await addImage(listingId);
    const race = await runRace({
      leader: mutation,
      follower: mutation,
      listingId,
      token: await fixture.signToken(ownerId)
    });

    expect(race.leaderResponse.status).toBe(200);
    expect(race.followerResponse.status).toBe(409);
    expect(race.followerResponse.body.error.code).toBe("INVALID_LISTING_TRANSITION");
    expect(await storedListing(listingId)).toMatchObject({ status: finalStatus });
    expect(mutationWrites([...race.leaderStatements, ...race.followerStatements])).toHaveLength(1);
    expect(await fixture.tableCount("moderation_history")).toBe(0);
    expect(race.leaderPid).not.toBe(race.followerPid);
  });

  it("serializes delete versus delete with one 204, one generic 404, cascades, and one handoff", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const tenantId = await fixture.insertUser("TENANT", ++sequence);
    const listingId = await insertListing(ownerId, "DRAFT");
    const publicId = await addDeleteChildren(listingId, tenantId);
    const race = await runRace({
      leader: "delete",
      follower: "delete",
      listingId,
      token: await fixture.signToken(ownerId)
    });

    expect(race.leaderResponse.status).toBe(204);
    expect(race.followerResponse.status).toBe(404);
    expect(race.followerResponse.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(await storedListing(listingId)).toBeUndefined();
    expect(await listingChildCount("listing_images", listingId)).toBe(0);
    expect(await listingChildCount("listing_amenities", listingId)).toBe(0);
    expect(await listingChildCount("favorites", listingId)).toBe(0);
    expect(race.cleanupCalls).toStrictEqual([[publicId]]);
    expect(mutationWrites([...race.leaderStatements, ...race.followerStatements])).toHaveLength(1);
  });

  it("serializes submit first and rejects the waiting delete after observing PENDING", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, "DRAFT");
    await addImage(listingId);
    const race = await runRace({
      leader: "submit",
      follower: "delete",
      listingId,
      token: await fixture.signToken(ownerId)
    });
    expect(race.leaderResponse.status).toBe(200);
    expect(race.followerResponse.status).toBe(409);
    expect(race.followerResponse.body.error.code).toBe("LISTING_DELETE_NOT_ALLOWED");
    expect(await storedListing(listingId)).toMatchObject({ status: "PENDING" });
    expect(race.cleanupCalls).toHaveLength(0);
  });

  it("serializes delete first and returns generic 404 to the waiting submit", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, "DRAFT");
    const publicId = await addImage(listingId);
    const race = await runRace({
      leader: "delete",
      follower: "submit",
      listingId,
      token: await fixture.signToken(ownerId)
    });
    expect(race.leaderResponse.status).toBe(204);
    expect(race.followerResponse.status).toBe(404);
    expect(race.followerResponse.body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(await storedListing(listingId)).toBeUndefined();
    expect(race.cleanupCalls).toStrictEqual([[publicId]]);
  });

  it("serializes significant PATCH first and rejects waiting deactivate from PENDING", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, "APPROVED");
    const race = await runRace({
      leader: "patch",
      follower: "deactivate",
      listingId,
      token: await fixture.signToken(ownerId),
      leaderBody: { title: "PATCH won before deactivate" }
    });
    expect(race.leaderResponse.status).toBe(200);
    expect(race.followerResponse.status).toBe(409);
    expect(race.followerResponse.body.error.code).toBe("INVALID_LISTING_TRANSITION");
    expect(await storedListing(listingId)).toMatchObject({
      status: "PENDING",
      title: "PATCH won before deactivate"
    });
  });

  it("serializes deactivate first then applies waiting significant PATCH from INACTIVE without a lost update", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, "APPROVED");
    const race = await runRace({
      leader: "deactivate",
      follower: "patch",
      listingId,
      token: await fixture.signToken(ownerId),
      followerBody: { title: "PATCH applied after deactivate" }
    });
    expect(race.leaderResponse.status).toBe(200);
    expect(race.followerResponse.status).toBe(200);
    expect(race.leaderResponse.body.data.status).toBe("INACTIVE");
    expect(race.followerResponse.body.data).toMatchObject({
      status: "PENDING",
      title: "PATCH applied after deactivate"
    });
    expect(await storedListing(listingId)).toMatchObject({
      status: "PENDING",
      title: "PATCH applied after deactivate"
    });
    expect(mutationWrites([...race.leaderStatements, ...race.followerStatements])).toHaveLength(2);
  });
});
