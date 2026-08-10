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
const secret = "rm043-http-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const timestamp = "2026-08-10T07:15:00.000Z";

function result<Row extends QueryResultRow>(rows: Row[], command = "SELECT"): QueryResult<Row> {
  return { command, rowCount: rows.length, oid: 0, fields: [], rows };
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    role: "LANDLORD",
    email: "owner@example.com",
    phone_e164: "+84901234567",
    is_active: false,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides
  };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  account: AuthenticationAccount | null = null;
  target: ReturnType<typeof userRow> | null = userRow();

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    const sql = query.text.replace(/\s+/g, " ").trim();
    if (sql.includes("FROM users") && sql.includes("WHERE id = $1") && !sql.includes("phone_e164")) {
      return result(
        (this.account
          ? [{ id: this.account.id, role: this.account.role, is_active: this.account.isActive }]
          : []) as unknown as Row[]
      );
    }
    if (sql.includes("($1::user_role IS NULL OR role = $1::user_role)")) {
      return result([
        userRow({ id: 7, role: query.values[0] ?? "ADMIN", is_active: query.values[1] ?? false })
      ] as unknown as Row[]);
    }
    if (sql.includes("FOR UPDATE")) return result((this.target ? [this.target] : []) as unknown as Row[]);
    if (sql.startsWith("UPDATE users")) {
      this.target = this.target
        ? { ...this.target, is_active: query.values[1] as boolean, updated_at: timestamp }
        : null;
      return result((this.target ? [this.target] : []) as unknown as Row[], "UPDATE");
    }
    throw new Error(`Unexpected RM-043 HTTP SQL: ${sql}`);
  }
}

function logger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function app(executor: Executor) {
  const transactionRunner: TransactionRunner = async (operation) => operation(executor);
  return createBackendApp({
    frontendOrigin: origin,
    logger: logger(),
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

describe("RM-043 admin user HTTP contract", () => {
  it("lists canonical active/inactive ADMIN-visible profiles with filters, pagination, and safe Origin bypass", async () => {
    for (const requestOrigin of [undefined, "https://denied.example"]) {
      const executor = new Executor();
      executor.account = { id: 3, role: "ADMIN", isActive: true };
      const call = request(await app(executor))
        .get("/api/v1/admin/users?role=Admin&isActive=false&page=2&pageSize=5")
        .set("Cookie", await cookie("ADMIN"));
      if (requestOrigin) call.set("Origin", requestOrigin);
      const response = await call.expect(200);
      expect(response.body).toStrictEqual({
        data: [
          {
            id: 7,
            role: "ADMIN",
            email: "owner@example.com",
            phone: "+84901234567",
            isActive: false,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ],
        pagination: { page: 2, pageSize: 5, hasNextPage: false }
      });
      expect(executor.queries[1]!.values).toStrictEqual(["ADMIN", false, 6, 5]);
      expect(JSON.stringify(response.body)).not.toMatch(/password|hash|phone_e164|is_active|cookie|jwt/i);
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("requires active ADMIN for both routes while GET remains Origin-independent", async () => {
    for (const route of ["get", "patch"] as const) {
      const path = route === "get" ? "/api/v1/admin/users" : "/api/v1/admin/users/42/activation";
      const noAuth = request(await app(new Executor()))[route](path);
      if (route === "patch") noAuth.set("Origin", origin).send({ isActive: false });
      await noAuth.expect(401);
      for (const role of ["TENANT", "LANDLORD"] as const) {
        const executor = new Executor();
        executor.account = { id: 7, role, isActive: true };
        const agent = request(await app(executor));
        const call = agent[route](path).set("Cookie", await cookie(role, 7));
        if (route === "patch") call.set("Origin", origin).send({ isActive: false });
        await call.expect(403);
      }
      const inactive = new Executor();
      inactive.account = { id: 3, role: "ADMIN", isActive: false };
      const agent = request(await app(inactive));
      const call = agent[route](path).set("Cookie", await cookie("ADMIN"));
      if (route === "patch") call.set("Origin", origin).send({ isActive: false });
      await call.expect(401);
    }
  });

  it("enforces unsafe Origin before auth or SQL and preserves malformed JSON handling", async () => {
    for (const denied of [undefined, "https://denied.example"]) {
      const executor = new Executor();
      const call = request(await app(executor))
        .patch("/api/v1/admin/users/42/activation")
        .send({ isActive: false });
      if (denied) call.set("Origin", denied);
      await call.expect(403);
      expect(executor.queries).toHaveLength(0);
    }
    await request(await app(new Executor()))
      .patch("/api/v1/admin/users/42/activation")
      .set("Origin", origin)
      .set("Content-Type", "application/json")
      .send('{"isActive":')
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe("MALFORMED_REQUEST"));
  });

  it("validates GET body/query and PATCH path/query/body before business SQL", async () => {
    const auth = await cookie("ADMIN");
    for (const path of [
      "/api/v1/admin/users?role=ALL",
      "/api/v1/admin/users?isActive=TRUE",
      "/api/v1/admin/users?pageSize=101"
    ]) {
      const executor = new Executor();
      executor.account = { id: 3, role: "ADMIN", isActive: true };
      await request(await app(executor))
        .get(path)
        .set("Cookie", auth)
        .expect(422);
      expect(executor.queries).toHaveLength(1);
    }
    const getBody = new Executor();
    getBody.account = { id: 3, role: "ADMIN", isActive: true };
    await request(await app(getBody))
      .get("/api/v1/admin/users")
      .set("Cookie", auth)
      .send({})
      .expect(422);

    for (const path of [
      "/api/v1/admin/users/0/activation",
      "/api/v1/admin/users/1.5/activation",
      "/api/v1/admin/users/2147483648/activation",
      "/api/v1/admin/users/42/activation?x=1"
    ]) {
      const executor = new Executor();
      executor.account = { id: 3, role: "ADMIN", isActive: true };
      await request(await app(executor))
        .patch(path)
        .set("Origin", origin)
        .set("Cookie", auth)
        .send({ isActive: false })
        .expect(422);
      expect(executor.queries).toHaveLength(1);
    }
    for (const body of [{}, { isActive: "false" }, { isActive: false, role: "TENANT" }]) {
      const executor = new Executor();
      executor.account = { id: 3, role: "ADMIN", isActive: true };
      await request(await app(executor))
        .patch("/api/v1/admin/users/42/activation")
        .set("Origin", origin)
        .set("Cookie", auth)
        .send(body)
        .expect(422);
      expect(executor.queries).toHaveLength(1);
    }
  });

  it("returns 404 for missing, 403 for any ADMIN target, and 200 canonical profile for legal targets", async () => {
    const auth = await cookie("ADMIN");
    const missing = new Executor();
    missing.account = { id: 3, role: "ADMIN", isActive: true };
    missing.target = null;
    await request(await app(missing))
      .patch("/api/v1/admin/users/99/activation")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({ isActive: false })
      .expect(404)
      .expect(({ body }) => expect(body.error.code).toBe("RESOURCE_NOT_FOUND"));

    for (const targetId of [3, 8]) {
      const forbidden = new Executor();
      forbidden.account = { id: 3, role: "ADMIN", isActive: true };
      forbidden.target = userRow({ id: targetId, role: "ADMIN", phone_e164: null, is_active: true });
      await request(await app(forbidden))
        .patch(`/api/v1/admin/users/${targetId}/activation`)
        .set("Origin", origin)
        .set("Cookie", auth)
        .send({ isActive: false })
        .expect(403)
        .expect(({ body }) => expect(body.error.code).toBe("FORBIDDEN"));
      expect(forbidden.queries.some((query) => query.text.includes("UPDATE users"))).toBe(false);
    }

    const legal = new Executor();
    legal.account = { id: 3, role: "ADMIN", isActive: true };
    legal.target = userRow({ is_active: true });
    const response = await request(await app(legal))
      .patch("/api/v1/admin/users/42/activation")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({ isActive: false })
      .expect(200);
    expect(response.body.data).toMatchObject({ id: 42, role: "LANDLORD", isActive: false });
    expect(Object.keys(response.body.data).sort()).toStrictEqual(
      ["id", "role", "email", "phone", "isActive", "createdAt", "updatedAt"].sort()
    );
  });
});
