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
const jwtSecret = "rm028-contract-test-only-secret";
const nowSeconds = 1_900_000_000;

function result<Row extends QueryResultRow>(rows: Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return { command: "SELECT", rowCount, oid: 0, fields: [], rows };
}

class LifecycleExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  accountRole: UserRole = "LANDLORD";
  accountActive = true;
  owned = true;
  status: ListingStatus = "DRAFT";
  deleted = false;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FROM users")) {
      return result([{ id: 9, role: this.accountRole, is_active: this.accountActive }] as unknown as Row[]);
    }
    if (query.text.includes("FOR UPDATE OF l")) {
      if (!this.owned || this.deleted) return result([] as Row[]);
      if (query.text.includes("property_type_present")) {
        return result([
          {
            ...this.baseListing(),
            property_type_present: true,
            property_type_known: true
          }
        ] as unknown as Row[]);
      }
      if (query.text.includes("property_type_id")) {
        return result([
          {
            ...this.baseListing(),
            property_type_id: 2,
            property_type_is_active: true
          }
        ] as unknown as Row[]);
      }
      return result([{ id: 7, status: this.status }] as unknown as Row[]);
    }
    if (query.text.includes("SELECT NOT EXISTS") && query.text.includes("listing_amenities")) {
      return result([{ result: true }] as unknown as Row[]);
    }
    if (query.text.includes("SELECT EXISTS") && query.text.includes("listing_images")) {
      return result([{ result: true }] as unknown as Row[]);
    }
    if (query.text.includes("SELECT EXISTS") && query.text.includes("moderation_history")) {
      return result([{ has_moderation_history: false }] as unknown as Row[]);
    }
    if (query.text.includes("SELECT cloudinary_public_id")) {
      return result([{ cloudinary_public_id: "rm028/contract-image" }] as unknown as Row[]);
    }
    if (query.text.includes("FROM listing_amenities AS la")) {
      return result([{ id: 3, code: "WIFI", label: "Wi-Fi", is_active: true }] as unknown as Row[]);
    }
    if (query.text.includes("FROM listing_images")) {
      return result([
        {
          id: 4,
          secure_url: "https://example.test/rm028.webp",
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
    if (query.text.includes("FROM moderation_history")) {
      return result([{ reason: `Current ${this.status.toLowerCase()} reason` }] as unknown as Row[]);
    }
    if (query.text.includes("FROM property_types") && query.text.includes("code = $1")) {
      return result([{ id: 2, code: "STUDIO", label: "Studio", is_active: true }] as unknown as Row[]);
    }
    if (query.text.includes("FROM amenities") && query.text.includes("ANY")) {
      return result([{ id: 3, code: "WIFI", label: "Wi-Fi", is_active: true }] as unknown as Row[]);
    }
    if (query.text.includes("UPDATE listings")) {
      if (query.text.includes("SET status = 'PENDING'")) this.status = "PENDING";
      else if (query.text.includes("SET status = $1::listing_status")) this.status = query.values[0] as ListingStatus;
      else this.status = query.values[4] as ListingStatus;
      return result([] as Row[], 1);
    }
    if (query.text.includes("DELETE FROM listings")) {
      this.deleted = true;
      return result([] as Row[], 1);
    }
    if (query.text.includes("FROM listings AS l") && query.text.includes("l.landlord_id = $2")) {
      return this.deleted ? result([] as Row[]) : result([this.baseListing()] as unknown as Row[]);
    }
    throw new Error(`Unexpected RM-028 contract SQL: ${query.text}`);
  }

  private baseListing() {
    return {
      id: 7,
      status: this.status,
      property_type_code: "STUDIO",
      property_type_label: "Studio",
      title: "RM-028 contract listing",
      description: "Private owner description",
      monthly_rent: "5000000",
      room_area_sqm: "25.00",
      address_text: "7 Private Street",
      area_name: "District 1",
      latitude: 10.75,
      longitude: 106.67,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:01:00.000Z"
    };
  }
}

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

async function makeApp(executor: LifecycleExecutor) {
  return createBackendApp({
    frontendOrigin: origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => nowSeconds,
    authRateLimitClock: () => 0,
    transactionRunner: async (operation) => operation(executor)
  });
}

async function cookie(role: UserRole = "LANDLORD"): Promise<string> {
  const token = await createSessionTokenService({ secret: jwtSecret, nowSeconds: () => nowSeconds }).sign({
    userId: 9,
    role
  });
  return `rentmate_session=${token}`;
}

function patchRequest(app: Awaited<ReturnType<typeof makeApp>>, auth: string, path = "7") {
  return request(app).patch(`/api/v1/landlord/listings/${path}`).set("Origin", origin).set("Cookie", auth);
}

describe("RM-028 listing lifecycle HTTP contract closure", () => {
  it("distinguishes a missing PATCH body from the valid empty-object no-op", async () => {
    const executor = new LifecycleExecutor();
    const app = await makeApp(executor);
    const auth = await cookie();

    const missing = await patchRequest(app, auth).expect(422);
    expect(missing.body.error.details[0]).toMatchObject({ field: "body", code: "INVALID_TYPE" });

    const noOp = await patchRequest(app, auth).send({}).expect(200);
    expect(noOp.body.data).toMatchObject({ id: 7, status: "DRAFT" });
    expect(executor.queries.some((query) => query.text.includes("UPDATE listings"))).toBe(false);
  });

  it.each(["null", "[]", '"text"', "1", "true"])("rejects parsed PATCH body %s", async (body) => {
    const executor = new LifecycleExecutor();
    const response = await patchRequest(await makeApp(executor), await cookie())
      .set("Content-Type", "application/json")
      .send(body)
      .expect(422);
    expect(response.body.error.details[0]).toMatchObject({ field: "body", code: "INVALID_TYPE" });
    expect(executor.queries.filter((query) => query.text.includes("FOR UPDATE OF l"))).toHaveLength(0);
  });

  it.each([
    ["unknown", { surprise: true }, "surprise"],
    ["protected status", { status: "APPROVED" }, "status"],
    ["protected identity", { landlordId: 1 }, "landlordId"],
    ["protected timestamp", { updatedAt: "2026-08-01T00:00:00.000Z" }, "updatedAt"]
  ] as const)("rejects %s PATCH fields", async (_name, body, field) => {
    const executor = new LifecycleExecutor();
    const response = await patchRequest(await makeApp(executor), await cookie())
      .send(body)
      .expect(422);
    expect(response.body.error.details[0]).toMatchObject({ field, code: "UNKNOWN_FIELD" });
  });

  it("preserves path, query, body precedence and global malformed-JSON handling", async () => {
    const executor = new LifecycleExecutor();
    const app = await makeApp(executor);
    const auth = await cookie();
    const pathResponse = await request(app)
      .patch("/api/v1/landlord/listings/bad?x=1")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({ status: "APPROVED" })
      .expect(422);
    expect(pathResponse.body.error.details[0].field).toBe("listingId");

    const queryResponse = await request(app)
      .patch("/api/v1/landlord/listings/7?x=1")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({ status: "APPROVED" })
      .expect(422);
    expect(queryResponse.body.error.details[0].field).toBe("x");

    const bodyResponse = await patchRequest(app, auth).send({ status: "APPROVED" }).expect(422);
    expect(bodyResponse.body.error.details[0].field).toBe("status");

    const malformed = await patchRequest(app, auth).set("Content-Type", "application/json").send("{").expect(400);
    expect(malformed.body.error.code).toBe("MALFORMED_REQUEST");
  });

  it("accepts a leading-zero PATCH listing ID consistently", async () => {
    const executor = new LifecycleExecutor();
    await patchRequest(await makeApp(executor), await cookie(), "0007")
      .send({})
      .expect(200);
    expect(executor.queries.find((query) => query.text.includes("FOR UPDATE OF l"))?.values).toStrictEqual([7, 9]);
  });

  it("returns 401 for missing, invalid, and inactive authentication", async () => {
    const missingExecutor = new LifecycleExecutor();
    await request(await makeApp(missingExecutor))
      .patch("/api/v1/landlord/listings/7")
      .set("Origin", origin)
      .send({})
      .expect(401);
    await request(await makeApp(new LifecycleExecutor()))
      .patch("/api/v1/landlord/listings/7")
      .set("Origin", origin)
      .set("Cookie", "rentmate_session=invalid")
      .send({})
      .expect(401);
    const inactive = new LifecycleExecutor();
    inactive.accountActive = false;
    await patchRequest(await makeApp(inactive), await cookie())
      .send({})
      .expect(401);
    expect(missingExecutor.queries).toHaveLength(0);
    expect(inactive.queries.filter((query) => query.text.includes("FOR UPDATE OF l"))).toHaveLength(0);
  });

  it.each(["TENANT", "ADMIN"] as const)("returns 403 for an active %s", async (role) => {
    const executor = new LifecycleExecutor();
    executor.accountRole = role;
    await patchRequest(await makeApp(executor), await cookie(role))
      .send({})
      .expect(403);
    expect(executor.queries.filter((query) => query.text.includes("FOR UPDATE OF l"))).toHaveLength(0);
  });

  it("normalizes missing and non-owner PATCH responses without leaking private listing data", async () => {
    const executor = new LifecycleExecutor();
    executor.owned = false;
    const app = await makeApp(executor);
    const auth = await cookie();
    const nonOwner = await patchRequest(app, auth).send({}).expect(404);
    const missing = await patchRequest(app, auth, "2147483647").send({}).expect(404);
    for (const response of [nonOwner, missing]) {
      expect(response.body.error).toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found."
      });
      expect(JSON.stringify(response.body)).not.toMatch(/Private Street|latitude|longitude|landlord|cloudinary/i);
    }
  });

  it.each([
    ["patch", "DRAFT"],
    ["submit", "DRAFT"],
    ["deactivate", "APPROVED"],
    ["reactivate", "INACTIVE"],
    ["delete", "DRAFT"]
  ] as const)("never sets a session cookie for %s", async (operation, sourceStatus) => {
    const executor = new LifecycleExecutor();
    executor.status = sourceStatus;
    const app = await makeApp(executor);
    const auth = await cookie();
    const response =
      operation === "patch"
        ? await patchRequest(app, auth).send({}).expect(200)
        : operation === "delete"
          ? await request(app)
              .delete("/api/v1/landlord/listings/7")
              .set("Origin", origin)
              .set("Cookie", auth)
              .expect(204)
          : await request(app)
              .post(`/api/v1/landlord/listings/7/${operation}`)
              .set("Origin", origin)
              .set("Cookie", auth)
              .expect(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
});
