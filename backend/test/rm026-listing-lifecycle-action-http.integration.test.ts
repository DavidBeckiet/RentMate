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
const secret = "rm026-http-test-only-secret";
const seconds = 1_900_000_000;

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  accountRole: UserRole = "LANDLORD";
  accountActive = true;
  status: ListingStatus = "APPROVED";
  owned = true;
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
    if (query.text.includes("UPDATE listings")) {
      if (!this.stale) this.status = query.values[0] as ListingStatus;
      return result([] as Row[], this.stale ? 0 : 1);
    }
    if (query.text.includes("FROM listings AS l") && query.text.includes("l.landlord_id = $2")) {
      return result([
        {
          id: 7,
          status: this.status,
          title: "Title",
          description: "Description",
          monthly_rent: "5000000",
          room_area_sqm: "25.00",
          address_text: "Private address",
          area_name: "District",
          latitude: 10.75,
          longitude: 106.67,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:01:00.000Z",
          property_type_code: "STUDIO",
          property_type_label: "Studio"
        }
      ] as unknown as Row[]);
    }
    if (query.text.includes("FROM listing_amenities AS la")) return result([] as Row[]);
    if (query.text.includes("FROM listing_images")) {
      return result([
        {
          id: 3,
          secure_url: "https://example.test/image.webp",
          format: "webp",
          width: 800,
          height: 600,
          byte_size: 1234,
          display_order: 1,
          alt_text: null,
          created_at: "2026-08-01T00:00:30.000Z"
        }
      ] as unknown as Row[]);
    }
    throw new Error("Unexpected RM-026 HTTP SQL");
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

async function cookie(role: UserRole = "LANDLORD") {
  const token = await createSessionTokenService({ secret, nowSeconds: () => seconds }).sign({ userId: 9, role });
  return `rentmate_session=${token}`;
}

const actions = [
  { path: "deactivate", source: "APPROVED", result: "INACTIVE" },
  { path: "reactivate", source: "INACTIVE", result: "APPROVED" }
] as const;

describe("RM-026 listing lifecycle action HTTP", () => {
  it.each(actions)("enforces Origin and authentication before $path listing SQL", async ({ path }) => {
    const executor = new Executor();
    const app = await makeApp(executor);
    await request(app).post(`/api/v1/landlord/listings/7/${path}`).expect(403);
    await request(app).post(`/api/v1/landlord/listings/7/${path}`).set("Origin", origin).expect(401);
    await request(app)
      .post(`/api/v1/landlord/listings/7/${path}`)
      .set("Origin", origin)
      .set("Cookie", "rentmate_session=invalid")
      .expect(401);
    expect(executor.queries).toHaveLength(0);
  });

  it.each(actions)("returns exact final owner detail for legal $path", async ({ path, source, result: status }) => {
    const executor = new Executor();
    executor.status = source;
    const response = await request(await makeApp(executor))
      .post(`/api/v1/landlord/listings/7/${path}`)
      .set("Origin", origin)
      .set("Cookie", await cookie())
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
    expect(response.body.data).toMatchObject({ status, currentModerationReason: null });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(executor.queries.filter((query) => query.text.includes("UPDATE listings"))).toHaveLength(1);
  });

  it.each(actions)("accepts leading zeros for $path", async ({ path, source }) => {
    const executor = new Executor();
    executor.status = source;
    await request(await makeApp(executor))
      .post(`/api/v1/landlord/listings/0007/${path}`)
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(200);
    expect(executor.queries.find((query) => query.text.includes("FOR UPDATE OF l"))?.values).toStrictEqual([7, 9]);
  });

  it.each(
    actions.flatMap((action) =>
      ["{}", "null", "[]", '"text"', "1", "true", '{"field":1}'].map((body) => [action, body] as const)
    )
  )("rejects parsed body for %s: %s", async (action, body) => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .post(`/api/v1/landlord/listings/7/${action.path}`)
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .set("Content-Type", "application/json")
      .send(body)
      .expect(422);
    expect(response.body.error.details[0]).toMatchObject({ field: "body", code: "INVALID_VALUE" });
    expect(executor.queries).toHaveLength(1);
  });

  it.each(["0", "-1", "1.5", "text", "%20", "1x", "2147483648"])("rejects invalid path %s", async (id) => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .post(`/api/v1/landlord/listings/${id}/deactivate`)
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(422);
    expect(response.body.error.details[0].field).toBe("listingId");
    expect(executor.queries).toHaveLength(1);
  });

  it("preserves path, query, then body precedence and malformed JSON handling", async () => {
    const executor = new Executor();
    const app = await makeApp(executor);
    const auth = await cookie();
    const path = await request(app)
      .post("/api/v1/landlord/listings/bad/deactivate?x=1")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({})
      .expect(422);
    expect(path.body.error.details[0].field).toBe("listingId");
    const query = await request(app)
      .post("/api/v1/landlord/listings/7/deactivate?x=1")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({})
      .expect(422);
    expect(query.body.error.details[0].field).toBe("x");
    await request(app)
      .post("/api/v1/landlord/listings/7/deactivate")
      .set("Origin", origin)
      .set("Cookie", auth)
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
  });

  it.each(["TENANT", "ADMIN"] as const)("rejects active %s before lifecycle SQL", async (role) => {
    const executor = new Executor();
    executor.accountRole = role;
    await request(await makeApp(executor))
      .post("/api/v1/landlord/listings/7/deactivate")
      .set("Origin", origin)
      .set("Cookie", await cookie(role))
      .expect(403);
    expect(executor.queries).toHaveLength(1);
  });

  it("rejects inactive authentication before lifecycle SQL", async () => {
    const executor = new Executor();
    executor.accountActive = false;
    await request(await makeApp(executor))
      .post("/api/v1/landlord/listings/7/deactivate")
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(401);
    expect(executor.queries).toHaveLength(1);
  });

  it.each([
    ["missing", "deactivate", { owned: false }, 404, "RESOURCE_NOT_FOUND"],
    ["invalid deactivate", "deactivate", { status: "INACTIVE" }, 409, "INVALID_LISTING_TRANSITION"],
    ["invalid reactivate", "reactivate", { status: "APPROVED" }, 409, "INVALID_LISTING_TRANSITION"],
    ["stale", "deactivate", { stale: true }, 409, "CONCURRENT_MODIFICATION"]
  ] as const)("maps %s", async (_name, action, options, status, code) => {
    const executor = new Executor();
    Object.assign(executor, options);
    const response = await request(await makeApp(executor))
      .post(`/api/v1/landlord/listings/7/${action}`)
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(status);
    expect(response.body.error.code).toBe(code);
  });

  it("uses equivalent owner-safe disclosure for missing and non-owned listings", async () => {
    const executor = new Executor();
    executor.owned = false;
    const app = await makeApp(executor);
    const auth = await cookie();
    const other = await request(app)
      .post("/api/v1/landlord/listings/7/deactivate")
      .set("Origin", origin)
      .set("Cookie", auth)
      .expect(404);
    const missing = await request(app)
      .post("/api/v1/landlord/listings/2147483647/deactivate")
      .set("Origin", origin)
      .set("Cookie", auth)
      .expect(404);
    expect(other.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(missing.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
  });

  it("keeps existing lookups, protects delete, and omits generic lifecycle, image, public, and admin routes", async () => {
    const app = await makeApp(new Executor());
    await request(app).get("/api/v1/lookups/property-types").expect(200);
    for (const path of ["lifecycle", "status"]) {
      await request(app).post(`/api/v1/landlord/listings/7/${path}`).set("Origin", origin).expect(404);
    }
    await request(app).delete("/api/v1/landlord/listings/7/images/3").set("Origin", origin).expect(404);
    await request(app).put("/api/v1/landlord/listings/7/images/order").set("Origin", origin).expect(404);
    await request(app).delete("/api/v1/landlord/listings/7").set("Origin", origin).expect(401);
    await request(app).get("/api/v1/listings").expect(404);
    await request(app).get("/api/v1/admin/listings").expect(404);
  });
});
