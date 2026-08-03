import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const secret = "rm021-http-test-only-secret-not-for-production";
const nowSeconds = 1_900_000_000;
const timestamp = "2026-07-29T07:15:00.000Z";

function result<Row extends QueryResultRow>(rows: Row[], command = "SELECT", rowCount = rows.length): QueryResult<Row> {
  return { command, rowCount, oid: 0, fields: [], rows };
}

const summaryRow = {
  id: 42,
  status: "APPROVED",
  title: "Studio",
  monthly_rent: "7500000",
  area_name: "District 1",
  updated_at: timestamp,
  property_type_code: "STUDIO",
  property_type_label: "Studio",
  cover_image_id: null,
  cover_image_url: null,
  cover_image_format: null,
  cover_image_width: null,
  cover_image_height: null,
  cover_image_byte_size: null,
  cover_image_display_order: null,
  cover_image_alt_text: null,
  cover_image_created_at: null,
  current_moderation_reason: null
};

const detailRow = {
  id: 42,
  status: "APPROVED",
  title: "Studio",
  description: "Private description",
  monthly_rent: "7500000",
  room_area_sqm: "28.50",
  address_text: "Exact address",
  area_name: "District 1",
  latitude: 10.772341,
  longitude: 106.697912,
  created_at: "2026-07-28T04:30:00.000Z",
  updated_at: timestamp,
  property_type_code: "STUDIO",
  property_type_label: "Studio"
};

class ReadExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  account: { id: number; role: UserRole; is_active: boolean } | null = null;
  summaries: QueryResultRow[] = [summaryRow];
  detail: QueryResultRow | null = detailRow;
  failure: Error | undefined;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (this.failure && query.text.includes("FROM listings AS l")) throw this.failure;
    if (query.text.includes("FROM users")) {
      return result((this.account === null ? [] : [this.account]) as unknown as Row[]);
    }
    if (query.text.includes("FROM listings AS l") && query.text.includes("LIMIT $3")) {
      return result(this.summaries as unknown as Row[]);
    }
    if (query.text.includes("FROM listings AS l") && query.text.includes("WHERE l.id = $1")) {
      const requestedId = query.values[0];
      return result((requestedId === 42 && this.detail !== null ? [this.detail] : []) as unknown as Row[]);
    }
    if (query.text.includes("FROM listing_amenities AS la")) {
      return result([{ code: "WIFI", label: "Wi-Fi" }] as unknown as Row[]);
    }
    if (query.text.includes("FROM listing_images")) {
      return result([
        {
          id: 91,
          secure_url: "https://cdn.example.test/image.webp",
          format: "webp",
          width: 800,
          height: 600,
          byte_size: 12345,
          display_order: 1,
          alt_text: null,
          created_at: "2026-07-28T05:00:00.000Z"
        }
      ] as unknown as Row[]);
    }
    if (query.text.includes("FROM moderation_history")) {
      return result([{ reason: "Current reason" }] as unknown as Row[]);
    }
    if (query.text.includes("FROM property_types")) {
      return result([{ code: "STUDIO", label: "Studio" }] as unknown as Row[]);
    }
    if (query.text.includes("FROM amenities")) {
      return result([{ code: "WIFI", label: "Wi-Fi" }] as unknown as Row[]);
    }
    throw new Error("Unexpected RM-021 application SQL.");
  }
}

class CreateExecutor implements SqlExecutor {
  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    if (query.text.includes("INSERT INTO listings")) {
      return result(
        [
          {
            id: 50,
            status: "DRAFT",
            title: null,
            description: null,
            monthly_rent: null,
            room_area_sqm: null,
            address_text: null,
            area_name: null,
            latitude: null,
            longitude: null,
            created_at: timestamp,
            updated_at: timestamp
          }
        ] as unknown as Row[],
        "INSERT"
      );
    }
    throw new Error("Unexpected RM-020 regression SQL.");
  }
}

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

async function token(userId: number, role: UserRole): Promise<string> {
  return createSessionTokenService({ secret, nowSeconds: () => nowSeconds }).sign({ userId, role });
}

async function makeApp(executor: ReadExecutor) {
  return createBackendApp({
    frontendOrigin: origin,
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => nowSeconds,
    authRateLimitClock: () => 0,
    transactionRunner: async (operation) => operation(new CreateExecutor())
  });
}

function ownerGet(app: Awaited<ReturnType<typeof makeApp>>, session: string, path: string) {
  return request(app).get(path).set("Cookie", `rentmate_session=${session}`);
}

describe("RM-021 owner listing read HTTP contract", () => {
  let executor: ReadExecutor;

  beforeEach(() => {
    executor = new ReadExecutor();
  });

  it("returns the exact default collection envelope without Origin or cookie refresh", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const app = await makeApp(executor);
    const response = await ownerGet(app, await token(17, "LANDLORD"), "/api/v1/landlord/listings").expect(200);

    expect(response.body).toStrictEqual({
      data: [
        {
          id: 42,
          status: "APPROVED",
          title: "Studio",
          monthlyRent: 7500000,
          areaName: "District 1",
          propertyType: { code: "STUDIO", label: "Studio" },
          coverImage: null,
          currentModerationReason: null,
          updatedAt: timestamp
        }
      ],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    const read = executor.queries.find((query) => query.text.includes("LIMIT $3"));
    expect(read?.values).toStrictEqual([17, null, 21, 0]);
  });

  it("normalizes status and custom pagination and supports an empty page", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    executor.summaries = [];
    const app = await makeApp(executor);
    const response = await ownerGet(
      app,
      await token(17, "LANDLORD"),
      "/api/v1/landlord/listings?status=%20draft%20&page=3&pageSize=2"
    ).expect(200);
    expect(response.body).toStrictEqual({ data: [], pagination: { page: 3, pageSize: 2, hasNextPage: false } });
    expect(executor.queries.find((query) => query.text.includes("LIMIT $3"))?.values).toStrictEqual([
      17,
      "DRAFT",
      3,
      4
    ]);
  });

  it.each([
    ["missing", undefined],
    ["invalid", "invalid-token"]
  ] as const)("returns 401 for %s authentication", async (_case, session) => {
    const app = await makeApp(executor);
    const operation = request(app).get("/api/v1/landlord/listings");
    if (session) operation.set("Cookie", `rentmate_session=${session}`);
    const response = await operation.expect(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(executor.queries).toHaveLength(0);
  });

  it("returns 401 for an inactive account", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: false };
    const app = await makeApp(executor);
    await ownerGet(app, await token(17, "LANDLORD"), "/api/v1/landlord/listings").expect(401);
    expect(executor.queries.some((query) => query.text.includes("FROM listings AS l"))).toBe(false);
  });

  it.each(["TENANT", "ADMIN"] as const)("returns 403 for an active %s", async (role) => {
    executor.account = { id: 17, role, is_active: true };
    const app = await makeApp(executor);
    await ownerGet(app, await token(17, role), "/api/v1/landlord/listings").expect(403);
    expect(executor.queries.some((query) => query.text.includes("FROM listings AS l"))).toBe(false);
  });

  it.each([
    "anything=x",
    "page=1&page=2",
    "page=0",
    "pageSize=101",
    "status=DRAFT&status=PENDING",
    "status=DRAFT,PENDING"
  ])("rejects invalid collection query %s before owner SQL", async (query) => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const app = await makeApp(executor);
    await ownerGet(app, await token(17, "LANDLORD"), `/api/v1/landlord/listings?${query}`).expect(422);
    expect(executor.queries.some((statement) => statement.text.includes("LIMIT $3"))).toBe(false);
  });

  it("rejects a parsed GET body and gives query validation precedence", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const app = await makeApp(executor);
    await ownerGet(app, await token(17, "LANDLORD"), "/api/v1/landlord/listings")
      .set("Content-Type", "application/json")
      .send("{}")
      .expect(422);
    const response = await ownerGet(app, await token(17, "LANDLORD"), "/api/v1/landlord/listings?bad=x")
      .set("Content-Type", "application/json")
      .send("{}")
      .expect(422);
    expect(response.body.error.details[0].field).toBe("bad");
  });

  it("preserves global malformed JSON handling", async () => {
    const app = await makeApp(executor);
    const response = await request(app)
      .get("/api/v1/landlord/listings")
      .set("Content-Type", "application/json")
      .send("{bad-json")
      .expect(400);
    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
  });

  it("returns exact private owner detail with exact coordinates and private images", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const app = await makeApp(executor);
    const response = await ownerGet(app, await token(17, "LANDLORD"), "/api/v1/landlord/listings/00042").expect(200);

    expect(response.body.data).toStrictEqual({
      id: 42,
      status: "APPROVED",
      title: "Studio",
      description: "Private description",
      monthlyRent: 7500000,
      roomAreaSqm: 28.5,
      addressText: "Exact address",
      areaName: "District 1",
      latitude: 10.772341,
      longitude: 106.697912,
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [{ code: "WIFI", label: "Wi-Fi" }],
      images: [
        {
          id: 91,
          url: "https://cdn.example.test/image.webp",
          format: "webp",
          width: 800,
          height: 600,
          byteSize: 12345,
          displayOrder: 1,
          altText: null,
          createdAt: "2026-07-28T05:00:00.000Z"
        }
      ],
      currentModerationReason: null,
      createdAt: "2026-07-28T04:30:00.000Z",
      updatedAt: timestamp
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/landlordId|cloudinary|secure_url|listing_id|SELECT|stack/i);
  });

  it("returns identical owner-scoped 404 envelopes for missing and non-owned detail", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const app = await makeApp(executor);
    const session = await token(17, "LANDLORD");
    const missing = await ownerGet(app, session, "/api/v1/landlord/listings/99").expect(404);
    const nonOwned = await ownerGet(app, session, "/api/v1/landlord/listings/43").expect(404);
    const shape = (body: typeof missing.body) => ({
      code: body.error.code,
      message: body.error.message,
      details: body.error.details
    });
    expect(shape(missing.body)).toStrictEqual(shape(nonOwned.body));
    expect(missing.body.error.message).toBe("The requested resource was not found.");
    expect(nonOwned.body.error.message).toBe("The requested resource was not found.");
  });

  it.each(["0", "-1", "1.5", "abc", "2147483648"])("rejects invalid detail ID %s", async (id) => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const app = await makeApp(executor);
    await ownerGet(app, await token(17, "LANDLORD"), `/api/v1/landlord/listings/${id}`).expect(422);
  });

  it("validates detail path before query and body", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const app = await makeApp(executor);
    const response = await ownerGet(app, await token(17, "LANDLORD"), "/api/v1/landlord/listings/bad?anything=x")
      .set("Content-Type", "application/json")
      .send("{}")
      .expect(422);
    expect(response.body.error.details[0].field).toBe("listingId");
  });

  it("sanitizes owner-read infrastructure failures", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    executor.failure = new Error("private SQL and raw row detail");
    const app = await makeApp(executor);
    const response = await ownerGet(app, await token(17, "LANDLORD"), "/api/v1/landlord/listings").expect(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/private SQL|raw row|stack/i);
  });

  it("preserves RM-019 lookups, RM-020 create, and excludes later listing routes", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const app = await makeApp(executor);
    await request(app).get("/api/v1/lookups/property-types").expect(200);
    await request(app).get("/api/v1/lookups/amenities").expect(200);
    await request(app)
      .post("/api/v1/landlord/listings")
      .set("Origin", origin)
      .set("Cookie", `rentmate_session=${await token(17, "LANDLORD")}`)
      .send({})
      .expect(201);
    await request(app).patch("/api/v1/landlord/listings/42").set("Origin", origin).expect(404);
    await request(app).delete("/api/v1/landlord/listings/42").set("Origin", origin).expect(404);
    await request(app).get("/api/v1/listings").expect(404);
  });
});
