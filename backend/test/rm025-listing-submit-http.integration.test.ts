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
const secret = "rm025-http-test-only-secret";
const seconds = 1_900_000_000;

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  accountRole: UserRole = "LANDLORD";
  status: ListingStatus = "DRAFT";
  owned = true;
  complete = true;
  amenityReferencesKnown = true;
  hasImage = true;
  stale = false;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FROM users")) {
      return result([{ id: 9, role: this.accountRole, is_active: true }] as unknown as Row[]);
    }
    if (query.text.includes("FOR UPDATE OF l")) {
      if (!this.owned) return result([] as Row[]);
      return result([
        {
          id: 7,
          status: this.status,
          property_type_present: this.complete,
          property_type_known: this.complete,
          property_type_code: this.complete ? "STUDIO" : null,
          property_type_label: this.complete ? "Studio" : null,
          title: this.complete ? "Title" : null,
          description: this.complete ? "Description" : null,
          monthly_rent: this.complete ? "5000000" : null,
          room_area_sqm: this.complete ? "25.00" : null,
          address_text: this.complete ? "Private address" : null,
          area_name: this.complete ? "District" : null,
          latitude: this.complete ? 10.75 : null,
          longitude: this.complete ? 106.67 : null,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z"
        }
      ] as unknown as Row[]);
    }
    if (query.text.includes("SELECT NOT EXISTS")) {
      return result([{ result: this.amenityReferencesKnown }] as unknown as Row[]);
    }
    if (query.text.includes("SELECT EXISTS") && query.text.includes("listing_images")) {
      return result([{ result: this.hasImage }] as unknown as Row[]);
    }
    if (query.text.includes("UPDATE listings")) return result([] as Row[], this.stale ? 0 : 1);
    if (query.text.includes("FROM listings AS l") && query.text.includes("l.landlord_id = $2")) {
      return result([
        {
          id: 7,
          status: "PENDING",
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
      return result(
        this.hasImage
          ? ([
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
            ] as unknown as Row[])
          : ([] as Row[])
      );
    }
    throw new Error("Unexpected RM-025 HTTP SQL");
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

describe("RM-025 listing submit HTTP", () => {
  it("enforces Origin, authentication, then landlord role without listing SQL", async () => {
    const executor = new Executor();
    const app = await makeApp(executor);
    await request(app).post("/api/v1/landlord/listings/7/submit").expect(403);
    await request(app).post("/api/v1/landlord/listings/7/submit").set("Origin", origin).expect(401);
    expect(executor.queries).toHaveLength(0);

    executor.accountRole = "TENANT";
    await request(app)
      .post("/api/v1/landlord/listings/7/submit")
      .set("Origin", origin)
      .set("Cookie", await cookie("TENANT"))
      .expect(403);
    expect(executor.queries).toHaveLength(1);
  });

  it("accepts only a genuinely absent body and returns the exact owner detail without cookies", async () => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .post("/api/v1/landlord/listings/7/submit")
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
    expect(response.body.data).toMatchObject({ status: "PENDING", currentModerationReason: null });
    expect(response.body.data.images).toHaveLength(1);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it.each(["{}", "null", "[]", '"text"', "1", "true", '{"field":1}'])("rejects parsed body %s", async (body) => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .post("/api/v1/landlord/listings/7/submit")
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .set("Content-Type", "application/json")
      .send(body)
      .expect(422);
    expect(response.body.error.details[0]).toMatchObject({ field: "body", code: "INVALID_VALUE" });
    expect(executor.queries).toHaveLength(1);
  });

  it("preserves path then query then body validation and malformed JSON handling", async () => {
    const executor = new Executor();
    const app = await makeApp(executor);
    const auth = await cookie();
    const path = await request(app)
      .post("/api/v1/landlord/listings/bad/submit?x=1")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({})
      .expect(422);
    expect(path.body.error.details[0].field).toBe("listingId");
    const query = await request(app)
      .post("/api/v1/landlord/listings/7/submit?x=1")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({})
      .expect(422);
    expect(query.body.error.details[0].field).toBe("x");
    await request(app)
      .post("/api/v1/landlord/listings/7/submit")
      .set("Origin", origin)
      .set("Cookie", auth)
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
  });

  it.each(["0", "-1", "1.5", "text", "%20", "1x", "2147483648"])("rejects invalid path %s", async (id) => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .post(`/api/v1/landlord/listings/${id}/submit`)
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(422);
    expect(response.body.error.details[0].field).toBe("listingId");
    expect(executor.queries).toHaveLength(1);
  });

  it("preserves leading-zero path behavior", async () => {
    const executor = new Executor();
    await request(await makeApp(executor))
      .post("/api/v1/landlord/listings/0007/submit")
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(200);
    expect(executor.queries.find((query) => query.text.includes("FOR UPDATE OF l"))?.values).toStrictEqual([7, 9]);
  });

  it.each([
    ["missing", { owned: false }, 404, "RESOURCE_NOT_FOUND"],
    ["invalid transition", { status: "PENDING" }, 409, "INVALID_LISTING_TRANSITION"],
    ["incomplete", { complete: false }, 422, "VALIDATION_FAILED"],
    ["broken amenities", { amenityReferencesKnown: false }, 422, "VALIDATION_FAILED"],
    ["missing image", { hasImage: false }, 422, "VALIDATION_FAILED"],
    ["stale", { stale: true }, 409, "CONCURRENT_MODIFICATION"]
  ] as const)("maps %s", async (_name, options, status, code) => {
    const executor = new Executor();
    Object.assign(executor, options);
    const response = await request(await makeApp(executor))
      .post("/api/v1/landlord/listings/7/submit")
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(status);
    expect(response.body.error.code).toBe(code);
  });

  it("keeps HIDDEN submission explicit and leaves adjacent routes absent", async () => {
    const executor = new Executor();
    executor.status = "HIDDEN";
    await request(await makeApp(executor))
      .post("/api/v1/landlord/listings/7/submit")
      .set("Origin", origin)
      .set("Cookie", await cookie())
      .expect(200);
    const app = await makeApp(new Executor());
    for (const path of ["deactivate", "reactivate", "images"]) {
      await request(app).post(`/api/v1/landlord/listings/7/${path}`).set("Origin", origin).expect(404);
    }
    await request(app).delete("/api/v1/landlord/listings/7").set("Origin", origin).expect(404);
  });
});
