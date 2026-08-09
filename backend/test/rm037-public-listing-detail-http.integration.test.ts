import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService, type SessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { AuthenticationAccount, UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const secret = "rm037-http-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const contact = { email: "owner@example.com", phone: "+84901234567" };

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

const baseRow = {
  id: 42,
  title: "Public studio",
  description: "Public description",
  monthly_rent: "7500000",
  room_area_sqm: "28.50",
  area_name: "District 1",
  latitude: 10.772549,
  longitude: 106.697912,
  property_type_code: "STUDIO",
  property_type_label: "Studio",
  amenities: [{ code: "WIFI", label: "Wi-Fi" }],
  images: [{ url: "https://cdn.example.test/rm037.webp", altText: "Room", displayOrder: 1 }],
  updated_at: "2026-07-29T07:15:00.000Z"
};

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  account: AuthenticationAccount | null = null;
  detailVisible = true;
  authenticationFailure: Error | null = null;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("SELECT") && query.text.includes("role") && query.text.includes("is_active")) {
      if (this.authenticationFailure) throw this.authenticationFailure;
      return result(
        (this.account === null
          ? []
          : [{ id: this.account.id, role: this.account.role, is_active: this.account.isActive }]) as unknown as Row[]
      );
    }
    if (query.text.includes("FROM listings AS l")) {
      if (!this.detailVisible) return result([] as Row[]);
      const row = { ...baseRow, id: Number(query.values[0]) };
      if (query.text.includes("landlord.email AS landlord_email")) {
        return result([{ ...row, landlord_email: contact.email, landlord_phone: contact.phone }] as unknown as Row[]);
      }
      return result([row] as unknown as Row[]);
    }
    throw new Error("Unexpected RM-037 HTTP SQL.");
  }
}

function logger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } satisfies Logger;
}

async function makeApp(
  executor: Executor,
  options: Readonly<{ sessionTokenService?: SessionTokenService; logger?: Logger }> = {}
) {
  return createBackendApp({
    frontendOrigin: origin,
    logger: options.logger ?? logger(),
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds,
    sessionTokenService: options.sessionTokenService,
    authRateLimitClock: () => 0
  });
}

async function cookie(role: UserRole, userId = 7, issuedAt = seconds): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => issuedAt }).sign({ userId, role });
  return `rentmate_session=${token}`;
}

function baseData() {
  return {
    id: 42,
    title: "Public studio",
    description: "Public description",
    monthlyRent: 7500000,
    roomAreaSqm: 28.5,
    areaName: "District 1",
    latitude: 10.773,
    longitude: 106.698,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [{ code: "WIFI", label: "Wi-Fi" }],
    images: [{ url: "https://cdn.example.test/rm037.webp", altText: "Room", displayOrder: 1 }],
    updatedAt: "2026-07-29T07:15:00.000Z"
  };
}

function expectBaseDetail(body: unknown): void {
  expect(body).toStrictEqual({ data: baseData() });
}

describe("RM-037 public listing detail HTTP", () => {
  it("returns one-query anonymous public detail without Origin, cookie mutation, or contact", async () => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .get("/api/v1/listings/42")
      .expect(200);
    expectBaseDetail(response.body);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(executor.queries).toHaveLength(1);
    expect(executor.queries[0]!.text).not.toMatch(/landlord\.email|phone_e164/);
  });

  it("returns contact only to an active TENANT and uses two total database queries", async () => {
    const executor = new Executor();
    executor.account = { id: 7, role: "TENANT", isActive: true };
    const response = await request(await makeApp(executor))
      .get("/api/v1/listings/42")
      .set("Cookie", await cookie("TENANT"))
      .expect(200);
    expect(response.body).toStrictEqual({ data: { ...baseData(), landlordContact: contact } });
    expect(executor.queries).toHaveLength(2);
    expect(executor.queries[1]!.text).toContain("landlord.email AS landlord_email");
  });

  it.each(["LANDLORD", "ADMIN"] as const)("gives active %s the base projection only", async (role) => {
    const executor = new Executor();
    executor.account = { id: 42, role, isActive: true };
    const response = await request(await makeApp(executor))
      .get("/api/v1/listings/42")
      .set("Cookie", await cookie(role, 42))
      .expect(200);
    expectBaseDetail(response.body);
    expect(response.body.data).not.toHaveProperty("landlordContact");
    expect(executor.queries).toHaveLength(2);
    expect(executor.queries[1]!.text).not.toMatch(/landlord\.email|phone_e164/);
  });

  it("treats invalid and expired JWTs as anonymous without an account lookup", async () => {
    for (const session of ["rentmate_session=invalid", await cookie("TENANT", 7, seconds - 7_201)]) {
      const executor = new Executor();
      const response = await request(await makeApp(executor))
        .get("/api/v1/listings/42")
        .set("Cookie", session)
        .expect(200);
      expectBaseDetail(response.body);
      expect(executor.queries).toHaveLength(1);
    }
  });

  it.each([
    ["inactive account", { id: 7, role: "TENANT" as const, isActive: false }],
    ["missing account", null],
    ["ID mismatch", { id: 8, role: "TENANT" as const, isActive: true }],
    ["role mismatch", { id: 7, role: "ADMIN" as const, isActive: true }]
  ])("treats %s as anonymous after one account lookup", async (_label, account) => {
    const executor = new Executor();
    executor.account = account;
    const response = await request(await makeApp(executor))
      .get("/api/v1/listings/42")
      .set("Cookie", await cookie("TENANT"))
      .expect(200);
    expectBaseDetail(response.body);
    expect(executor.queries).toHaveLength(2);
    expect(executor.queries[1]!.text).not.toMatch(/landlord\.email|phone_e164/);
  });

  it.each(["0", "-1", "2147483648", "1.5", "1e3", "abc", "%20", "+1", "1x"])(
    "rejects malformed listing ID %s before detail SQL",
    async (listingId) => {
      const executor = new Executor();
      const response = await request(await makeApp(executor))
        .get(`/api/v1/listings/${listingId}`)
        .expect(422);
      expect(response.body.error).toMatchObject({ code: "VALIDATION_FAILED" });
      expect(executor.queries).toHaveLength(0);
    }
  );

  it("accepts the maximum int32 ID syntactically", async () => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .get("/api/v1/listings/2147483647")
      .expect(200);
    expect(response.body.data.id).toBe(2_147_483_647);
    expect(executor.queries[0]!.values).toStrictEqual([2_147_483_647]);
  });

  it("rejects unknown query, parsed body, and malformed JSON using existing envelopes", async () => {
    await request(await makeApp(new Executor()))
      .get("/api/v1/listings/42?unknown=x")
      .expect(422);
    await request(await makeApp(new Executor()))
      .get("/api/v1/listings/42")
      .set("Content-Type", "application/json")
      .send("{}")
      .expect(422);
    const malformed = await request(await makeApp(new Executor()))
      .get("/api/v1/listings/42")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
    expect(malformed.body.error.code).toBe("MALFORMED_REQUEST");
  });

  it("uses one indistinguishable 404 for a missing or non-public target and allows untrusted Origin", async () => {
    const executor = new Executor();
    executor.detailVisible = false;
    const response = await request(await makeApp(executor))
      .get("/api/v1/listings/42")
      .set("Origin", "https://untrusted.example")
      .expect(404);
    expect(response.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(response.body.error.details).toBeUndefined();
  });

  it("does not hide verifier or account-loader infrastructure failures", async () => {
    const privateFailure = new Error("PRIVATE_VERIFIER_DETAIL");
    const failingVerifier: SessionTokenService = {
      sign: async () => "unused",
      verify: async () => Promise.reject(privateFailure)
    };
    const verifierResponse = await request(await makeApp(new Executor(), { sessionTokenService: failingVerifier }))
      .get("/api/v1/listings/42")
      .set("Cookie", "rentmate_session=present")
      .expect(500);
    expect(verifierResponse.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(verifierResponse.text).not.toContain(privateFailure.message);

    const executor = new Executor();
    executor.authenticationFailure = new ApplicationError(
      "DEPENDENCY_UNAVAILABLE",
      "A required dependency is unavailable."
    );
    const loaderResponse = await request(await makeApp(executor))
      .get("/api/v1/listings/42")
      .set("Cookie", await cookie("TENANT"))
      .expect(503);
    expect(loaderResponse.body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(executor.queries).toHaveLength(1);
  });
});
