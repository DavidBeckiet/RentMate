import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import type { TransactionRunner } from "../src/modules/listings/listing-create-service.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { AuthenticationAccount, UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const deniedOrigin = "https://denied.example";
const secret = "rm044-http-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const timestamp = "2026-08-10T07:15:00.000Z";
const passwordSentinel = "PASSWORD_HASH_RM044_SENTINEL";
const providerSentinel = "CLOUDINARY_PUBLIC_ID_RM044_SENTINEL";
const sessionSentinel = "JWT_COOKIE_SESSION_RM044_SENTINEL";

function result<Row extends QueryResultRow>(rows: Row[], command = "SELECT", rowCount = rows.length): QueryResult<Row> {
  return { command, rowCount, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  account: AuthenticationAccount | null = { id: 3, role: "ADMIN", isActive: true };
  targetActive = true;
  failBusinessQuery = false;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    const sql = query.text.replace(/\s+/g, " ").trim();
    if (sql.includes("FROM users") && sql.includes("WHERE id = $1") && !sql.includes("phone_e164")) {
      return result(
        (this.account
          ? [
              {
                id: this.account.id,
                role: this.account.role,
                is_active: this.account.isActive,
                password_hash: passwordSentinel,
                session_token: sessionSentinel
              }
            ]
          : []) as unknown as Row[]
      );
    }
    if (this.failBusinessQuery) {
      throw new Error(`SELECT password_hash, ${providerSentinel} FROM secret_table`);
    }
    if (sql.includes("WHERE l.status = $1::listing_status")) {
      return result([
        {
          id: 42,
          status: query.values[0],
          title: "RM-044 listing",
          area_name: "District 1",
          landlord_id: 17,
          landlord_email: "landlord@example.com",
          landlord_phone: "+84901234567",
          landlord_is_active: false,
          updated_at: timestamp,
          password_hash: passwordSentinel
        }
      ] as unknown as Row[]);
    }
    if (sql.includes("property_type.code AS property_type_code")) {
      return result([
        {
          id: 42,
          status: "REJECTED",
          title: "RM-044 listing",
          description: "Description",
          monthly_rent: "7500000",
          room_area_sqm: "28.50",
          address_text: "PRIVATE_ADDRESS_RM044",
          area_name: "District 1",
          latitude: 10.772341,
          longitude: 106.697912,
          created_at: timestamp,
          updated_at: timestamp,
          property_type_code: "STUDIO",
          property_type_label: "Studio",
          landlord_id: 17,
          landlord_role: "LANDLORD",
          landlord_email: "landlord@example.com",
          landlord_phone: "+84901234567",
          landlord_is_active: false,
          password_hash: passwordSentinel
        }
      ] as unknown as Row[]);
    }
    if (sql.includes("FROM listing_amenities")) {
      return result([{ code: "WIFI", label: "Wi-Fi" }] as unknown as Row[]);
    }
    if (sql.includes("FROM listing_images")) {
      return result([
        {
          id: 91,
          secure_url: "https://cdn.example.test/rm044.webp",
          cloudinary_public_id: providerSentinel,
          format: "webp",
          width: 800,
          height: 600,
          byte_size: 1000,
          display_order: 1,
          alt_text: null,
          created_at: timestamp
        }
      ] as unknown as Row[]);
    }
    if (sql.includes("SELECT reason FROM moderation_history")) {
      return result([{ reason: "Current rejection" }] as unknown as Row[]);
    }
    if (sql === "SELECT id FROM listings WHERE id = $1") {
      return result([{ id: 42 }] as unknown as Row[]);
    }
    if (sql.includes("FROM moderation_history") && sql.includes("previous_status")) {
      return result([
        {
          id: 301,
          listing_id: 42,
          admin_id: 3,
          previous_status: "PENDING",
          new_status: "REJECTED",
          reason: "Rejected",
          created_at: timestamp,
          cloudinary_public_id: providerSentinel
        }
      ] as unknown as Row[]);
    }
    if (sql.includes("FOR UPDATE OF l")) {
      return result([{ id: 42, status: "PENDING" }] as unknown as Row[]);
    }
    if (sql.startsWith("UPDATE listings")) {
      return result([] as Row[], "UPDATE", 1);
    }
    if (sql.startsWith("INSERT INTO moderation_history")) {
      return result(
        [
          {
            id: 302,
            listing_id: 42,
            admin_id: 3,
            previous_status: "PENDING",
            new_status: "APPROVED",
            reason: null,
            created_at: timestamp
          }
        ] as unknown as Row[],
        "INSERT"
      );
    }
    if (sql.includes("($1::user_role IS NULL OR role = $1::user_role)")) {
      return result([
        {
          id: 17,
          role: "LANDLORD",
          email: "landlord@example.com",
          phone_e164: "+84901234567",
          is_active: false,
          created_at: timestamp,
          updated_at: timestamp,
          password_hash: passwordSentinel,
          jwt: sessionSentinel
        }
      ] as unknown as Row[]);
    }
    if (sql.includes("FROM users") && sql.includes("FOR UPDATE")) {
      return result([
        {
          id: 17,
          role: "LANDLORD",
          email: "landlord@example.com",
          phone_e164: "+84901234567",
          is_active: this.targetActive,
          created_at: timestamp,
          updated_at: timestamp,
          password_hash: passwordSentinel
        }
      ] as unknown as Row[]);
    }
    if (sql.startsWith("UPDATE users")) {
      this.targetActive = query.values[1] as boolean;
      return result(
        [
          {
            id: 17,
            role: "LANDLORD",
            email: "landlord@example.com",
            phone_e164: "+84901234567",
            is_active: this.targetActive,
            created_at: timestamp,
            updated_at: timestamp
          }
        ] as unknown as Row[],
        "UPDATE"
      );
    }
    throw new Error(`Unexpected RM-044 HTTP SQL: ${sql}`);
  }
}

const adminEndpoints = [
  { method: "get", path: "/api/v1/admin/listings", success: 200 },
  { method: "get", path: "/api/v1/admin/listings/42", success: 200 },
  { method: "get", path: "/api/v1/admin/listings/42/moderation-actions", success: 200 },
  { method: "post", path: "/api/v1/admin/listings/42/moderation-actions", body: { action: "APPROVE" }, success: 201 },
  { method: "get", path: "/api/v1/admin/users", success: 200 },
  { method: "patch", path: "/api/v1/admin/users/17/activation", body: { isActive: false }, success: 200 }
] as const;

const safeEndpoints = adminEndpoints.filter((endpoint) => endpoint.method === "get");
const unsafeEndpoints = adminEndpoints.filter((endpoint) => endpoint.method === "post" || endpoint.method === "patch");

function logger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function app(executor: Executor, testLogger: Logger = logger()) {
  const transactionRunner: TransactionRunner = async (operation) => operation(executor);
  return createBackendApp({
    frontendOrigin: origin,
    logger: testLogger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds,
    transactionRunner
  });
}

async function cookie(role: UserRole, userId = 3, issuedAt = seconds): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => issuedAt }).sign({ userId, role });
  return `rentmate_session=${token}`;
}

async function callEndpoint(
  executor: Executor,
  endpoint: (typeof adminEndpoints)[number],
  options: { auth?: string; requestOrigin?: string | null; rawBody?: string } = {}
) {
  const application = await app(executor);
  const call = request(application)[endpoint.method](endpoint.path);
  if (options.auth) call.set("Cookie", options.auth);
  if (options.requestOrigin) call.set("Origin", options.requestOrigin);
  if (options.rawBody !== undefined) {
    call.set("Content-Type", "application/json").send(options.rawBody);
  } else if ("body" in endpoint) {
    call.send(endpoint.body);
  }
  return call;
}

describe("RM-044 aggregate admin HTTP authorization and Origin contract", () => {
  it.each(adminEndpoints)("requires active ADMIN for $method $path", async (endpoint) => {
    expect(
      (await callEndpoint(new Executor(), endpoint, { requestOrigin: endpoint.method === "get" ? null : origin }))
        .status
    ).toBe(401);
    expect(
      (
        await callEndpoint(new Executor(), endpoint, {
          auth: "rentmate_session=invalid",
          requestOrigin: endpoint.method === "get" ? null : origin
        })
      ).status
    ).toBe(401);
    expect(
      (
        await callEndpoint(new Executor(), endpoint, {
          auth: await cookie("ADMIN", 3, seconds - 7_201),
          requestOrigin: endpoint.method === "get" ? null : origin
        })
      ).status
    ).toBe(401);

    const inactive = new Executor();
    inactive.account = { id: 3, role: "ADMIN", isActive: false };
    expect(
      (
        await callEndpoint(inactive, endpoint, {
          auth: await cookie("ADMIN"),
          requestOrigin: endpoint.method === "get" ? null : origin
        })
      ).status
    ).toBe(401);

    for (const role of ["TENANT", "LANDLORD"] as const) {
      const forbidden = new Executor();
      forbidden.account = { id: 7, role, isActive: true };
      expect(
        (
          await callEndpoint(forbidden, endpoint, {
            auth: await cookie(role, 7),
            requestOrigin: endpoint.method === "get" ? null : origin
          })
        ).status
      ).toBe(403);
    }

    expect(
      (
        await callEndpoint(new Executor(), endpoint, {
          auth: await cookie("ADMIN"),
          requestOrigin: endpoint.method === "get" ? null : origin
        })
      ).status
    ).toBe(endpoint.success);
  });

  it.each(safeEndpoints)("does not Origin-block safe $method $path", async (endpoint) => {
    for (const requestOrigin of [null, deniedOrigin]) {
      expect(
        (await callEndpoint(new Executor(), endpoint, { auth: await cookie("ADMIN"), requestOrigin })).status
      ).toBe(200);
    }
  });

  it.each(unsafeEndpoints)("Origin-blocks unsafe $method $path before auth and SQL", async (endpoint) => {
    for (const requestOrigin of [null, deniedOrigin]) {
      const executor = new Executor();
      expect((await callEndpoint(executor, endpoint, { requestOrigin })).status).toBe(403);
      expect(executor.queries).toHaveLength(0);
    }
  });

  it.each(unsafeEndpoints)("maps allowed-Origin malformed JSON for $method $path", async (endpoint) => {
    const executor = new Executor();
    const response = await callEndpoint(executor, endpoint, { requestOrigin: origin, rawBody: "{" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("MALFORMED_REQUEST");
    expect(executor.queries).toHaveLength(0);
  });

  it("keeps all six representative success responses free of cross-endpoint secret fields", async () => {
    const responses = [];
    for (const endpoint of adminEndpoints) {
      const response = await callEndpoint(new Executor(), endpoint, {
        auth: await cookie("ADMIN"),
        requestOrigin: endpoint.method === "get" ? null : origin
      });
      expect(response.status).toBe(endpoint.success);
      responses.push(response.body);
    }
    const serialized = JSON.stringify(responses);
    expect(serialized).not.toMatch(/password|password_hash|cloudinary_public_id|JWT_COOKIE_SESSION_RM044_SENTINEL/i);
    expect(serialized).not.toMatch(
      /phone_e164|is_active|created_at|updated_at|listing_id|admin_id|previous_status|new_status/
    );
    expect(responses[1]).toMatchObject({
      data: {
        addressText: "PRIVATE_ADDRESS_RM044",
        latitude: 10.772341,
        longitude: 106.697912,
        landlord: { email: "landlord@example.com", phone: "+84901234567" }
      }
    });
  });

  it("sanitizes one representative admin infrastructure failure", async () => {
    const executor = new Executor();
    executor.failBusinessQuery = true;
    const testLogger = logger();
    const application = await app(executor, testLogger);
    const response = await request(application)
      .get("/api/v1/admin/users")
      .set("Cookie", await cookie("ADMIN"))
      .expect(500);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(response.body.error.requestId).toMatch(/^req_[a-f0-9]{32}$/);
    expect(JSON.stringify(response.body)).not.toMatch(/stack|SELECT|password|hash|cloudinary|provider|secret_table/i);
    expect(testLogger.error).toHaveBeenCalledTimes(1);
  });

  it("retains representative path, query, and body validation before business mutation", async () => {
    const auth = await cookie("ADMIN");
    const cases = [
      { method: "get", path: "/api/v1/admin/listings?status=ALL" },
      { method: "get", path: "/api/v1/admin/listings/0" },
      { method: "get", path: "/api/v1/admin/listings/0/moderation-actions" },
      { method: "post", path: "/api/v1/admin/listings/0/moderation-actions", body: { action: "APPROVE" } },
      { method: "get", path: "/api/v1/admin/users?role=ALL" },
      { method: "patch", path: "/api/v1/admin/users/0/activation", body: { isActive: false } }
    ] as const;
    for (const testCase of cases) {
      const executor = new Executor();
      const agent = request(await app(executor));
      const call = agent[testCase.method](testCase.path).set("Cookie", auth);
      if (testCase.method === "post" || testCase.method === "patch") call.set("Origin", origin).send(testCase.body);
      await call.expect(422);
      expect(executor.queries.filter((query) => /^(UPDATE|INSERT)/.test(query.text.trim()))).toHaveLength(0);
    }
  });
});
