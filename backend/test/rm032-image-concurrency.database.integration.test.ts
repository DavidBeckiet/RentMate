import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import type { QueryResult, QueryResultRow } from "pg";
import type request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { withTransaction } from "../src/db/transaction.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createPhase4DatabaseFixture, type Phase4DatabaseFixture } from "./helpers/listings-phase4-fixture.js";
import {
  createRecordingCloudinary,
  createRecordingLogger,
  createRm032App,
  deleteRm032Image,
  insertRm032Image,
  insertRm032Listing,
  reorderRm032Images,
  storedRm032Images,
  storedRm032Listing,
  uploadRm032Image,
  type RecordingCloudinary,
  type RecordingLogger
} from "./helpers/rm032-image-fixture.js";

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
type RunnerSide = "leader" | "follower";

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

interface LockBarrier {
  leaderPid: number | null;
  followerPid: number | null;
  readonly leaderLocked: Deferred;
  readonly followerBeforeLock: Deferred;
  readonly releaseLeader: Deferred;
}

interface RaceResult {
  readonly leaderResponse: request.Response;
  readonly followerResponse: request.Response;
  readonly leaderStatements: readonly ParameterizedQuery[];
  readonly followerStatements: readonly ParameterizedQuery[];
  readonly leaderPid: number;
  readonly followerPid: number;
}

let fixture: Phase4DatabaseFixture;
let sequence = 0;

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
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
  statements: ParameterizedQuery[],
  logger: RecordingLogger
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

async function awaitSignalOrEarlyCompletion(
  signal: Promise<void>,
  requestPromise: Promise<request.Response>,
  label: string
): Promise<void> {
  await Promise.race([
    signal,
    requestPromise.then((response) => {
      throw new Error(`${label} completed before reaching the listing lock with HTTP ${response.status}.`);
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

async function runRace(
  provider: RecordingCloudinary,
  sendLeader: (app: Express) => Promise<request.Response>,
  sendFollower: (app: Express) => Promise<request.Response>
): Promise<RaceResult> {
  const barrier = createBarrier();
  const leaderStatements: ParameterizedQuery[] = [];
  const followerStatements: ParameterizedQuery[] = [];
  const leaderLogger = createRecordingLogger();
  const followerLogger = createRecordingLogger();
  const leaderApplication = await createRm032App(fixture, {
    provider,
    logger: leaderLogger,
    transactionRunner: instrumentedRunner("leader", barrier, leaderStatements, leaderLogger)
  });
  const followerApplication = await createRm032App(fixture, {
    provider,
    logger: followerLogger,
    transactionRunner: instrumentedRunner("follower", barrier, followerStatements, followerLogger)
  });
  const leaderPromise = sendLeader(leaderApplication.app);
  let followerPromise: Promise<request.Response> | null = null;

  try {
    await awaitSignalOrEarlyCompletion(barrier.leaderLocked.promise, leaderPromise, "Leader");
    followerPromise = sendFollower(followerApplication.app);
    await awaitSignalOrEarlyCompletion(barrier.followerBeforeLock.promise, followerPromise, "Follower");
    await proveFollowerIsBlocked(barrier);
  } finally {
    barrier.releaseLeader.resolve();
    await Promise.allSettled(followerPromise === null ? [leaderPromise] : [leaderPromise, followerPromise]);
  }

  if (followerPromise === null || barrier.leaderPid === null || barrier.followerPid === null) {
    throw new Error("RM-032 concurrency participant did not reach the listing lock.");
  }
  const [leaderResponse, followerResponse] = await Promise.all([leaderPromise, followerPromise]);
  expect(barrier.leaderPid).not.toBe(barrier.followerPid);
  return {
    leaderResponse,
    followerResponse,
    leaderStatements,
    followerStatements,
    leaderPid: barrier.leaderPid,
    followerPid: barrier.followerPid
  };
}

function hasReorderWrite(statements: readonly ParameterizedQuery[]): boolean {
  return statements.some((query) => /SET CONSTRAINTS|UPDATE listing_images|UPDATE listings/i.test(query.text));
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

describe("RM-032 deterministic PostgreSQL image concurrency", () => {
  it("serializes two uploads from six images without losing either image", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "APPROVED");
    for (let order = 1; order <= 6; order += 1) await insertRm032Image(fixture, listingId, order);
    const token = await fixture.signToken(landlordId);
    const provider = createRecordingCloudinary();

    const race = await runRace(
      provider,
      (app) => Promise.resolve(uploadRm032Image(app, token, listingId, "leader upload")),
      (app) => Promise.resolve(uploadRm032Image(app, token, listingId, "follower upload"))
    );

    expect([race.leaderResponse.status, race.followerResponse.status]).toStrictEqual([201, 201]);
    const images = await storedRm032Images(fixture, listingId);
    expect(images).toHaveLength(8);
    expect(images.map((image) => image.display_order)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(provider.uploads).toHaveLength(2);
    expect(provider.removals).toHaveLength(0);
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("PENDING");
  });

  it("serializes two uploads at seven images and compensates only the locked-count loser", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "DRAFT");
    for (let order = 1; order <= 7; order += 1) await insertRm032Image(fixture, listingId, order);
    const token = await fixture.signToken(landlordId);
    const provider = createRecordingCloudinary();

    const race = await runRace(
      provider,
      (app) => Promise.resolve(uploadRm032Image(app, token, listingId, "winning upload")),
      (app) => Promise.resolve(uploadRm032Image(app, token, listingId, "losing upload"))
    );

    expect(race.leaderResponse.status).toBe(201);
    expect(race.followerResponse.status).toBe(422);
    expect(race.followerResponse.body.error.code).toBe("IMAGE_LIMIT_EXCEEDED");
    const images = await storedRm032Images(fixture, listingId);
    expect(images).toHaveLength(8);
    expect(new Set(images.map((image) => image.display_order)).size).toBe(8);
    expect(provider.uploads).toHaveLength(2);
    expect(provider.removals).toStrictEqual([provider.uploads[1]!.publicId]);
    expect(images.some((image) => image.cloudinary_public_id === provider.uploads[1]!.publicId)).toBe(false);
  });

  it("serializes upload before delete and preserves the uploaded replacement", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "APPROVED");
    const original = await insertRm032Image(fixture, listingId, 1);
    const token = await fixture.signToken(landlordId);
    const provider = createRecordingCloudinary();

    const race = await runRace(
      provider,
      (app) => Promise.resolve(uploadRm032Image(app, token, listingId, "new image")),
      (app) => Promise.resolve(deleteRm032Image(app, token, listingId, original.id))
    );

    expect(race.leaderResponse.status).toBe(201);
    expect(race.followerResponse.status).toBe(204);
    const images = await storedRm032Images(fixture, listingId);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ cloudinary_public_id: provider.uploads[0]!.publicId, display_order: 2 });
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("PENDING");
    expect(provider.removals).toStrictEqual([original.publicId]);
  });

  it("rejects a reorder whose exact set became stale after upload", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "DRAFT");
    const a = await insertRm032Image(fixture, listingId, 1);
    const b = await insertRm032Image(fixture, listingId, 2);
    const token = await fixture.signToken(landlordId);
    const provider = createRecordingCloudinary();

    const race = await runRace(
      provider,
      (app) => Promise.resolve(uploadRm032Image(app, token, listingId)),
      (app) => Promise.resolve(reorderRm032Images(app, token, listingId, [a.id, b.id]))
    );

    expect(race.leaderResponse.status).toBe(201);
    expect(race.followerResponse.status).toBe(409);
    expect(race.followerResponse.body.error.code).toBe("CONCURRENT_MODIFICATION");
    expect(hasReorderWrite(race.followerStatements)).toBe(false);
    expect(await storedRm032Images(fixture, listingId)).toHaveLength(3);
    expect(provider.removals).toHaveLength(0);
  });

  it("serializes two deletes of the same image to one 204 and one generic 404", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "DRAFT");
    const target = await insertRm032Image(fixture, listingId, 1);
    await insertRm032Image(fixture, listingId, 2);
    const token = await fixture.signToken(landlordId);
    const provider = createRecordingCloudinary();

    const race = await runRace(
      provider,
      (app) => Promise.resolve(deleteRm032Image(app, token, listingId, target.id)),
      (app) => Promise.resolve(deleteRm032Image(app, token, listingId, target.id))
    );

    expect(race.leaderResponse.status).toBe(204);
    expect(race.followerResponse.status).toBe(404);
    expect(race.followerResponse.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect((await storedRm032Images(fixture, listingId)).map((image) => image.id)).not.toContain(target.id);
    expect(provider.removals).toStrictEqual([target.publicId]);
  });

  it("serializes different deletes at the non-DRAFT last-image boundary", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "APPROVED");
    const a = await insertRm032Image(fixture, listingId, 1);
    const b = await insertRm032Image(fixture, listingId, 2);
    const token = await fixture.signToken(landlordId);
    const provider = createRecordingCloudinary();

    const race = await runRace(
      provider,
      (app) => Promise.resolve(deleteRm032Image(app, token, listingId, a.id)),
      (app) => Promise.resolve(deleteRm032Image(app, token, listingId, b.id))
    );

    expect(race.leaderResponse.status).toBe(204);
    expect(race.followerResponse.status).toBe(422);
    expect(race.followerResponse.body.error.code).toBe("LAST_IMAGE_REQUIRED");
    expect((await storedRm032Images(fixture, listingId)).map((image) => image.id)).toStrictEqual([b.id]);
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("PENDING");
    expect(provider.removals).toStrictEqual([a.publicId]);
  });

  it("rejects a reorder whose exact set became stale after delete", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "DRAFT");
    const a = await insertRm032Image(fixture, listingId, 1);
    const b = await insertRm032Image(fixture, listingId, 2);
    const c = await insertRm032Image(fixture, listingId, 3);
    const token = await fixture.signToken(landlordId);
    const provider = createRecordingCloudinary();

    const race = await runRace(
      provider,
      (app) => Promise.resolve(deleteRm032Image(app, token, listingId, c.id)),
      (app) => Promise.resolve(reorderRm032Images(app, token, listingId, [a.id, b.id, c.id]))
    );

    expect(race.leaderResponse.status).toBe(204);
    expect(race.followerResponse.status).toBe(409);
    expect(race.followerResponse.body.error.code).toBe("CONCURRENT_MODIFICATION");
    expect(hasReorderWrite(race.followerStatements)).toBe(false);
    expect((await storedRm032Images(fixture, listingId)).map((image) => image.id)).toStrictEqual([a.id, b.id]);
    expect(provider.removals).toStrictEqual([c.publicId]);
  });

  it("serializes two valid reorders and leaves the follower order final", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertRm032Listing(fixture, landlordId, "APPROVED");
    const a = await insertRm032Image(fixture, listingId, 1);
    const b = await insertRm032Image(fixture, listingId, 2);
    const c = await insertRm032Image(fixture, listingId, 3);
    const token = await fixture.signToken(landlordId);
    const provider = createRecordingCloudinary();

    const race = await runRace(
      provider,
      (app) => Promise.resolve(reorderRm032Images(app, token, listingId, [c.id, a.id, b.id])),
      (app) => Promise.resolve(reorderRm032Images(app, token, listingId, [b.id, c.id, a.id]))
    );

    expect(race.leaderResponse.status).toBe(200);
    expect(race.followerResponse.status).toBe(200);
    expect((await storedRm032Images(fixture, listingId)).map((image) => [image.id, image.display_order])).toStrictEqual(
      [
        [b.id, 1],
        [c.id, 2],
        [a.id, 3]
      ]
    );
    expect((await storedRm032Listing(fixture, listingId))?.status).toBe("APPROVED");
    expect(provider.events).toHaveLength(0);
  });
});
