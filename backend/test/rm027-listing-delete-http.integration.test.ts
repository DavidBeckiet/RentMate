import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import type { ListingDeleteCleanupHandoff } from "../src/modules/listings/listing-delete-cleanup.js";
import type { ListingStatus } from "../src/modules/listings/owner-listing-mapper.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const secret = "rm027-http-test-only-secret";
const seconds = 1_900_000_000;

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  accountRole: UserRole = "LANDLORD";
  accountActive = true;
  status: ListingStatus = "DRAFT";
  owned = true;
  hasHistory = false;
  stale = false;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FROM users")) {
      return result([{ id: 9, role: this.accountRole, is_active: this.accountActive }] as unknown as Row[]);
    }
    if (query.text.includes("FROM property_types") && query.text.includes("WHERE is_active = true")) {
      return result([] as Row[]);
    }
    if (query.text.includes("FOR UPDATE OF l")) {
      return this.owned ? result([{ id: 7, status: this.status }] as unknown as Row[]) : result([] as Row[]);
    }
    if (query.text.includes("SELECT EXISTS") && query.text.includes("moderation_history")) {
      return result([{ has_moderation_history: this.hasHistory }] as unknown as Row[]);
    }
    if (query.text.includes("SELECT cloudinary_public_id")) {
      return result([{ cloudinary_public_id: "rentmate/a" }] as unknown as Row[]);
    }
    if (query.text.includes("DELETE FROM listings")) {
      if (!this.stale) this.owned = false;
      return result([] as Row[], this.stale ? 0 : 1);
    }
    throw new Error("Unexpected RM-027 HTTP SQL");
  }
}

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function makeCleanupHandoff(): ListingDeleteCleanupHandoff {
  return { afterCommittedDelete: vi.fn(async () => undefined) };
}

async function makeApp(executor: Executor, cleanupHandoff = makeCleanupHandoff()) {
  return {
    app: await createBackendApp({
      frontendOrigin: origin,
      logger,
      checkDatabaseConnection: async () => undefined,
      sqlExecutor: executor,
      jwtSecret: secret,
      bcryptCost: 4,
      cookieSecure: false,
      sessionTokenClock: () => seconds,
      authRateLimitClock: () => 0,
      transactionRunner: async (operation) => operation(executor),
      listingDeleteCleanupHandoff: cleanupHandoff
    }),
    cleanupHandoff
  };
}

async function cookie(role: UserRole = "LANDLORD") {
  const token = await createSessionTokenService({ secret, nowSeconds: () => seconds }).sign({ userId: 9, role });
  return `rentmate_session=${token}`;
}

function listingQueries(executor: Executor): ParameterizedQuery[] {
  return executor.queries.filter((query) => !query.text.includes("FROM users"));
}

describe("RM-027 listing delete HTTP", () => {
  it("enforces Origin and authentication before listing SQL", async () => {
    const executor = new Executor();
    const { app } = await makeApp(executor);
    await request(app).delete("/api/v1/landlord/listings/7").expect(403);
    await request(app).delete("/api/v1/landlord/listings/7").set("Origin", "http://denied.test").expect(403);
    await request(app).delete("/api/v1/landlord/listings/7").set("Origin", origin).expect(401);
    await request(app)
      .delete("/api/v1/landlord/listings/7")
      .set("Origin", origin)
      .set("Cookie", "rentmate_session=invalid")
      .expect(401);
    expect(listingQueries(executor)).toHaveLength(0);
  });

  it.each(["TENANT", "ADMIN"] as const)("rejects active %s before listing SQL", async (role) => {
    const executor = new Executor();
    executor.accountRole = role;
    const { app } = await makeApp(executor);
    await request(app)
      .delete("/api/v1/landlord/listings/7")
      .set("Origin", origin)
      .set("Cookie", await cookie(role))
      .expect(403);
    expect(listingQueries(executor)).toHaveLength(0);
  });

  it("rejects inactive authentication before listing SQL", async () => {
    const executor = new Executor();
    executor.accountActive = false;
    const { app } = await makeApp(executor);
    await request(app)
      .delete("/api/v1/landlord/listings/7")
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(401);
    expect(listingQueries(executor)).toHaveLength(0);
  });

  it.each(["0", "-1", "1.5", "text", "%20", "1x", "2147483648"])("rejects invalid path %s", async (id) => {
    const executor = new Executor();
    const { app } = await makeApp(executor);
    const response = await request(app)
      .delete(`/api/v1/landlord/listings/${id}`)
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(422);
    expect(response.body.error.details[0].field).toBe("listingId");
    expect(listingQueries(executor)).toHaveLength(0);
  });

  it("accepts a leading-zero path and returns exact empty 204", async () => {
    const executor = new Executor();
    const { app, cleanupHandoff } = await makeApp(executor);
    const response = await request(app)
      .delete("/api/v1/landlord/listings/0007")
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(204);
    expect(response.text).toBe("");
    expect(response.headers["content-type"]).toBeUndefined();
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(executor.queries.find((query) => query.text.includes("FOR UPDATE OF l"))?.values).toStrictEqual([7, 9]);
    expect(cleanupHandoff.afterCommittedDelete).toHaveBeenCalledWith(["rentmate/a"]);
  });

  it.each(["{}", "null", "[]", '"text"', "1", "true", '{"field":1}'])("rejects parsed body %s", async (body) => {
    const executor = new Executor();
    const { app } = await makeApp(executor);
    const response = await request(app)
      .delete("/api/v1/landlord/listings/7")
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .set("Content-Type", "application/json")
      .send(body)
      .expect(422);
    expect(response.body.error.details[0]).toMatchObject({ field: "body", code: "INVALID_VALUE" });
    expect(listingQueries(executor)).toHaveLength(0);
  });

  it("preserves path, query, then body precedence and malformed JSON handling", async () => {
    const executor = new Executor();
    const { app } = await makeApp(executor);
    const auth = await cookie();
    const path = await request(app)
      .delete("/api/v1/landlord/listings/bad?x=1")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({})
      .expect(422);
    expect(path.body.error.details[0].field).toBe("listingId");
    const query = await request(app)
      .delete("/api/v1/landlord/listings/7?x=1")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({})
      .expect(422);
    expect(query.body.error.details[0].field).toBe("x");
    await request(app)
      .delete("/api/v1/landlord/listings/7")
      .set("Origin", origin)
      .set("Cookie", auth)
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
    expect(listingQueries(executor)).toHaveLength(0);
  });

  it("maps non-DRAFT, history, and stale conflicts exactly", async () => {
    for (const options of [
      {
        status: "APPROVED" as const,
        expectedCode: "LISTING_DELETE_NOT_ALLOWED",
        message: "The listing cannot be deleted."
      },
      { hasHistory: true, expectedCode: "LISTING_DELETE_NOT_ALLOWED", message: "The listing cannot be deleted." },
      { stale: true, expectedCode: "CONCURRENT_MODIFICATION", message: "The listing changed during this request." }
    ]) {
      const executor = new Executor();
      Object.assign(executor, options);
      const { app, cleanupHandoff } = await makeApp(executor);
      const response = await request(app)
        .delete("/api/v1/landlord/listings/7")
        .set("Origin", origin)
        .set("Cookie", await cookie())
        .expect(409);
      expect(response.body.error).toMatchObject({ code: options.expectedCode, message: options.message });
      expect(response.body.error.details).toBeUndefined();
      expect(cleanupHandoff.afterCommittedDelete).not.toHaveBeenCalled();
    }
  });

  it("uses equivalent owner-safe disclosure for missing and non-owned listings", async () => {
    for (const listingId of [7, 2_147_483_647]) {
      const executor = new Executor();
      executor.owned = false;
      const { app } = await makeApp(executor);
      const response = await request(app)
        .delete(`/api/v1/landlord/listings/${listingId}`)
        .set("Origin", origin)
        .set("Cookie", await cookie())
        .expect(404);
      expect(response.body.error).toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found."
      });
    }
  });

  it("returns owner-safe 404 when repeated after committed deletion", async () => {
    const executor = new Executor();
    const { app, cleanupHandoff } = await makeApp(executor);
    const auth = await cookie();
    await request(app).delete("/api/v1/landlord/listings/7").set("Origin", origin).set("Cookie", auth).expect(204);
    await request(app).delete("/api/v1/landlord/listings/7").set("Origin", origin).set("Cookie", auth).expect(404);
    expect(cleanupHandoff.afterCommittedDelete).toHaveBeenCalledOnce();
  });

  it("keeps existing routes, protects image delete, and omits admin, bulk, history, and cleanup routes", async () => {
    const executor = new Executor();
    const { app } = await makeApp(executor);
    await request(app).get("/api/v1/lookups/property-types").expect(200);
    await request(app).delete("/api/v1/landlord/listings").set("Origin", origin).expect(404);
    await request(app).delete("/api/v1/landlord/listings/7/images/3").set("Origin", origin).expect(401);
    await request(app).delete("/api/v1/admin/listings/7").set("Origin", origin).expect(404);
    await request(app).delete("/api/v1/landlord/listings/7/history").set("Origin", origin).expect(404);
    await request(app).post("/api/v1/landlord/listings/7/cleanup").set("Origin", origin).expect(404);
  });
});
