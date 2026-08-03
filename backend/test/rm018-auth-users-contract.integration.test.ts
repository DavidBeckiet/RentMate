import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import type { UserRole } from "../src/shared/types/authentication.js";
import {
  authUsersNowSeconds,
  authUsersOrigin,
  authUsersTestJwtSecret,
  createAuthUsersFixture
} from "./helpers/auth-users-fixture.js";

interface MemoryUser {
  id: number;
  role: UserRole;
  email: string;
  phone_e164: string | null;
  password_hash: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class MemoryUserExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  user: MemoryUser | null;

  constructor(user: MemoryUser | null = null) {
    this.user = user;
  }

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    const sql = query.text.replace(/\s+/g, " ").trim();

    if (sql.startsWith("INSERT INTO users")) {
      if (this.user?.email === query.values[1]) {
        throw { code: "23505", constraint: "uq_users_email", detail: "private PostgreSQL detail" };
      }
      const timestamp = new Date("2030-01-01T00:00:00.000Z");
      this.user = {
        id: 17,
        role: query.values[0] as UserRole,
        email: query.values[1] as string,
        phone_e164: query.values[2] as string | null,
        password_hash: query.values[3] as string,
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp
      };
      return queryResult([this.user as unknown as Row]);
    }

    if (sql.includes("WHERE email = $1")) {
      return queryResult(this.user?.email === query.values[0] ? [this.user as unknown as Row] : []);
    }

    if (sql.startsWith("UPDATE users")) {
      if (!this.user || this.user.id !== query.values[0] || !this.user.is_active) {
        return queryResult([]);
      }
      const phone = query.values[1] as string | null;
      if (this.user.phone_e164 === phone) {
        return queryResult([]);
      }
      this.user = { ...this.user, phone_e164: phone, updated_at: new Date("2030-01-02T00:00:00.000Z") };
      return queryResult([this.user as unknown as Row]);
    }

    if (sql.includes("WHERE id = $1")) {
      if (!this.user || this.user.id !== query.values[0]) {
        return queryResult([]);
      }
      if (sql.includes("AND is_active = true") && !this.user.is_active) {
        return queryResult([]);
      }
      return queryResult([this.user as unknown as Row]);
    }

    throw new Error(`Unexpected RM-018 memory query: ${sql}`);
  }
}

function fixtureUser(role: UserRole = "TENANT"): MemoryUser {
  return {
    id: 17,
    role,
    email: "fixture@example.com",
    phone_e164: "+84901234567",
    password_hash: "unused-in-protected-route-test",
    is_active: true,
    created_at: new Date("2030-01-01T00:00:00.000Z"),
    updated_at: new Date("2030-01-01T00:00:00.000Z")
  };
}

function tokenService() {
  return createSessionTokenService({ secret: authUsersTestJwtSecret, nowSeconds: () => authUsersNowSeconds });
}

function expectSafeError(response: request.Response, status: number, code: string): void {
  expect(response.status).toBe(status);
  expect(response.body.error).toMatchObject({ code });
  expect(response.body.error.requestId).toEqual(expect.any(String));
}

function expectPrivateValuesAbsent(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toMatch(
    /plain-password|private-hash|private PostgreSQL detail|SELECT |INSERT |UPDATE |stack|rm018-test-only-jwt-secret/i
  );
}

describe("RM-018 auth/users composed HTTP contract", () => {
  it("rejects unknown query parameters across all six endpoints before downstream handler work", async () => {
    const executor = new MemoryUserExecutor(fixtureUser());
    const fixture = await createAuthUsersFixture({ sqlExecutor: executor });
    const token = await tokenService().sign({ userId: 17, role: "TENANT" });
    const cases = [
      [
        "post",
        "/api/v1/auth/register/tenant?unexpected=x",
        { email: "tenant@example.com", password: "plain-password" }
      ],
      [
        "post",
        "/api/v1/auth/register/landlord?unexpected=x",
        { email: "landlord@example.com", password: "plain-password", phone: "+84901234567" }
      ],
      ["post", "/api/v1/auth/login?unexpected=x", { email: "fixture@example.com", password: "plain-password" }],
      ["post", "/api/v1/auth/logout?unexpected=x", {}],
      ["get", "/api/v1/users/me?unexpected=x", undefined],
      ["patch", "/api/v1/users/me?unexpected=x", { email: "blocked@example.com" }]
    ] as const;

    for (const [method, path, body] of cases) {
      const before = executor.queries.length;
      let pending = request(fixture.app)[method](path);
      if (method !== "get") {
        pending = pending.set("Origin", authUsersOrigin);
      }
      if (path.includes("/users/me")) {
        pending = pending.set("Cookie", `rentmate_session=${token}`);
      }
      const response = await (body === undefined ? pending : pending.send(body));
      expectSafeError(response, 422, "VALIDATION_FAILED");
      expect(response.headers["set-cookie"]).toBeUndefined();
      const expectedQueries = path.includes("/users/me") ? 1 : 0;
      expect(executor.queries.length - before).toBe(expectedQueries);
    }
  });

  it("preserves Origin, parser, authentication, and request-envelope disclosure order", async () => {
    const executor = new MemoryUserExecutor(fixtureUser());
    const fixture = await createAuthUsersFixture({ sqlExecutor: executor });

    const invalidOrigin = await request(fixture.app)
      .patch("/api/v1/users/me?unexpected=x")
      .set("Origin", "http://untrusted.example")
      .send({ phone: "+84981112223" });
    expectSafeError(invalidOrigin, 403, "FORBIDDEN");
    expect(executor.queries).toHaveLength(0);

    const missingAuthentication = await request(fixture.app)
      .patch("/api/v1/users/me?unexpected=x")
      .set("Origin", authUsersOrigin)
      .send({ email: "blocked@example.com" });
    expectSafeError(missingAuthentication, 401, "AUTHENTICATION_REQUIRED");
    expect(executor.queries).toHaveLength(0);

    const malformed = await request(fixture.app)
      .post("/api/v1/auth/login")
      .set("Origin", authUsersOrigin)
      .set("Content-Type", "application/json")
      .send("{bad-json");
    expectSafeError(malformed, 400, "MALFORMED_REQUEST");

    const primitive = await request(fixture.app)
      .post("/api/v1/auth/login")
      .set("Origin", authUsersOrigin)
      .set("Content-Type", "application/json")
      .send("true");
    expectSafeError(primitive, 422, "VALIDATION_FAILED");
    expect(executor.queries).toHaveLength(0);
  });

  it.each([
    [false, false],
    [true, true]
  ] as const)("uses the route-level cookie contract when secure=%s", async (secure, expectsSecure) => {
    const executor = new MemoryUserExecutor();
    const fixture = await createAuthUsersFixture({ sqlExecutor: executor, cookieSecure: secure });
    const registration = await request(fixture.app)
      .post("/api/v1/auth/register/tenant")
      .set("Origin", authUsersOrigin)
      .send({ email: "cookie@example.com", password: "plain-password", phone: null })
      .expect(201);
    const registrationCookie = registration.headers["set-cookie"][0] as string;

    expect(registrationCookie).toMatch(/^rentmate_session=/);
    expect(registrationCookie).toMatch(/HttpOnly/);
    expect(registrationCookie).toMatch(/SameSite=Lax/);
    expect(registrationCookie).toMatch(/Path=\//);
    expect(registrationCookie).toMatch(/Max-Age=7200/);
    expect(registrationCookie).not.toMatch(/Domain=/i);
    expect(registrationCookie.includes("Secure")).toBe(expectsSecure);
    expectPrivateValuesAbsent(registration.body);

    const login = await request(fixture.app)
      .post("/api/v1/auth/login")
      .set("Origin", authUsersOrigin)
      .send({ email: "cookie@example.com", password: "plain-password" })
      .expect(200);
    const loginCookie = login.headers["set-cookie"][0] as string;
    expect(loginCookie).toMatch(/HttpOnly/);
    expect(loginCookie).toMatch(/SameSite=Lax/);
    expect(loginCookie).toMatch(/Path=\//);
    expect(loginCookie.includes("Secure")).toBe(expectsSecure);

    const logout = await request(fixture.app).post("/api/v1/auth/logout").set("Origin", authUsersOrigin).expect(204);
    const clearCookie = logout.headers["set-cookie"][0] as string;
    expect(clearCookie).toMatch(/^rentmate_session=;/);
    expect(clearCookie).toMatch(/HttpOnly/);
    expect(clearCookie).toMatch(/SameSite=Lax/);
    expect(clearCookie).toMatch(/Path=\//);
    expect(clearCookie.includes("Secure")).toBe(expectsSecure);

    const token = await tokenService().sign({ userId: 17, role: "TENANT" });
    const getProfile = await request(fixture.app)
      .get("/api/v1/users/me")
      .set("Cookie", `rentmate_session=${token}`)
      .expect(200);
    const patchProfile = await request(fixture.app)
      .patch("/api/v1/users/me")
      .set("Origin", authUsersOrigin)
      .set("Cookie", `rentmate_session=${token}`)
      .send({})
      .expect(200);
    expect(getProfile.headers["set-cookie"]).toBeUndefined();
    expect(patchProfile.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects public ADMIN selection and protected profile fields without leaking private values", async () => {
    const executor = new MemoryUserExecutor(fixtureUser());
    const fixture = await createAuthUsersFixture({ sqlExecutor: executor });
    const token = await tokenService().sign({ userId: 17, role: "TENANT" });

    await request(fixture.app)
      .post("/api/v1/auth/register/admin")
      .set("Origin", authUsersOrigin)
      .send({ email: "admin@example.com", password: "plain-password" })
      .expect(404);
    const registration = await request(fixture.app)
      .post("/api/v1/auth/register/tenant")
      .set("Origin", authUsersOrigin)
      .send({ email: "new@example.com", password: "plain-password", role: "ADMIN" });
    expectSafeError(registration, 422, "VALIDATION_FAILED");

    const before = executor.queries.length;
    const patch = await request(fixture.app)
      .patch("/api/v1/users/me")
      .set("Origin", authUsersOrigin)
      .set("Cookie", `rentmate_session=${token}`)
      .send({
        email: "blocked@example.com",
        role: "ADMIN",
        isActive: false,
        id: 999,
        password: "plain-password",
        passwordHash: "private-hash",
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:00:00.000Z"
      });
    expectSafeError(patch, 422, "VALIDATION_FAILED");
    expect(executor.queries.length - before).toBe(1);
    expectPrivateValuesAbsent(registration.body);
    expectPrivateValuesAbsent(patch.body);
  });

  it("rejects a valid token whose role differs from the current account", async () => {
    const executor = new MemoryUserExecutor(fixtureUser("LANDLORD"));
    const fixture = await createAuthUsersFixture({ sqlExecutor: executor });
    const token = await tokenService().sign({ userId: 17, role: "TENANT" });
    const response = await request(fixture.app).get("/api/v1/users/me").set("Cookie", `rentmate_session=${token}`);

    expectSafeError(response, 401, "AUTHENTICATION_REQUIRED");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body).not.toHaveProperty("data");
    expect(executor.queries).toHaveLength(1);
  });

  it("keeps registration, login, and invalid-token logs free of credentials and private failure details", async () => {
    const executor = new MemoryUserExecutor(fixtureUser());
    const fixture = await createAuthUsersFixture({ sqlExecutor: executor });

    const registration = await request(fixture.app)
      .post("/api/v1/auth/register/tenant")
      .set("Origin", authUsersOrigin)
      .send({ email: "fixture@example.com", password: "plain-password" });
    expectSafeError(registration, 409, "EMAIL_ALREADY_EXISTS");
    const login = await request(fixture.app)
      .post("/api/v1/auth/login")
      .set("Origin", authUsersOrigin)
      .send({ email: "secret-email@example.com", password: "plain-password" });
    expectSafeError(login, 401, "INVALID_CREDENTIALS");
    const invalidToken = await request(fixture.app)
      .get("/api/v1/users/me")
      .set("Cookie", "rentmate_session=private-cookie-jwt");
    expectSafeError(invalidToken, 401, "AUTHENTICATION_REQUIRED");

    const serializedLogs = JSON.stringify(fixture.logs);
    expect(serializedLogs).not.toMatch(
      /fixture@example|secret-email|plain-password|password_hash|private-cookie-jwt|is_active|private PostgreSQL detail|SELECT |INSERT |stack/i
    );
  });
});
