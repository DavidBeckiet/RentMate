import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";

const origin = "http://localhost:3000";
const secret = "rm023-http-test-only-secret";
const seconds = 1_900_000_000;
function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}
const listing = {
  id: 42,
  status: "DRAFT",
  property_type_id: null,
  property_type_code: null,
  property_type_label: null,
  property_type_is_active: null,
  title: null,
  description: null,
  monthly_rent: null,
  room_area_sqm: null,
  address_text: null,
  area_name: null,
  latitude: null,
  longitude: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z"
};
class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  stale = false;
  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FROM users"))
      return result([{ id: 8, role: "LANDLORD", is_active: true }] as unknown as Row[]);
    if (query.text.includes("FOR UPDATE OF l")) return result([listing] as unknown as Row[]);
    if (query.text.includes("FROM listing_amenities AS la")) return result([] as Row[]);
    if (query.text.includes("UPDATE listings")) return result([] as Row[], this.stale ? 0 : 1);
    if (query.text.includes("FROM listings AS l") && query.text.includes("l.landlord_id = $2"))
      return result([listing] as unknown as Row[]);
    if (query.text.includes("FROM listing_images")) return result([] as Row[]);
    if (query.text.includes("FROM property_types") || query.text.includes("FROM amenities")) return result([] as Row[]);
    throw new Error("Unexpected RM-023 HTTP SQL");
  }
}
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
async function makeApp(executor: Executor) {
  return createBackendApp({
    frontendOrigin: origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds,
    authRateLimitClock: () => 0,
    transactionRunner: async (operation) => operation(executor)
  });
}
async function token() {
  return createSessionTokenService({ secret, nowSeconds: () => seconds }).sign({ userId: 8, role: "LANDLORD" });
}

describe("RM-023 listing update HTTP", () => {
  it("enforces Origin before authentication and authentication before private SQL", async () => {
    const executor = new Executor();
    const app = await makeApp(executor);
    await request(app).patch("/api/v1/landlord/listings/42").send({}).expect(403);
    await request(app).patch("/api/v1/landlord/listings/42").set("Origin", origin).send({}).expect(401);
    expect(executor.queries).toHaveLength(0);
  });
  it("returns the exact owner detail for an authenticated empty no-op without setting a cookie", async () => {
    const executor = new Executor();
    const app = await makeApp(executor);
    const response = await request(app)
      .patch("/api/v1/landlord/listings/42")
      .set("Origin", origin)
      .set("Cookie", `rentmate_session=${await token()}`)
      .send({})
      .expect(200);
    expect(Object.keys(response.body.data).sort()).toStrictEqual(
      [
        "addressText",
        "amenities",
        "areaName",
        "createdAt",
        "currentModerationReason",
        "description",
        "id",
        "images",
        "latitude",
        "longitude",
        "monthlyRent",
        "propertyType",
        "roomAreaSqm",
        "status",
        "title",
        "updatedAt"
      ].sort()
    );
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(executor.queries.some((query) => query.text.includes("UPDATE listings"))).toBe(false);
  });
  it("honors path then query then body validation and maps a stale update to 409", async () => {
    const executor = new Executor();
    executor.stale = true;
    const app = await makeApp(executor);
    const cookie = `rentmate_session=${await token()}`;
    const path = await request(app)
      .patch("/api/v1/landlord/listings/bad?x=1")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ id: 1 })
      .expect(422);
    expect(path.body.error.details[0].field).toBe("listingId");
    const query = await request(app)
      .patch("/api/v1/landlord/listings/42?x=1")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ id: 1 })
      .expect(422);
    expect(query.body.error.details[0].field).toBe("x");
    await request(app)
      .patch("/api/v1/landlord/listings/42")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ title: "Changed" })
      .expect(409);
  });
});
