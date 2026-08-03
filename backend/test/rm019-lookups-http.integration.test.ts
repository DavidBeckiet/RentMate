import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const frontendOrigin = "http://localhost:3000";
const jwtSecret = "rm019-test-only-secret-not-for-production";
const nowSeconds = 1_900_000_000;

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class LookupExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  propertyTypes: QueryResultRow[] = [{ code: "STUDIO", label: "Studio" }];
  amenities: QueryResultRow[] = [{ code: "WIFI", label: "Wi-Fi" }];
  failure: Error | undefined;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (this.failure) {
      throw this.failure;
    }
    if (query.text.includes("FROM property_types")) {
      return queryResult(this.propertyTypes as Row[]);
    }
    if (query.text.includes("FROM amenities")) {
      return queryResult(this.amenities as Row[]);
    }
    throw new Error("Unexpected non-lookup SQL in RM-019 HTTP fixture.");
  }
}

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

async function makeApp(executor: SqlExecutor) {
  return createBackendApp({
    frontendOrigin,
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => nowSeconds,
    authRateLimitClock: () => 0
  });
}

describe("RM-019 lookup HTTP contract", () => {
  let executor: LookupExecutor;

  beforeEach(() => {
    executor = new LookupExecutor();
  });

  it("returns exact anonymous arrays without Origin, authentication, or cookie output", async () => {
    const app = await makeApp(executor);
    const propertyTypes = await request(app).get("/api/v1/lookups/property-types").expect(200);
    const amenities = await request(app).get("/api/v1/lookups/amenities").expect(200);

    expect(propertyTypes.body).toStrictEqual({ data: [{ code: "STUDIO", label: "Studio" }] });
    expect(amenities.body).toStrictEqual({ data: [{ code: "WIFI", label: "Wi-Fi" }] });
    expect(propertyTypes.headers["set-cookie"]).toBeUndefined();
    expect(amenities.headers["set-cookie"]).toBeUndefined();
    expect(executor.queries).toHaveLength(2);
  });

  it("returns an exact empty data array", async () => {
    executor.propertyTypes = [];
    executor.amenities = [];
    const app = await makeApp(executor);

    await request(app).get("/api/v1/lookups/property-types").expect(200, { data: [] });
    await request(app).get("/api/v1/lookups/amenities").expect(200, { data: [] });
  });

  it.each(["TENANT", "LANDLORD", "ADMIN"] as const)("ignores a valid %s session cookie", async (role: UserRole) => {
    const token = await createSessionTokenService({ secret: jwtSecret, nowSeconds: () => nowSeconds }).sign({
      userId: 17,
      role
    });
    const app = await makeApp(executor);
    const response = await request(app)
      .get("/api/v1/lookups/property-types")
      .set("Cookie", `rentmate_session=${token}`)
      .expect(200);

    expect(response.body).toStrictEqual({ data: [{ code: "STUDIO", label: "Studio" }] });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(executor.queries).toHaveLength(1);
    expect(executor.queries[0]?.text).not.toContain("FROM users");
  });

  it.each(["invalid-cookie", "expired-cookie", "inactive-account-cookie"])(
    "ignores non-current cookie state: %s",
    async (cookieValue) => {
      const app = await makeApp(executor);
      const response = await request(app)
        .get("/api/v1/lookups/property-types")
        .set("Cookie", `rentmate_session=${cookieValue}`)
        .expect(200);

      expect(response.body).toStrictEqual({ data: [{ code: "STUDIO", label: "Studio" }] });
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(executor.queries).toHaveLength(1);
      expect(executor.queries[0]?.text).not.toContain("FROM users");
    }
  );

  it.each(["active=true", "includeInactive=true", "sort=code", "page=1", "anything=value"])(
    "rejects unknown query %s before SQL",
    async (query) => {
      const app = await makeApp(executor);
      const response = await request(app).get(`/api/v1/lookups/property-types?${query}`).expect(422);

      expect(response.body.error.code).toBe("VALIDATION_FAILED");
      expect(response.body.error.requestId).toEqual(expect.any(String));
      expect(executor.queries).toHaveLength(0);
    }
  );

  it.each(["{}", "null", "[]", '"text"', "123", "true"])("rejects parsed JSON body %s", async (body) => {
    const app = await makeApp(executor);
    const response = await request(app)
      .get("/api/v1/lookups/amenities")
      .set("Content-Type", "application/json")
      .send(body)
      .expect(422);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(executor.queries).toHaveLength(0);
  });

  it("reports query validation before a syntactically valid invalid body", async () => {
    const app = await makeApp(executor);
    const response = await request(app)
      .get("/api/v1/lookups/amenities?unexpected=x")
      .set("Content-Type", "application/json")
      .send("{}")
      .expect(422);

    expect(response.body.error.details[0].field).toBe("unexpected");
    expect(executor.queries).toHaveLength(0);
  });

  it("preserves global malformed-JSON handling", async () => {
    const app = await makeApp(executor);
    const response = await request(app)
      .get("/api/v1/lookups/amenities")
      .set("Content-Type", "application/json")
      .send("{bad-json")
      .expect(400);

    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
    expect(response.body.error.requestId).toEqual(expect.any(String));
    expect(executor.queries).toHaveLength(0);
  });

  it("sanitizes repository failures instead of returning an empty array", async () => {
    executor.failure = new Error("private PostgreSQL SELECT detail and raw row");
    const app = await makeApp(executor);
    const response = await request(app).get("/api/v1/lookups/property-types").expect(500);

    expect(response.body.error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(response.body.error.requestId).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty("data");
    expect(JSON.stringify(response.body)).not.toMatch(/PostgreSQL|SELECT|raw row|stack/i);
  });

  it("registers no aliases or mutation methods", async () => {
    const app = await makeApp(executor);
    for (const path of ["/api/v1/property-types", "/api/v1/amenities", "/api/v1/catalog/amenities"]) {
      await request(app).get(path).expect(404);
    }
    for (const method of ["post", "patch", "delete"] as const) {
      await request(app)[method]("/api/v1/lookups/property-types").set("Origin", frontendOrigin).expect(404);
    }
    expect(executor.queries).toHaveLength(0);
  });
});
