import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";
import { expectExactKeys, phase4JwtSecret, phase4NowSeconds, phase4Origin } from "./helpers/listings-phase4-fixture.js";

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class DisclosureExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  account: { id: number; role: UserRole; is_active: boolean } | null = null;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("FROM users")) {
      return result((this.account === null ? [] : [this.account]) as unknown as Row[]);
    }
    if (query.text.includes("FROM listings AS l")) {
      return result([] as Row[]);
    }
    throw new Error("Unexpected RM-022 disclosure-order SQL.");
  }

  ownerQueryCount(): number {
    return this.queries.filter((query) => query.text.includes("FROM listings AS l")).length;
  }
}

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

async function signToken(userId: number, role: UserRole): Promise<string> {
  return createSessionTokenService({ secret: phase4JwtSecret, nowSeconds: () => phase4NowSeconds }).sign({
    userId,
    role
  });
}

async function makeApp(executor: DisclosureExecutor) {
  return createBackendApp({
    frontendOrigin: phase4Origin,
    logger: silentLogger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: phase4JwtSecret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => phase4NowSeconds,
    authRateLimitClock: () => 0
  });
}

function invalidDetailRequest(app: Awaited<ReturnType<typeof makeApp>>) {
  return request(app)
    .get("/api/v1/landlord/listings/not-a-valid-id?unexpected=value")
    .set("Content-Type", "application/json")
    .send({ privateAddress: "must-not-be-disclosed" });
}

function expectPrivateFailureValuesAbsent(responseBody: unknown, token?: string): void {
  const serialized = JSON.stringify(responseBody);
  expect(serialized).not.toMatch(
    /SELECT|INSERT|UPDATE|DELETE|stack|password_hash|is_active|landlord_id|address_text|latitude|longitude|must-not-be-disclosed/i
  );
  if (token !== undefined) expect(serialized).not.toContain(token);
}

describe("RM-022 Phase 4 detail disclosure order", () => {
  let executor: DisclosureExecutor;

  beforeEach(() => {
    executor = new DisclosureExecutor();
  });

  it.each([
    ["missing", undefined],
    ["invalid", "invalid-token"]
  ] as const)("authenticates %s session before path/query/body validation", async (_case, token) => {
    const app = await makeApp(executor);
    const operation = invalidDetailRequest(app);
    if (token !== undefined) operation.set("Cookie", `rentmate_session=${token}`);
    const response = await operation.expect(401);

    expectExactKeys(response.body, ["error"]);
    expectExactKeys(response.body.error, ["code", "message", "requestId"]);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(executor.ownerQueryCount()).toBe(0);
    expectPrivateFailureValuesAbsent(response.body, token);
  });

  it("rejects an inactive account before path/query/body validation", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: false };
    const token = await signToken(17, "LANDLORD");
    const app = await makeApp(executor);
    const response = await invalidDetailRequest(app).set("Cookie", `rentmate_session=${token}`).expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(executor.ownerQueryCount()).toBe(0);
    expectPrivateFailureValuesAbsent(response.body, token);
  });

  it.each(["TENANT", "ADMIN"] as const)("authorizes active %s role before path validation", async (role) => {
    executor.account = { id: 17, role, is_active: true };
    const token = await signToken(17, role);
    const app = await makeApp(executor);
    const response = await invalidDetailRequest(app).set("Cookie", `rentmate_session=${token}`).expect(403);

    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(executor.ownerQueryCount()).toBe(0);
    expectPrivateFailureValuesAbsent(response.body, token);
  });

  it("validates detail path before query and parsed body for an active landlord", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const token = await signToken(17, "LANDLORD");
    const app = await makeApp(executor);
    const response = await invalidDetailRequest(app).set("Cookie", `rentmate_session=${token}`).expect(422);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details[0].field).toBe("listingId");
    expect(executor.ownerQueryCount()).toBe(0);
    expectPrivateFailureValuesAbsent(response.body, token);
  });

  it("validates detail query before parsed body for an active landlord and valid path", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const token = await signToken(17, "LANDLORD");
    const app = await makeApp(executor);
    const response = await request(app)
      .get("/api/v1/landlord/listings/1?unexpected=value")
      .set("Cookie", `rentmate_session=${token}`)
      .set("Content-Type", "application/json")
      .send({ privateAddress: "must-not-be-disclosed" })
      .expect(422);

    expect(response.body.error.details[0].field).toBe("unexpected");
    expect(executor.ownerQueryCount()).toBe(0);
    expectPrivateFailureValuesAbsent(response.body, token);
  });

  it("validates parsed body after valid authentication, role, path, and query", async () => {
    executor.account = { id: 17, role: "LANDLORD", is_active: true };
    const token = await signToken(17, "LANDLORD");
    const app = await makeApp(executor);
    const response = await request(app)
      .get("/api/v1/landlord/listings/1")
      .set("Cookie", `rentmate_session=${token}`)
      .set("Content-Type", "application/json")
      .send({ privateAddress: "must-not-be-disclosed" })
      .expect(422);

    expect(response.body.error.details[0].field).toBe("body");
    expect(executor.ownerQueryCount()).toBe(0);
    expectPrivateFailureValuesAbsent(response.body, token);
  });
});
