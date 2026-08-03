import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const frontendOrigin = "http://localhost:3000";
const jwtSecret = "rm020-http-test-only-secret-not-for-production";
const nowSeconds = 1_900_000_000;
const createdAt = new Date("2030-03-17T17:46:40.000Z");

function queryResult<Row extends QueryResultRow>(
  rows: Row[],
  command = "SELECT",
  rowCount: number | null = rows.length
): QueryResult<Row> {
  return { command, rowCount, oid: 0, fields: [], rows };
}

class ApplicationExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  account: Readonly<{ id: number; role: UserRole; is_active: boolean }> | null = null;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FROM users")) {
      return queryResult((this.account === null ? [] : [this.account]) as unknown as Row[]);
    }
    if (query.text.includes("FROM property_types")) {
      return queryResult([{ code: "STUDIO", label: "Studio" }] as unknown as Row[]);
    }
    if (query.text.includes("FROM amenities")) {
      return queryResult([{ code: "WIFI", label: "Wi-Fi" }] as unknown as Row[]);
    }
    throw new Error("Unexpected SQL through the ordinary RM-020 application executor.");
  }
}

class CreateTransactionExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  propertyTypeAvailable = true;
  unavailableAmenityCodes = new Set<string>();
  failure: Error | undefined;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (this.failure) {
      throw this.failure;
    }
    if (query.text.includes("FROM property_types")) {
      return queryResult(
        (this.propertyTypeAvailable ? [{ id: 2, code: "STUDIO", label: "Studio" }] : []) as unknown as Row[]
      );
    }
    if (query.text.includes("FROM amenities")) {
      const requested = (query.values[0] as string[]).filter((code) => !this.unavailableAmenityCodes.has(code));
      const values = requested
        .map((code) => (code === "FURNISHED" ? { id: 3, code, label: "Furnished" } : { id: 2, code, label: "Wi-Fi" }))
        .sort((left, right) => left.label.localeCompare(right.label) || left.code.localeCompare(right.code));
      return queryResult(values as unknown as Row[]);
    }
    if (query.text.includes("INSERT INTO listings")) {
      return queryResult(
        [
          {
            id: 42,
            status: "DRAFT",
            title: query.values[2],
            description: query.values[3],
            monthly_rent: query.values[4] === null ? null : String(query.values[4]),
            room_area_sqm: query.values[5] === null ? null : String(query.values[5]),
            address_text: query.values[6],
            area_name: query.values[7],
            latitude: query.values[8],
            longitude: query.values[9],
            created_at: createdAt,
            updated_at: createdAt
          }
        ] as unknown as Row[],
        "INSERT"
      );
    }
    if (query.text.includes("INSERT INTO listing_amenities")) {
      return queryResult([], "INSERT", (query.values[1] as number[]).length);
    }
    throw new Error("Unexpected SQL through the RM-020 transaction executor.");
  }
}

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

async function signToken(userId: number, role: UserRole): Promise<string> {
  return createSessionTokenService({ secret: jwtSecret, nowSeconds: () => nowSeconds }).sign({ userId, role });
}

async function makeApp(
  applicationExecutor: ApplicationExecutor,
  transactionExecutor: CreateTransactionExecutor,
  transactionRunner?: TransactionRunner
) {
  return createBackendApp({
    frontendOrigin,
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: applicationExecutor,
    jwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => nowSeconds,
    authRateLimitClock: () => 0,
    transactionRunner:
      transactionRunner ??
      (async <Value>(operation: (executor: SqlExecutor) => Promise<Value>): Promise<Value> =>
        operation(transactionExecutor))
  });
}

function authenticatedPost(
  app: Awaited<ReturnType<typeof makeApp>>,
  token: string,
  body?: string | object,
  path = "/api/v1/landlord/listings"
) {
  const operation = request(app).post(path).set("Origin", frontendOrigin).set("Cookie", `rentmate_session=${token}`);
  return body === undefined ? operation : operation.send(body);
}

describe("RM-020 listing-create HTTP contract", () => {
  let applicationExecutor: ApplicationExecutor;
  let transactionExecutor: CreateTransactionExecutor;

  beforeEach(() => {
    applicationExecutor = new ApplicationExecutor();
    transactionExecutor = new CreateTransactionExecutor();
  });

  it("lets an active landlord create an exact empty DRAFT without issuing a cookie", async () => {
    applicationExecutor.account = { id: 17, role: "LANDLORD", is_active: true };
    const token = await signToken(17, "LANDLORD");
    const app = await makeApp(applicationExecutor, transactionExecutor);
    const response = await authenticatedPost(app, token, {}).expect(201);

    expect(response.body).toStrictEqual({
      data: {
        id: 42,
        status: "DRAFT",
        title: null,
        description: null,
        monthlyRent: null,
        roomAreaSqm: null,
        addressText: null,
        areaName: null,
        latitude: null,
        longitude: null,
        propertyType: null,
        amenities: [],
        images: [],
        currentModerationReason: null,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString()
      }
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(/landlordId|propertyTypeId|amenityId|jwt|cookie|SELECT|INSERT/i);
    expect(applicationExecutor.queries).toHaveLength(1);
    expect(transactionExecutor.queries).toHaveLength(1);
  });

  it("normalizes and returns an exact partial owner detail", async () => {
    applicationExecutor.account = { id: 17, role: "LANDLORD", is_active: true };
    const token = await signToken(17, "LANDLORD");
    const app = await makeApp(applicationExecutor, transactionExecutor);
    const response = await authenticatedPost(app, token, {
      title: "  Compact studio  ",
      monthlyRent: 7500000,
      propertyTypeCode: " studio ",
      roomAreaSqm: 28.5,
      latitude: 10.772341,
      longitude: 106.697912,
      amenityCodes: ["wifi", " furnished "]
    }).expect(201);

    expect(response.body.data).toStrictEqual({
      id: 42,
      status: "DRAFT",
      title: "Compact studio",
      description: null,
      monthlyRent: 7500000,
      roomAreaSqm: 28.5,
      addressText: null,
      areaName: null,
      latitude: 10.772341,
      longitude: 106.697912,
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [
        { code: "FURNISHED", label: "Furnished" },
        { code: "WIFI", label: "Wi-Fi" }
      ],
      images: [],
      currentModerationReason: null,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString()
    });
  });

  it.each([
    ["missing", undefined],
    ["invalid", "invalid-token"]
  ] as const)("returns 401 for a %s session", async (_case, token) => {
    const app = await makeApp(applicationExecutor, transactionExecutor);
    const operation = request(app).post("/api/v1/landlord/listings").set("Origin", frontendOrigin);
    if (token) {
      operation.set("Cookie", `rentmate_session=${token}`);
    }
    const response = await operation.send({}).expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(applicationExecutor.queries).toHaveLength(0);
    expect(transactionExecutor.queries).toHaveLength(0);
  });

  it("returns 401 for an inactive current account", async () => {
    applicationExecutor.account = { id: 17, role: "LANDLORD", is_active: false };
    const app = await makeApp(applicationExecutor, transactionExecutor);
    const response = await authenticatedPost(app, await signToken(17, "LANDLORD"), {}).expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(transactionExecutor.queries).toHaveLength(0);
  });

  it.each(["TENANT", "ADMIN"] as const)("returns 403 for an active %s before transaction work", async (role) => {
    applicationExecutor.account = { id: 17, role, is_active: true };
    const app = await makeApp(applicationExecutor, transactionExecutor);
    const response = await authenticatedPost(app, await signToken(17, role), {}).expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(transactionExecutor.queries).toHaveLength(0);
  });

  it.each([undefined, "http://invalid.example"])("rejects Origin %s before authentication or SQL", async (origin) => {
    const app = await makeApp(applicationExecutor, transactionExecutor);
    const operation = request(app).post("/api/v1/landlord/listings");
    if (origin) {
      operation.set("Origin", origin);
    }
    const response = await operation.send({}).expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(applicationExecutor.queries).toHaveLength(0);
    expect(transactionExecutor.queries).toHaveLength(0);
  });

  it("validates query before body and transaction work after authorization", async () => {
    applicationExecutor.account = { id: 17, role: "LANDLORD", is_active: true };
    const app = await makeApp(applicationExecutor, transactionExecutor);
    const response = await authenticatedPost(
      app,
      await signToken(17, "LANDLORD"),
      { landlordId: 999 },
      "/api/v1/landlord/listings?ownerId=999"
    ).expect(422);

    expect(response.body.error.details[0].field).toBe("ownerId");
    expect(transactionExecutor.queries).toHaveLength(0);
  });

  it.each([
    ["missing body", undefined],
    ["primitive body", "text"],
    ["protected field", { landlordId: 999 }],
    ["duplicate amenities", { amenityCodes: ["wifi", " WIFI "] }],
    ["coordinate pair", { latitude: 10.7 }]
  ])("rejects %s with 422 before transaction work", async (_case, body) => {
    applicationExecutor.account = { id: 17, role: "LANDLORD", is_active: true };
    const app = await makeApp(applicationExecutor, transactionExecutor);
    const response = await authenticatedPost(app, await signToken(17, "LANDLORD"), body).expect(422);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(transactionExecutor.queries).toHaveLength(0);
  });

  it("preserves global malformed JSON handling", async () => {
    const app = await makeApp(applicationExecutor, transactionExecutor);
    const response = await request(app)
      .post("/api/v1/landlord/listings")
      .set("Origin", frontendOrigin)
      .set("Content-Type", "application/json")
      .send("{bad-json")
      .expect(400);

    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
    expect(applicationExecutor.queries).toHaveLength(0);
  });

  it.each(["property type", "amenity"])("maps an unavailable %s to 422 without a listing insert", async (kind) => {
    applicationExecutor.account = { id: 17, role: "LANDLORD", is_active: true };
    transactionExecutor.propertyTypeAvailable = kind !== "property type";
    if (kind === "amenity") {
      transactionExecutor.unavailableAmenityCodes.add("WIFI");
    }
    const app = await makeApp(applicationExecutor, transactionExecutor);
    const body = kind === "property type" ? { propertyTypeCode: "STUDIO" } : { amenityCodes: ["WIFI"] };
    const response = await authenticatedPost(app, await signToken(17, "LANDLORD"), body).expect(422);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(transactionExecutor.queries.some((query) => query.text.includes("INSERT INTO listings"))).toBe(false);
  });

  it("sanitizes transaction failures", async () => {
    applicationExecutor.account = { id: 17, role: "LANDLORD", is_active: true };
    const failure = new Error("private SQL, constraint, raw row, and stack detail");
    const app = await makeApp(applicationExecutor, transactionExecutor, async () => {
      throw failure;
    });
    const response = await authenticatedPost(app, await signToken(17, "LANDLORD"), {}).expect(500);

    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/private SQL|constraint|raw row|stack/i);
    expect(response.body).not.toHaveProperty("data");
  });

  it("keeps RM-019 lookups anonymous and RM-021 owner reads protected", async () => {
    const app = await makeApp(applicationExecutor, transactionExecutor);
    await request(app)
      .get("/api/v1/lookups/property-types")
      .expect(200, {
        data: [{ code: "STUDIO", label: "Studio" }]
      });
    await request(app)
      .get("/api/v1/lookups/amenities")
      .expect(200, {
        data: [{ code: "WIFI", label: "Wi-Fi" }]
      });
    await request(app).get("/api/v1/landlord/listings").expect(401);
    expect(applicationExecutor.queries).toHaveLength(2);
    expect(transactionExecutor.queries).toHaveLength(0);
  });
});
