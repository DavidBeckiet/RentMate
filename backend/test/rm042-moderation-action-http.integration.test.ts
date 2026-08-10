import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const secret = "rm042-http-test-only-secret";
const seconds = 1_900_000_000;
const createdAt = "2026-08-10T00:00:00.000Z";

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  accountRole: UserRole = "ADMIN";
  accountActive = true;
  accountExists = true;
  listingExists = true;
  status: ListingStatus = "PENDING";
  stale = false;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FROM users")) {
      return result(
        (this.accountExists
          ? [{ id: 3, role: this.accountRole, is_active: this.accountActive }]
          : []) as unknown as Row[]
      );
    }
    if (query.text.includes("FOR UPDATE OF l")) {
      return result((this.listingExists ? [{ id: 42, status: this.status }] : []) as unknown as Row[]);
    }
    if (query.text.startsWith("UPDATE listings")) {
      if (!this.stale) this.status = query.values[1] as ListingStatus;
      return result([] as Row[], this.stale ? 0 : 1);
    }
    if (query.text.startsWith("INSERT INTO moderation_history")) {
      return result([
        {
          id: 301,
          listing_id: query.values[0],
          admin_id: query.values[1],
          previous_status: query.values[2],
          new_status: query.values[3],
          reason: query.values[4],
          created_at: createdAt
        }
      ] as unknown as Row[]);
    }
    throw new Error("Unexpected RM-042 HTTP SQL.");
  }
}

const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

async function app(executor: Executor, transactionCalls: string[] = []) {
  return createBackendApp({
    frontendOrigin: origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds,
    transactionRunner: async (operation) => {
      transactionCalls.push("transaction");
      return operation(executor);
    }
  });
}

async function cookie(role: UserRole = "ADMIN", issuedAt = seconds): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => issuedAt }).sign({ userId: 3, role });
  return `rentmate_session=${token}`;
}

function post(application: Awaited<ReturnType<typeof app>>, auth?: string) {
  const call = request(application).post("/api/v1/admin/listings/42/moderation-actions").set("Origin", origin);
  return auth ? call.set("Cookie", auth) : call;
}

describe("RM-042 moderation action HTTP contract", () => {
  it("enforces unsafe Origin before authentication and SQL", async () => {
    for (const requestOrigin of [undefined, "https://denied.example"]) {
      const executor = new Executor();
      const call = request(await app(executor)).post("/api/v1/admin/listings/42/moderation-actions");
      if (requestOrigin) call.set("Origin", requestOrigin);
      await call.send({ action: "APPROVE" }).expect(403);
      expect(executor.queries).toHaveLength(0);
    }
  });

  it("maps malformed JSON after allowed Origin and before authentication", async () => {
    const executor = new Executor();
    await request(await app(executor))
      .post("/api/v1/admin/listings/42/moderation-actions")
      .set("Origin", origin)
      .set("Content-Type", "application/json")
      .send('{"action":')
      .expect(400);
    expect(executor.queries).toHaveLength(0);
  });

  it("requires valid active authentication and ADMIN role", async () => {
    await post(await app(new Executor()))
      .send({ action: "APPROVE" })
      .expect(401);
    await post(await app(new Executor()), "rentmate_session=invalid")
      .send({ action: "APPROVE" })
      .expect(401);
    await post(await app(new Executor()), await cookie("ADMIN", seconds - 7_201))
      .send({ action: "APPROVE" })
      .expect(401);
    const inactive = new Executor();
    inactive.accountActive = false;
    await post(await app(inactive), await cookie())
      .send({ action: "APPROVE" })
      .expect(401);
    for (const role of ["TENANT", "LANDLORD"] as const) {
      const executor = new Executor();
      executor.accountRole = role;
      await post(await app(executor), await cookie(role))
        .send({ action: "APPROVE" })
        .expect(403);
      expect(executor.queries).toHaveLength(1);
    }
  });

  it("returns the exact seven-field 201 DTO and no cookie", async () => {
    const executor = new Executor();
    const response = await post(await app(executor), await cookie())
      .send({ action: " reject ", reason: " reason " })
      .expect(201);
    expect(response.body).toStrictEqual({
      data: {
        id: 301,
        listingId: 42,
        adminId: 3,
        previousStatus: "PENDING",
        newStatus: "REJECTED",
        reason: "reason",
        createdAt
      }
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(executor.queries.filter((query) => query.text.includes("FOR UPDATE"))).toHaveLength(1);
  });

  it("validates path, query, then body before starting a transaction", async () => {
    const auth = await cookie();
    for (const path of ["0", "-1", "1.5", "bad", "2147483648"]) {
      const executor = new Executor();
      const transactions: string[] = [];
      await request(await app(executor, transactions))
        .post(`/api/v1/admin/listings/${path}/moderation-actions`)
        .set("Origin", origin)
        .set("Cookie", auth)
        .send({ action: "APPROVE" })
        .expect(422);
      expect(transactions).toHaveLength(0);
    }
    const queryExecutor = new Executor();
    const queryTransactions: string[] = [];
    await request(await app(queryExecutor, queryTransactions))
      .post("/api/v1/admin/listings/42/moderation-actions?x=1")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({ action: "APPROVE" })
      .expect(422);
    expect(queryTransactions).toHaveLength(0);
    for (const body of [null, [], "text", 1, true, {}, { action: "APPROVE", status: "APPROVED" }]) {
      const executor = new Executor();
      const transactions: string[] = [];
      await post(await app(executor, transactions), auth)
        .set("Content-Type", "application/json")
        .send(JSON.stringify(body))
        .expect(422);
      expect(transactions).toHaveLength(0);
    }
  });

  it("accepts a leading-zero ID and maps missing, invalid transition, and stale update distinctly", async () => {
    const auth = await cookie();
    const leading = new Executor();
    await request(await app(leading))
      .post("/api/v1/admin/listings/00042/moderation-actions")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({ action: "APPROVE" })
      .expect(201);
    expect(leading.queries.find((query) => query.text.includes("FOR UPDATE"))?.values).toStrictEqual([42]);

    const missing = new Executor();
    missing.listingExists = false;
    await post(await app(missing), auth)
      .send({ action: "APPROVE" })
      .expect(404);

    const wrong = new Executor();
    wrong.status = "APPROVED";
    const invalid = await post(await app(wrong), auth)
      .send({ action: "APPROVE" })
      .expect(409);
    expect(invalid.body.error.code).toBe("INVALID_LISTING_TRANSITION");
    expect(wrong.queries.some((query) => query.text.startsWith("UPDATE listings"))).toBe(false);

    const stale = new Executor();
    stale.stale = true;
    const concurrent = await post(await app(stale), auth)
      .send({ action: "APPROVE" })
      .expect(409);
    expect(concurrent.body.error.code).toBe("CONCURRENT_MODIFICATION");
    expect(stale.queries.some((query) => query.text.startsWith("INSERT INTO moderation_history"))).toBe(false);
  });

  it("rejects invalid action/reason before moderation SQL even when listing state would conflict", async () => {
    const auth = await cookie();
    for (const body of [
      { action: "UNKNOWN" },
      { action: "REJECT" },
      { action: "HIDE", reason: " " },
      { action: "APPROVE", reason: " " },
      { action: "RESTORE", reason: 1 }
    ]) {
      const executor = new Executor();
      executor.status = "APPROVED";
      const transactions: string[] = [];
      await post(await app(executor, transactions), auth)
        .send(body)
        .expect(422);
      expect(transactions).toHaveLength(0);
    }
  });
});
