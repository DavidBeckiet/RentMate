import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";

const frontendOrigin = "http://localhost:3000";
const secret = "rm035-http-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const privateSentinels = [
  "PRIVATE_ADDRESS_SENTINEL",
  "PRIVATE_EMAIL_SENTINEL",
  "PRIVATE_PHONE_SENTINEL",
  "PRIVATE_PASSWORD_HASH_SENTINEL",
  "PRIVATE_PROVIDER_ID_SENTINEL",
  "PRIVATE_MODERATION_SENTINEL"
] as const;

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  empty = false;
  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("SELECT 'property_type' AS kind")) {
      return result([
        { kind: "property_type", code: "STUDIO" },
        { kind: "amenity", code: "WIFI" }
      ] as unknown as Row[]);
    }
    if (query.text.includes("WITH page_candidates AS")) {
      if (this.empty) return result([] as Row[]);
      return result([
        {
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
          cover_image_url: "https://cdn.example.test/public.webp",
          cover_image_alt_text: "Room",
          cover_image_display_order: 1,
          updated_at: "2026-07-29T07:15:00.000Z",
          address_text: privateSentinels[0],
          landlord_email: privateSentinels[1],
          landlord_phone: privateSentinels[2],
          password_hash: privateSentinels[3],
          cloudinary_public_id: privateSentinels[4],
          moderation_reason: privateSentinels[5]
        }
      ] as unknown as Row[]);
    }
    throw new Error("Unexpected RM-035 HTTP SQL.");
  }
}

const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

async function makeApp(executor: Executor) {
  return createBackendApp({
    frontendOrigin,
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds,
    authRateLimitClock: () => 0
  });
}

async function cookie(role: UserRole, userId = 7, now = seconds): Promise<string> {
  const token = await createSessionTokenService({ secret, nowSeconds: () => now }).sign({ userId, role });
  return `rentmate_session=${token}`;
}

describe("RM-035 public listing search HTTP", () => {
  it("returns the exact anonymous public collection without Origin or private values", async () => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .get("/api/v1/listings")
      .expect(200);
    expect(response.body).toStrictEqual({
      data: [
        {
          id: 42,
          title: "Public studio",
          monthlyRent: 7500000,
          roomAreaSqm: 28.5,
          areaName: "District 1",
          latitude: 10.773,
          longitude: 106.698,
          propertyType: { code: "STUDIO", label: "Studio" },
          amenities: [{ code: "WIFI", label: "Wi-Fi" }],
          coverImage: { url: "https://cdn.example.test/public.webp", altText: "Room", displayOrder: 1 },
          updatedAt: "2026-07-29T07:15:00.000Z"
        }
      ],
      pagination: { page: 1, pageSize: 20, hasNextPage: false }
    });
    expect(response.body.pagination.total).toBeUndefined();
    expect(response.headers["set-cookie"]).toBeUndefined();
    for (const sentinel of privateSentinels) expect(JSON.stringify(response.body)).not.toContain(sentinel);
  });

  it("ignores valid role cookies plus invalid, expired, and inactive-account-shaped cookies", async () => {
    const cookies = [
      await cookie("TENANT"),
      await cookie("LANDLORD"),
      await cookie("ADMIN"),
      "rentmate_session=invalid",
      await cookie("TENANT", 8, seconds - 10_000),
      await cookie("LANDLORD", 999)
    ];
    for (const session of cookies) {
      const executor = new Executor();
      const response = await request(await makeApp(executor))
        .get("/api/v1/listings")
        .set("Cookie", session)
        .expect(200);
      expect(response.body.data[0]?.id).toBe(42);
      expect(executor.queries).toHaveLength(1);
    }
  });

  it("allows a safe GET with an untrusted Origin and accepts ordinary filters", async () => {
    const executor = new Executor();
    await request(await makeApp(executor))
      .get("/api/v1/listings?q=%25_%5C&propertyType=studio&amenities=wifi&pageSize=2&sort=rent_asc")
      .set("Origin", "https://untrusted.example")
      .expect(200);
    expect(executor.queries).toHaveLength(2);
  });

  it.each(["unknown=x"])("returns the existing validation envelope without executing search for %s", async (query) => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .get(`/api/v1/listings?${query}`)
      .expect(422);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_FAILED",
      message: "The request contains invalid data."
    });
    expect(executor.queries).toHaveLength(0);
    expect(JSON.stringify(response.body)).not.toMatch(/RM-036|not implemented|future task/i);
  });

  it("returns an exact empty page and rejects a GET body", async () => {
    const executor = new Executor();
    executor.empty = true;
    await request(await makeApp(executor))
      .get("/api/v1/listings?page=2&pageSize=2")
      .expect(200, {
        data: [],
        pagination: { page: 2, pageSize: 2, hasNextPage: false }
      });
    await request(await makeApp(new Executor()))
      .get("/api/v1/listings")
      .set("Content-Type", "application/json")
      .send("{}")
      .expect(422);
  });
});
