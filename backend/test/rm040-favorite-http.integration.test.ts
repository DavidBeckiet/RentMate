import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { AuthenticationAccount, UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const deniedOrigin = "https://denied.example";
const secret = "rm040-http-test-only-secret-not-for-production";
const wrongSecret = "rm040-wrong-signature-test-secret";
const seconds = 1_900_000_000;

function result<Row extends QueryResultRow>(rows: Row[], command = "SELECT", rowCount = rows.length): QueryResult<Row> {
  return { command, rowCount, oid: 0, fields: [], rows };
}

const summaryRow = Object.freeze({
  id: 42,
  title: "Public studio",
  monthly_rent: "7500000",
  room_area_sqm: "28.50",
  area_name: "District 1",
  latitude: 10.772549,
  longitude: 106.697912,
  property_type_code: "STUDIO",
  property_type_label: "Studio",
  amenities: [{ code: "WIFI", label: "Wi-Fi" }],
  cover_image_url: "https://cdn.example.test/rm040-cover.webp",
  cover_image_alt_text: "Room",
  cover_image_display_order: 1,
  updated_at: "2026-08-01T07:15:00.000Z"
});

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  account: AuthenticationAccount | null = null;
  mutationCount = 0;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("role") && query.text.includes("is_active") && !query.text.includes("visible_target")) {
      return result(
        (this.account === null
          ? []
          : [{ id: this.account.id, role: this.account.role, is_active: this.account.isActive }]) as unknown as Row[]
      );
    }
    if (query.text.includes("WITH page_candidates AS")) return result([summaryRow] as unknown as Row[]);
    if (query.text.includes("WITH visible_target AS MATERIALIZED")) {
      this.mutationCount += 1;
      return result([{ is_visible: true, was_inserted: true }] as unknown as Row[]);
    }
    if (query.text.includes("DELETE FROM favorites")) {
      this.mutationCount += 1;
      return result([] as Row[], "DELETE", 0);
    }
    throw new Error("Unexpected RM-040 HTTP SQL.");
  }
}

function logger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function makeApp(executor: Executor) {
  return createBackendApp({
    frontendOrigin: origin,
    logger: logger(),
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds,
    authRateLimitClock: () => 0
  });
}

async function cookie(role: UserRole, userId = 7, issuedAt = seconds, tokenSecret = secret): Promise<string> {
  const token = await createSessionTokenService({ secret: tokenSecret, nowSeconds: () => issuedAt }).sign({
    userId,
    role
  });
  return `rentmate_session=${token}`;
}

type Endpoint = Readonly<{ method: "get" | "put" | "delete"; path: string }>;

const endpoints: readonly Endpoint[] = [
  { method: "get", path: "/api/v1/favorites" },
  { method: "put", path: "/api/v1/favorites/42" },
  { method: "delete", path: "/api/v1/favorites/42" }
];

async function callEndpoint(executor: Executor, endpoint: Endpoint, sessionCookie?: string, requestOrigin?: string) {
  const agent = request(await makeApp(executor));
  const call =
    endpoint.method === "get"
      ? agent.get(endpoint.path)
      : endpoint.method === "put"
        ? agent.put(endpoint.path)
        : agent.delete(endpoint.path);
  if (sessionCookie) call.set("Cookie", sessionCookie);
  if (requestOrigin) call.set("Origin", requestOrigin);
  return call;
}

describe("RM-040 favorite HTTP verification", () => {
  it("rejects every authentication failure on all three endpoints and rechecks the current account", async () => {
    const cases = [
      { name: "missing auth", session: undefined, account: null, accountQueries: 0 },
      { name: "malformed token", session: "rentmate_session=malformed", account: null, accountQueries: 0 },
      {
        name: "invalid signature",
        session: await cookie("TENANT", 7, seconds, wrongSecret),
        account: null,
        accountQueries: 0
      },
      {
        name: "expired token",
        session: await cookie("TENANT", 7, seconds - 7_201),
        account: null,
        accountQueries: 0
      },
      { name: "missing account", session: await cookie("TENANT"), account: null, accountQueries: 1 },
      {
        name: "inactive tenant",
        session: await cookie("TENANT"),
        account: { id: 7, role: "TENANT" as const, isActive: false },
        accountQueries: 1
      },
      {
        name: "ID mismatch",
        session: await cookie("TENANT"),
        account: { id: 8, role: "TENANT" as const, isActive: true },
        accountQueries: 1
      },
      {
        name: "role mismatch",
        session: await cookie("TENANT"),
        account: { id: 7, role: "LANDLORD" as const, isActive: true },
        accountQueries: 1
      }
    ];

    for (const endpoint of endpoints) {
      for (const authentication of cases) {
        const executor = new Executor();
        executor.account = authentication.account;
        const response = await callEndpoint(
          executor,
          endpoint,
          authentication.session,
          endpoint.method === "get" ? undefined : origin
        );
        expect(response.status, `${endpoint.method} ${authentication.name}`).toBe(401);
        expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
        expect(executor.queries).toHaveLength(authentication.accountQueries);
        expect(executor.mutationCount).toBe(0);
      }
    }
  });

  it("forbids active LANDLORD and ADMIN but allows active TENANT on every endpoint", async () => {
    for (const role of ["LANDLORD", "ADMIN"] as const) {
      for (const endpoint of endpoints) {
        const executor = new Executor();
        executor.account = { id: 8, role, isActive: true };
        const response = await callEndpoint(
          executor,
          endpoint,
          await cookie(role, 8),
          endpoint.method === "get" ? undefined : origin
        );
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("FORBIDDEN");
        expect(executor.queries).toHaveLength(1);
      }
    }

    for (const endpoint of endpoints) {
      const executor = new Executor();
      executor.account = { id: 7, role: "TENANT", isActive: true };
      const response = await callEndpoint(
        executor,
        endpoint,
        await cookie("TENANT"),
        endpoint.method === "get" ? undefined : origin
      );
      expect(response.status).toBe(endpoint.method === "get" ? 200 : 204);
      expect(executor.queries).toHaveLength(2);
    }
  });

  it("allows safe GET with missing or denied Origin and blocks both unsafe methods before mutation", async () => {
    for (const requestOrigin of [undefined, deniedOrigin]) {
      const executor = new Executor();
      executor.account = { id: 7, role: "TENANT", isActive: true };
      const response = await callEndpoint(executor, endpoints[0]!, await cookie("TENANT"), requestOrigin);
      expect(response.status).toBe(200);
      expect(executor.queries).toHaveLength(2);
    }

    for (const endpoint of endpoints.slice(1)) {
      for (const requestOrigin of [undefined, deniedOrigin]) {
        const executor = new Executor();
        executor.account = { id: 7, role: "TENANT", isActive: true };
        const response = await callEndpoint(executor, endpoint, await cookie("TENANT"), requestOrigin);
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe("FORBIDDEN");
        expect(executor.queries).toHaveLength(0);
        expect(executor.mutationCount).toBe(0);
      }
    }
  });

  it("enforces the complete collection query grammar and pagination boundaries", async () => {
    const auth = await cookie("TENANT");
    for (const [query, status] of [
      ["", 200],
      ["?pageSize=100", 200],
      ["?pageSize=101", 422],
      ["?page=1&page=2", 422],
      ["?pageSize=20&pageSize=21", 422],
      ["?unknown=x", 422],
      ["?page=0", 422],
      ["?page=1.5", 422],
      ["?pageSize=0", 422],
      ["?pageSize=1.5", 422]
    ] as const) {
      const executor = new Executor();
      executor.account = { id: 7, role: "TENANT", isActive: true };
      const response = await request(await makeApp(executor))
        .get(`/api/v1/favorites${query}`)
        .set("Cookie", auth);
      expect(response.status, query).toBe(status);
      if (status === 200) {
        expect(response.body.pagination).toMatchObject({ page: 1, hasNextPage: false });
        expect(response.body.pagination.pageSize).toBe(query ? 100 : 20);
      } else {
        expect(response.body.error.code).toBe("VALIDATION_FAILED");
      }
    }
  });

  it("rejects malformed IDs, query fields, parsed bodies, and malformed JSON on both mutations", async () => {
    const auth = await cookie("TENANT");
    for (const method of ["put", "delete"] as const) {
      for (const listingId of ["0", "-1", "1.5", "1e3", "%201", "1x", "2147483648"]) {
        const executor = new Executor();
        executor.account = { id: 7, role: "TENANT", isActive: true };
        const agent = request(await makeApp(executor));
        const response = await agent[method](`/api/v1/favorites/${listingId}`)
          .set("Origin", origin)
          .set("Cookie", auth);
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe("VALIDATION_FAILED");
      }

      for (const kind of ["query", "body", "malformed"] as const) {
        const executor = new Executor();
        executor.account = { id: 7, role: "TENANT", isActive: true };
        const agent = request(await makeApp(executor));
        const call = agent[method](kind === "query" ? "/api/v1/favorites/42?tenantId=7" : "/api/v1/favorites/42")
          .set("Origin", origin)
          .set("Cookie", auth);
        if (kind === "body") call.send({});
        if (kind === "malformed") call.set("Content-Type", "application/json").send("{");
        const response = await call;
        expect(response.status).toBe(kind === "malformed" ? 400 : 422);
        expect(response.body.error.code).toBe(kind === "malformed" ? "MALFORMED_REQUEST" : "VALIDATION_FAILED");
      }
    }

    const executor = new Executor();
    executor.account = { id: 7, role: "TENANT", isActive: true };
    const getWithBody = await request(await makeApp(executor))
      .get("/api/v1/favorites")
      .set("Cookie", auth)
      .send({});
    expect(getWithBody.status).toBe(422);
  });

  it("keeps active-tenant HTTP query counts at account lookup plus one repository statement", async () => {
    for (const endpoint of endpoints) {
      const executor = new Executor();
      executor.account = { id: 7, role: "TENANT", isActive: true };
      const response = await callEndpoint(
        executor,
        endpoint,
        await cookie("TENANT"),
        endpoint.method === "get" ? undefined : origin
      );
      expect(response.status).toBe(endpoint.method === "get" ? 200 : 204);
      expect(executor.queries).toHaveLength(2);
    }
  });
});
