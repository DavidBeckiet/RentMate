import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService, type SessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import { ApplicationError } from "../src/shared/errors/application-error.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { AuthenticationAccount, UserRole } from "../src/shared/types/authentication.js";

const secret = "rm038-http-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const contact = Object.freeze({ email: "rm038.owner@example.com", phone: "+84901234567" });
const privateSentinels = [
  "RM038_PRIVATE_ADDRESS",
  "RM038_PRIVATE_MODERATION",
  "RM038_PRIVATE_PROVIDER",
  "RM038_PRIVATE_PASSWORD"
] as const;

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
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
  cover_image_url: "https://cdn.example.test/rm038-cover.webp",
  cover_image_alt_text: "Room",
  cover_image_display_order: 1,
  updated_at: "2026-08-01T07:15:00.000Z",
  address_text: privateSentinels[0],
  moderation_reason: privateSentinels[1],
  cloudinary_public_id: privateSentinels[2],
  password_hash: privateSentinels[3],
  landlord_email: contact.email,
  landlord_phone: contact.phone
});

const detailRow = Object.freeze({
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
  images: [{ url: "https://cdn.example.test/rm038-detail.webp", altText: "Room", displayOrder: 1 }],
  updated_at: "2026-08-01T07:15:00.000Z",
  address_text: privateSentinels[0],
  moderation_reason: privateSentinels[1],
  cloudinary_public_id: privateSentinels[2],
  password_hash: privateSentinels[3]
});

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];
  account: AuthenticationAccount | null = null;
  authenticationFailure: Error | null = null;

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("role") && query.text.includes("is_active") && !query.text.includes("page_candidates")) {
      if (this.authenticationFailure) throw this.authenticationFailure;
      return result(
        (this.account === null
          ? []
          : [{ id: this.account.id, role: this.account.role, is_active: this.account.isActive }]) as unknown as Row[]
      );
    }
    if (query.text.includes("SELECT 'property_type' AS kind")) {
      return result([
        { kind: "property_type", code: "STUDIO" },
        { kind: "amenity", code: "WIFI" }
      ] as unknown as Row[]);
    }
    if (query.text.includes("distance_candidates AS MATERIALIZED")) {
      return result([{ ...summaryRow, distance_km: 0.023456789 }] as unknown as Row[]);
    }
    if (query.text.includes("WITH page_candidates AS")) {
      return result([summaryRow] as unknown as Row[]);
    }
    if (query.text.includes("FROM listings AS l")) {
      if (query.text.includes("landlord.email AS landlord_email")) {
        return result([
          { ...detailRow, landlord_email: contact.email, landlord_phone: contact.phone }
        ] as unknown as Row[]);
      }
      return result([detailRow] as unknown as Row[]);
    }
    throw new Error("Unexpected RM-038 HTTP SQL.");
  }
}

function logger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function app(
  executor: Executor,
  options: Readonly<{ sessionTokenService?: SessionTokenService; logger?: Logger }> = {}
) {
  return createBackendApp({
    frontendOrigin: "http://localhost:3000",
    logger: options.logger ?? logger(),
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds,
    sessionTokenService: options.sessionTokenService,
    publicListingSearchConfig: {
      deploymentRegion: "HO_CHI_MINH_CITY_VN",
      maximumSearchRadiusKm: 50
    }
  });
}

async function cookie(role: UserRole, userId = 7, issuedAt = seconds, tokenSecret = secret): Promise<string> {
  const token = await createSessionTokenService({ secret: tokenSecret, nowSeconds: () => issuedAt }).sign({
    userId,
    role
  });
  return `rentmate_session=${token}`;
}

const summaryKeys = [
  "amenities",
  "areaName",
  "coverImage",
  "id",
  "latitude",
  "longitude",
  "monthlyRent",
  "propertyType",
  "roomAreaSqm",
  "title",
  "updatedAt"
] as const;

const detailKeys = [
  "amenities",
  "areaName",
  "description",
  "id",
  "images",
  "latitude",
  "longitude",
  "monthlyRent",
  "propertyType",
  "roomAreaSqm",
  "title",
  "updatedAt"
] as const;

function expectNoPrivateSentinel(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const sentinel of [...privateSentinels, contact.email, contact.phone])
    expect(serialized).not.toContain(sentinel);
}

describe("RM-038 public discovery HTTP verification", () => {
  it.each([
    ["ordinary", ""],
    ["bounds", "?north=11&south=10&east=107&west=106"]
  ])("returns the exact public summary keys for %s mode", async (_mode, query) => {
    const executor = new Executor();
    const response = await request(await app(executor))
      .get(`/api/v1/listings${query}`)
      .expect(200);
    expect(Object.keys(response.body.data[0]).sort()).toStrictEqual([...summaryKeys]);
    expect(response.body.data[0]).not.toHaveProperty("distanceKm");
    expect(response.body.data[0]).not.toHaveProperty("landlordContact");
    expect(response.body.pagination).toStrictEqual({ page: 1, pageSize: 20, hasNextPage: false });
    expect(response.body).not.toHaveProperty("total");
    expect(response.body.pagination).not.toHaveProperty("total");
    expect(response.body.pagination).not.toHaveProperty("totalCount");
    expect(response.body.pagination).not.toHaveProperty("pageCount");
    expectNoPrivateSentinel(response.body);
  });

  it("adds only distanceKm to a radius summary", async () => {
    const executor = new Executor();
    const response = await request(await app(executor))
      .get("/api/v1/listings?centerLat=10.772341&centerLng=106.697912&radiusKm=5")
      .expect(200);
    expect(Object.keys(response.body.data[0]).sort()).toStrictEqual([...summaryKeys, "distanceKm"].sort());
    expect(response.body.data[0].distanceKm).toBe(0.023456789);
    expectNoPrivateSentinel({ ...response.body, data: [{ ...response.body.data[0], distanceKm: undefined }] });
  });

  it("accepts pageSize 100, rejects 101, and rejects duplicate Express scalar queries as 422", async () => {
    const accepted = await request(await app(new Executor()))
      .get("/api/v1/listings?pageSize=100")
      .expect(200);
    expect(accepted.body.pagination.pageSize).toBe(100);
    await request(await app(new Executor()))
      .get("/api/v1/listings?pageSize=101")
      .expect(422);
    for (const duplicate of ["q=a&q=b", "page=1&page=2", "sort=newest&sort=rent_asc"]) {
      const response = await request(await app(new Executor()))
        .get(`/api/v1/listings?${duplicate}`)
        .expect(422);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("keeps the collection identity-independent even with an active TENANT cookie", async () => {
    const executor = new Executor();
    executor.account = { id: 7, role: "TENANT", isActive: true };
    const response = await request(await app(executor))
      .get("/api/v1/listings")
      .set("Cookie", await cookie("TENANT"))
      .expect(200);
    expect(executor.queries).toHaveLength(1);
    expect(response.body.data[0]).not.toHaveProperty("landlordContact");
    expectNoPrivateSentinel(response.body);
  });

  it("returns exact base detail keys and no collection-only fields", async () => {
    const response = await request(await app(new Executor()))
      .get("/api/v1/listings/42")
      .expect(200);
    expect(Object.keys(response.body.data).sort()).toStrictEqual([...detailKeys]);
    expect(response.body.data).not.toHaveProperty("coverImage");
    expect(response.body.data).not.toHaveProperty("distanceKm");
    expect(response.body.data).not.toHaveProperty("createdAt");
    expectNoPrivateSentinel(response.body);
  });

  it("returns contact with exactly email and phone only to an active TENANT", async () => {
    const executor = new Executor();
    executor.account = { id: 7, role: "TENANT", isActive: true };
    const response = await request(await app(executor))
      .get("/api/v1/listings/42")
      .set("Cookie", await cookie("TENANT"))
      .expect(200);
    expect(Object.keys(response.body.data).sort()).toStrictEqual([...detailKeys, "landlordContact"].sort());
    expect(response.body.data.landlordContact).toStrictEqual(contact);
    expect(Object.keys(response.body.data.landlordContact).sort()).toStrictEqual(["email", "phone"]);
    expect(executor.queries).toHaveLength(2);
    expect(executor.queries[1]!.text).toMatch(/landlord\.email AS landlord_email/);
    expect(executor.queries[1]!.text).toMatch(/landlord\.phone_e164 AS landlord_phone/);
    const withoutAllowedContact = {
      ...response.body,
      data: { ...response.body.data, landlordContact: undefined }
    };
    expectNoPrivateSentinel(withoutAllowedContact);
  });

  it.each([
    ["no cookie", undefined, null, 1],
    ["malformed JWT", "rentmate_session=malformed", null, 1],
    ["missing account", "valid", null, 2],
    ["inactive account", "valid", { id: 7, role: "TENANT", isActive: false }, 2],
    ["ID mismatch", "valid", { id: 8, role: "TENANT", isActive: true }, 2],
    ["role mismatch", "valid", { id: 7, role: "ADMIN", isActive: true }, 2]
  ] as const)("omits contact for %s", async (_label, session, account, expectedQueries) => {
    const executor = new Executor();
    executor.account = account;
    let call = request(await app(executor)).get("/api/v1/listings/42");
    if (session === "valid") call = call.set("Cookie", await cookie("TENANT"));
    else if (session !== undefined) call = call.set("Cookie", session);
    const response = await call.expect(200);
    expect(response.body.data).not.toHaveProperty("landlordContact");
    expect(executor.queries).toHaveLength(expectedQueries);
  });

  it("treats invalid-signature and expired JWTs as anonymous with one detail query", async () => {
    for (const session of [
      await cookie("TENANT", 7, seconds, "rm038-wrong-signature-secret"),
      await cookie("TENANT", 7, seconds - 7_201)
    ]) {
      const executor = new Executor();
      const response = await request(await app(executor))
        .get("/api/v1/listings/42")
        .set("Cookie", session)
        .expect(200);
      expect(response.body.data).not.toHaveProperty("landlordContact");
      expect(executor.queries).toHaveLength(1);
    }
  });

  it.each([
    ["active LANDLORD", "LANDLORD", 8],
    ["owner LANDLORD", "LANDLORD", 42],
    ["active ADMIN", "ADMIN", 9]
  ] as const)("omits contact for %s with exactly two queries", async (_label, role, userId) => {
    const executor = new Executor();
    executor.account = { id: userId, role, isActive: true };
    const response = await request(await app(executor))
      .get("/api/v1/listings/42")
      .set("Cookie", await cookie(role, userId))
      .expect(200);
    expect(response.body.data).not.toHaveProperty("landlordContact");
    expect(executor.queries).toHaveLength(2);
    expect(executor.queries[1]!.text).not.toMatch(/landlord\.email|phone_e164/);
  });

  it("surfaces verifier and account-loader infrastructure failures with sanitized envelopes", async () => {
    const verifierSecret = "RM038_PRIVATE_JWT_COOKIE";
    const failingVerifier: SessionTokenService = {
      sign: async () => "unused",
      verify: async () => Promise.reject(new Error(verifierSecret))
    };
    const verifierExecutor = new Executor();
    const verifierResponse = await request(await app(verifierExecutor, { sessionTokenService: failingVerifier }))
      .get("/api/v1/listings/42")
      .set("Cookie", `rentmate_session=${verifierSecret}`)
      .expect(500);
    expect(verifierResponse.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(verifierResponse.text).not.toContain(verifierSecret);
    expect(verifierExecutor.queries).toHaveLength(0);

    for (const failure of [
      new Error("RM038_PRIVATE_SQL_FAILURE"),
      new ApplicationError("DEPENDENCY_UNAVAILABLE", "A required dependency is unavailable.")
    ]) {
      const executor = new Executor();
      executor.authenticationFailure = failure;
      const response = await request(await app(executor))
        .get("/api/v1/listings/42")
        .set("Cookie", await cookie("TENANT"))
        .expect(failure instanceof ApplicationError ? 503 : 500);
      expect(response.body.error.code).toBe(
        failure instanceof ApplicationError ? "DEPENDENCY_UNAVAILABLE" : "INTERNAL_SERVER_ERROR"
      );
      expect(response.text).not.toContain(failure.message === "RM038_PRIVATE_SQL_FAILURE" ? failure.message : "SQL");
      expect(executor.queries).toHaveLength(1);
    }
  });
});
