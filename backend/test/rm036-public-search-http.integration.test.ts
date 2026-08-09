import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ParameterizedQuery, SqlExecutor } from "../src/db/sql-executor.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";

const privateSentinels = [
  "RM036_PRIVATE_ADDRESS",
  "RM036_PRIVATE_EMAIL",
  "RM036_PRIVATE_PHONE",
  "RM036_PRIVATE_PROVIDER",
  "RM036_PRIVATE_MODERATION"
] as const;

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows };
}

class Executor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    if (query.text.includes("SELECT 'property_type' AS kind")) {
      return result([
        { kind: "property_type", code: "STUDIO" },
        { kind: "amenity", code: "WIFI" }
      ] as unknown as Row[]);
    }
    if (query.text.includes("distance_candidates AS MATERIALIZED")) {
      return result([
        {
          id: 72,
          title: "Radius studio",
          monthly_rent: "7500000",
          room_area_sqm: "28.50",
          area_name: "District 1",
          latitude: 10.772549,
          longitude: 106.697912,
          property_type_code: "STUDIO",
          property_type_label: "Studio",
          amenities: [{ code: "WIFI", label: "Wi-Fi" }],
          cover_image_url: "https://cdn.example.test/radius.webp",
          cover_image_alt_text: "Radius room",
          cover_image_display_order: 1,
          updated_at: "2026-07-29T07:15:00.000Z",
          distance_km: 0.023456789,
          address_text: privateSentinels[0],
          landlord_email: privateSentinels[1],
          landlord_phone: privateSentinels[2],
          cloudinary_public_id: privateSentinels[3],
          moderation_reason: privateSentinels[4]
        }
      ] as unknown as Row[]);
    }
    if (query.text.includes("WITH page_candidates AS")) {
      return result([
        {
          id: 71,
          title: "Bounds studio",
          monthly_rent: "7000000",
          room_area_sqm: "25.00",
          area_name: "District 1",
          latitude: 10.633499,
          longitude: 106.933001,
          property_type_code: "STUDIO",
          property_type_label: "Studio",
          amenities: [{ code: "WIFI", label: "Wi-Fi" }],
          cover_image_url: "https://cdn.example.test/bounds.webp",
          cover_image_alt_text: "Bounds room",
          cover_image_display_order: 1,
          updated_at: "2026-07-29T07:15:00.000Z",
          address_text: privateSentinels[0],
          landlord_email: privateSentinels[1],
          landlord_phone: privateSentinels[2],
          cloudinary_public_id: privateSentinels[3],
          moderation_reason: privateSentinels[4]
        }
      ] as unknown as Row[]);
    }
    throw new Error("Unexpected RM-036 HTTP SQL.");
  }
}

const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

async function makeApp(executor: Executor) {
  return createBackendApp({
    frontendOrigin: "http://localhost:3000",
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: "rm036-http-test-only-secret-not-for-production",
    bcryptCost: 4,
    cookieSecure: false,
    publicListingSearchConfig: {
      deploymentRegion: "HO_CHI_MINH_CITY_VN",
      maximumSearchRadiusKm: 50
    }
  });
}

describe("RM-036 public listing search HTTP", () => {
  it("executes inclusive bounds and omits distanceKm from the public DTO", async () => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .get(
        "/api/v1/listings?north=11.166666666666667&south=10.633333333333333&east=106.93333333333334&west=106.36666666666666"
      )
      .expect(200);

    expect(response.body.data).toStrictEqual([
      {
        id: 71,
        title: "Bounds studio",
        monthlyRent: 7000000,
        roomAreaSqm: 25,
        areaName: "District 1",
        latitude: 10.633,
        longitude: 106.933,
        propertyType: { code: "STUDIO", label: "Studio" },
        amenities: [{ code: "WIFI", label: "Wi-Fi" }],
        coverImage: { url: "https://cdn.example.test/bounds.webp", altText: "Bounds room", displayOrder: 1 },
        updatedAt: "2026-07-29T07:15:00.000Z"
      }
    ]);
    expect(response.body.data[0]).not.toHaveProperty("distanceKm");
    expect(executor.queries).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toMatch(/RM036_PRIVATE|address|landlord|moderation|provider/i);
  });

  it("executes radius search with exact-distance DTO precision and controlled-code validation", async () => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .get("/api/v1/listings?centerLat=10.772341&centerLng=106.697912&radiusKm=5&propertyType=studio&amenities=wifi")
      .expect(200);

    expect(response.body.data[0]).toMatchObject({
      id: 72,
      latitude: 10.773,
      longitude: 106.698,
      distanceKm: 0.023456789
    });
    expect(response.body.data[0]).not.toHaveProperty("addressText");
    expect(executor.queries).toHaveLength(2);
    expect(executor.queries[1]!.text).toContain("distance_candidates AS MATERIALIZED");
    expect(JSON.stringify(response.body)).not.toMatch(/RM036_PRIVATE|address|landlord|moderation|provider/i);
  });

  it.each([
    "centerLat=10.633333333333333&centerLng=106.697912&radiusKm=50.001",
    "centerLat=10.633333333332&centerLng=106.697912&radiusKm=1",
    "centerLat=10.772341&centerLng=106.697912&radiusKm=50.001"
  ])("rejects radius policy failures without repository work: %s", async (query) => {
    const executor = new Executor();
    const response = await request(await makeApp(executor))
      .get(`/api/v1/listings?${query}`)
      .expect(422);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_FAILED",
      message: "The request contains invalid data."
    });
    expect(executor.queries).toHaveLength(0);
    expect(JSON.stringify(response.body)).not.toMatch(/rectangle|south|north|west|east/i);
  });
});
