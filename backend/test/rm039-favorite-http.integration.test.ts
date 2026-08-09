import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { AuthenticationAccount, UserRole } from "../src/shared/types/authentication.js";

const origin = "http://localhost:3000";
const secret = "rm039-http-test-only-secret-not-for-production";
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
  cover_image_url: "https://cdn.example.test/rm039-cover.webp",
  cover_image_alt_text: "Room",
  cover_image_display_order: 1,
  updated_at: "2026-08-01T07:15:00.000Z"
});

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  account: AuthenticationAccount | null = null;
  favoriteVisible = true;
  favoriteRows: QueryResultRow[] = [summaryRow];

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("role") && query.text.includes("is_active") && !query.text.includes("visible_target")) {
      return result(
        (this.account === null
          ? []
          : [{ id: this.account.id, role: this.account.role, is_active: this.account.isActive }]) as unknown as Row[]
      );
    }
    if (query.text.includes("WITH page_candidates AS")) return result(this.favoriteRows as Row[]);
    if (query.text.includes("WITH visible_target AS MATERIALIZED")) {
      return result([{ is_visible: this.favoriteVisible, was_inserted: this.favoriteVisible }] as unknown as Row[]);
    }
    if (query.text.includes("DELETE FROM favorites")) return result([] as Row[], "DELETE", 0);
    throw new Error("Unexpected RM-039 HTTP SQL.");
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

async function cookie(role: UserRole, userId = 7, issuedAt = seconds): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => issuedAt }).sign({ userId, role });
  return `rentmate_session=${token}`;
}

function expectedSummary() {
  return {
    id: 42,
    title: "Public studio",
    monthlyRent: 7500000,
    roomAreaSqm: 28.5,
    areaName: "District 1",
    latitude: 10.773,
    longitude: 106.698,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [{ code: "WIFI", label: "Wi-Fi" }],
    coverImage: { url: "https://cdn.example.test/rm039-cover.webp", altText: "Room", displayOrder: 1 },
    updatedAt: "2026-08-01T07:15:00.000Z"
  };
}

describe("RM-039 favorite HTTP contract", () => {
  it("returns the exact tenant collection envelope with one favorite query", async () => {
    const executor = new Executor();
    executor.account = { id: 7, role: "TENANT", isActive: true };
    const response = await request(await makeApp(executor))
      .get("/api/v1/favorites?page=2&pageSize=1")
      .set("Cookie", await cookie("TENANT"))
      .expect(200);

    expect(response.body).toStrictEqual({
      data: [expectedSummary()],
      pagination: { page: 2, pageSize: 1, hasNextPage: false }
    });
    expect(executor.queries).toHaveLength(2);
    expect(executor.queries[1]?.values).toStrictEqual([7, 2, 1]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /addressText|description|password|cloudinary|moderation|landlord|favoriteCreatedAt/i
    );
  });

  it.each(["put", "delete"] as const)("returns 204 for tenant %s", async (method) => {
    const executor = new Executor();
    executor.account = { id: 7, role: "TENANT", isActive: true };
    const call = request(await makeApp(executor))[method]("/api/v1/favorites/42");
    const response = await call
      .set("Origin", origin)
      .set("Cookie", await cookie("TENANT"))
      .expect(204);
    expect(response.text).toBe("");
    expect(executor.queries).toHaveLength(2);
  });

  it("returns the same generic 404 for every non-public PUT target", async () => {
    const executor = new Executor();
    executor.account = { id: 7, role: "TENANT", isActive: true };
    executor.favoriteVisible = false;
    const response = await request(await makeApp(executor))
      .put("/api/v1/favorites/42")
      .set("Origin", origin)
      .set("Cookie", await cookie("TENANT"))
      .expect(404);
    expect(response.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
  });

  it.each([
    ["GET", "/api/v1/favorites"],
    ["PUT", "/api/v1/favorites/42"],
    ["DELETE", "/api/v1/favorites/42"]
  ])("requires authentication for %s %s", async (method, path) => {
    const executor = new Executor();
    const call = request(await makeApp(executor))[method.toLowerCase() as "get"](path);
    if (method !== "GET") call.set("Origin", origin);
    const response = await call.expect(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(executor.queries).toHaveLength(0);
  });

  it.each(["LANDLORD", "ADMIN"] as const)("forbids active %s on all favorite endpoints", async (role) => {
    for (const [method, path] of [
      ["get", "/api/v1/favorites"],
      ["put", "/api/v1/favorites/42"],
      ["delete", "/api/v1/favorites/42"]
    ] as const) {
      const executor = new Executor();
      executor.account = { id: 8, role, isActive: true };
      const agent = request(await makeApp(executor));
      const call = method === "get" ? agent.get(path) : method === "put" ? agent.put(path) : agent.delete(path);
      call.set("Cookie", await cookie(role, 8));
      if (method !== "get") call.set("Origin", origin);
      const response = await call.expect(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(executor.queries).toHaveLength(1);
    }
  });

  it("rejects invalid, expired, and inactive authentication across favorite endpoints", async () => {
    for (const [method, path] of [
      ["get", "/api/v1/favorites"],
      ["put", "/api/v1/favorites/42"],
      ["delete", "/api/v1/favorites/42"]
    ] as const) {
      for (const authentication of [
        { value: "rentmate_session=invalid", account: null, queries: 0 },
        { value: await cookie("TENANT", 7, seconds - 7_201), account: null, queries: 0 },
        {
          value: await cookie("TENANT"),
          account: { id: 7, role: "TENANT" as const, isActive: false },
          queries: 1
        }
      ]) {
        const executor = new Executor();
        executor.account = authentication.account;
        const agent = request(await makeApp(executor));
        const call = method === "get" ? agent.get(path) : method === "put" ? agent.put(path) : agent.delete(path);
        call.set("Cookie", authentication.value);
        if (method !== "get") call.set("Origin", origin);
        const response = await call.expect(401);
        expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
        expect(executor.queries).toHaveLength(authentication.queries);
      }
    }
  });

  it("rejects unsafe requests without an allowed Origin before authentication or SQL", async () => {
    for (const badOrigin of [undefined, "https://untrusted.example"]) {
      const executor = new Executor();
      const call = request(await makeApp(executor)).put("/api/v1/favorites/42");
      if (badOrigin) call.set("Origin", badOrigin);
      const response = await call.expect(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(executor.queries).toHaveLength(0);
    }
  });

  it("rejects malformed ids, unknown query fields, present bodies, and malformed JSON", async () => {
    const auth = await cookie("TENANT");
    for (const path of ["/api/v1/favorites/0", "/api/v1/favorites/1.5", "/api/v1/favorites/2147483648"]) {
      const executor = new Executor();
      executor.account = { id: 7, role: "TENANT", isActive: true };
      await request(await makeApp(executor))
        .put(path)
        .set("Origin", origin)
        .set("Cookie", auth)
        .expect(422);
      expect(executor.queries).toHaveLength(1);
    }
    const collection = new Executor();
    collection.account = { id: 7, role: "TENANT", isActive: true };
    await request(await makeApp(collection))
      .get("/api/v1/favorites?unknown=x")
      .set("Cookie", auth)
      .expect(422);
    expect(collection.queries).toHaveLength(1);

    const body = new Executor();
    body.account = { id: 7, role: "TENANT", isActive: true };
    await request(await makeApp(body))
      .delete("/api/v1/favorites/42")
      .set("Origin", origin)
      .set("Cookie", auth)
      .send({})
      .expect(422);

    const malformed = await request(await makeApp(new Executor()))
      .put("/api/v1/favorites/42")
      .set("Origin", origin)
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
    expect(malformed.body.error.code).toBe("MALFORMED_REQUEST");
  });
});
