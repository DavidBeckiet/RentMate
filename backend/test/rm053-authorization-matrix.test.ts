import type { Express } from "express";
import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { jwtLifetimeSeconds } from "../src/config/env.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const untrustedOrigin = "https://untrusted.example.test";
const secret = "rm053-authorization-test-only-secret";
const nowSeconds = 1_900_000_000;
const ownerListingId = 777;
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

interface Account {
  readonly active: boolean;
  readonly role: UserRole;
}

function queryResult<Row extends QueryResultRow>(rows: readonly QueryResultRow[] = []): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows: [...rows] as unknown as Row[] };
}

class AuthorizationMatrixExecutor implements SqlExecutor {
  private readonly accounts = new Map<number, Account>([
    [1, { role: "TENANT", active: true }],
    [2, { role: "TENANT", active: false }],
    [3, { role: "LANDLORD", active: true }],
    [4, { role: "LANDLORD", active: true }],
    [5, { role: "LANDLORD", active: false }],
    [6, { role: "ADMIN", active: true }]
  ]);

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    const sql = query.text.replace(/\s+/g, " ");
    const userId = Number(query.values[0]);
    const account = this.accounts.get(userId);

    if (sql.includes("SELECT id, role, is_active") && sql.includes("FROM users") && sql.includes("LIMIT 1")) {
      return queryResult<Row>(account ? [{ id: userId, role: account.role, is_active: account.active }] : []);
    }

    if (sql.includes("FROM users") && sql.includes("AND is_active = true") && sql.includes("phone_e164")) {
      if (!account?.active) return queryResult<Row>();
      return queryResult<Row>([
        {
          id: userId,
          role: account.role,
          email: `rm053.${account.role.toLowerCase()}.${userId}@example.test`,
          phone_e164: account.role === "LANDLORD" ? "+84900000000" : null,
          is_active: true,
          created_at: new Date("2026-01-01T00:00:00.000Z"),
          updated_at: new Date("2026-01-01T00:00:00.000Z")
        }
      ]);
    }

    if (sql.includes("FROM listings AS l") && sql.includes("l.landlord_id = $2")) {
      if (query.values[0] !== ownerListingId || query.values[1] !== 3) return queryResult<Row>();
      return queryResult<Row>([
        {
          id: ownerListingId,
          status: "DRAFT",
          title: "RM-053 owner listing",
          description: "Owner-scoped authorization matrix fixture.",
          monthly_rent: "5000000",
          room_area_sqm: "25.00",
          address_text: "Exact owner-only address",
          area_name: "District 1",
          latitude: 10.772341,
          longitude: 106.697912,
          created_at: new Date("2026-01-01T00:00:00.000Z"),
          updated_at: new Date("2026-01-01T00:00:00.000Z"),
          property_type_code: "STUDIO",
          property_type_label: "Studio"
        }
      ]);
    }

    if (sql.includes("FROM listing_amenities") || sql.includes("FROM listing_images")) return queryResult<Row>();
    if (sql.includes("FROM users") && sql.includes("$1::user_role")) return queryResult<Row>();

    throw new Error("Unexpected RM-053 authorization-matrix query.");
  }
}

async function createCookie(
  userId: number,
  role: UserRole,
  tokenSecret = secret,
  issuedAt = nowSeconds
): Promise<string> {
  const token = await createSessionTokenService({ secret: tokenSecret, nowSeconds: () => issuedAt }).sign({
    userId,
    role
  });
  return `rentmate_session=${token}`;
}

async function createMatrixApp(): Promise<Express> {
  const executor = new AuthorizationMatrixExecutor();
  return createBackendApp({
    frontendOrigin: origin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => nowSeconds,
    authRateLimitClock: () => 0
  });
}

interface MatrixCase {
  readonly cookie?: string;
  readonly expectedCode?: string;
  readonly expectedStatus: number;
  readonly method: "GET" | "POST";
  readonly name: string;
  readonly origin?: string;
  readonly path: string;
}

function dispatch(app: Express, testCase: MatrixCase): request.Test {
  const response = testCase.method === "GET" ? request(app).get(testCase.path) : request(app).post(testCase.path);
  if (testCase.cookie) response.set("Cookie", testCase.cookie);
  if (testCase.origin) response.set("Origin", testCase.origin);
  return response;
}

describe("RM-053 cross-cutting authorization/activity matrix", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createMatrixApp();
  });

  it("applies anonymous, role, ownership, activity, token, and Origin boundaries consistently", async () => {
    const [
      activeTenant,
      inactiveTenant,
      ownerLandlord,
      nonOwnerLandlord,
      inactiveLandlord,
      admin,
      invalidSignature,
      expired
    ] = await Promise.all([
      createCookie(1, "TENANT"),
      createCookie(2, "TENANT"),
      createCookie(3, "LANDLORD"),
      createCookie(4, "LANDLORD"),
      createCookie(5, "LANDLORD"),
      createCookie(6, "ADMIN"),
      createCookie(1, "TENANT", "rm053-different-test-only-secret"),
      createCookie(1, "TENANT", secret, nowSeconds - jwtLifetimeSeconds - 1)
    ]);
    const cases: readonly MatrixCase[] = [
      {
        name: "anonymous protected request",
        method: "GET",
        path: "/api/v1/users/me",
        expectedStatus: 401,
        expectedCode: "AUTHENTICATION_REQUIRED"
      },
      { name: "active tenant", method: "GET", path: "/api/v1/users/me", cookie: activeTenant, expectedStatus: 200 },
      {
        name: "inactive tenant",
        method: "GET",
        path: "/api/v1/users/me",
        cookie: inactiveTenant,
        expectedStatus: 401,
        expectedCode: "AUTHENTICATION_REQUIRED"
      },
      {
        name: "active landlord owner",
        method: "GET",
        path: `/api/v1/landlord/listings/${ownerListingId}`,
        cookie: ownerLandlord,
        expectedStatus: 200
      },
      {
        name: "active landlord non-owner",
        method: "GET",
        path: `/api/v1/landlord/listings/${ownerListingId}`,
        cookie: nonOwnerLandlord,
        expectedStatus: 404,
        expectedCode: "RESOURCE_NOT_FOUND"
      },
      {
        name: "inactive landlord",
        method: "GET",
        path: `/api/v1/landlord/listings/${ownerListingId}`,
        cookie: inactiveLandlord,
        expectedStatus: 401,
        expectedCode: "AUTHENTICATION_REQUIRED"
      },
      { name: "active admin", method: "GET", path: "/api/v1/admin/users", cookie: admin, expectedStatus: 200 },
      {
        name: "tenant wrong role for owner resource",
        method: "GET",
        path: `/api/v1/landlord/listings/${ownerListingId}`,
        cookie: activeTenant,
        expectedStatus: 403,
        expectedCode: "FORBIDDEN"
      },
      {
        name: "landlord wrong role for favorites",
        method: "GET",
        path: "/api/v1/favorites",
        cookie: ownerLandlord,
        expectedStatus: 403,
        expectedCode: "FORBIDDEN"
      },
      {
        name: "tenant wrong role for admin resource",
        method: "GET",
        path: "/api/v1/admin/users",
        cookie: activeTenant,
        expectedStatus: 403,
        expectedCode: "FORBIDDEN"
      },
      {
        name: "malformed cookie",
        method: "GET",
        path: "/api/v1/users/me",
        cookie: "rentmate_session=not-a-jwt",
        expectedStatus: 401,
        expectedCode: "AUTHENTICATION_REQUIRED"
      },
      {
        name: "invalid signature",
        method: "GET",
        path: "/api/v1/users/me",
        cookie: invalidSignature,
        expectedStatus: 401,
        expectedCode: "AUTHENTICATION_REQUIRED"
      },
      {
        name: "expired cookie",
        method: "GET",
        path: "/api/v1/users/me",
        cookie: expired,
        expectedStatus: 401,
        expectedCode: "AUTHENTICATION_REQUIRED"
      },
      {
        name: "invalid Origin on unsafe request",
        method: "POST",
        path: "/api/v1/auth/logout",
        origin: untrustedOrigin,
        expectedStatus: 403,
        expectedCode: "FORBIDDEN"
      },
      {
        name: "safe GET does not require an allowed Origin",
        method: "GET",
        path: "/api/v1/users/me",
        cookie: activeTenant,
        origin: untrustedOrigin,
        expectedStatus: 200
      }
    ];

    for (const testCase of cases) {
      const response = await dispatch(app, testCase);
      expect(response.status, testCase.name).toBe(testCase.expectedStatus);
      if (testCase.expectedCode) {
        expect(response.body.error?.code, testCase.name).toBe(testCase.expectedCode);
      }
    }
  });
});
