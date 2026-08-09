import dotenv from "dotenv";
import path from "node:path";
import type { QueryResult, QueryResultRow } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "../src/db/migrations/discovery.js";
import { executeMigrationPlan } from "../src/db/migrations/execution.js";
import { createMigrationPlan } from "../src/db/migrations/planning.js";
import { closeDatabasePool } from "../src/db/pool.js";
import { createSqlExecutor, type ParameterizedQuery, type SqlExecutor } from "../src/db/sql-executor.js";
import { createSessionTokenService } from "../src/modules/auth/session-token.js";
import { createBackendApp } from "../src/server-composition.js";
import type { Logger } from "../src/shared/logging/logger.js";
import type { UserRole } from "../src/shared/types/authentication.js";
import { createTestDatabasePool } from "./support/test-database.js";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const pool = createTestDatabasePool(process.env, { max: 2 });
const realExecutor = createSqlExecutor(pool);
const migrationDirectory = path.resolve(process.cwd(), "migrations");
const secret = "rm038-database-test-only-secret-not-for-production";
const seconds = 1_900_000_000;
const centerLat = 10.772341;
const centerLng = 106.697912;
const hcmc = Object.freeze({
  south: Number("10.633333333333333"),
  north: Number("11.166666666666667"),
  west: Number("106.36666666666666"),
  east: Number("106.93333333333334")
});
const privateSentinels = Object.freeze({
  address: "RM038_PRIVATE_ADDRESS_SENTINEL",
  provider: "rm038-private-provider-sentinel",
  moderation: "RM038_PRIVATE_MODERATION_SENTINEL",
  password: "RM038_PRIVATE_PASSWORD_SENTINEL"
});
const logger: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

class CountingExecutor implements SqlExecutor {
  readonly queries: ParameterizedQuery[] = [];

  constructor(private readonly delegate: SqlExecutor) {}

  async query<Row extends QueryResultRow>(query: ParameterizedQuery): Promise<QueryResult<Row>> {
    this.queries.push(query);
    return this.delegate.query<Row>(query);
  }
}

async function cleanFrozenSchema(): Promise<void> {
  await pool.query("DROP TABLE IF EXISTS moderation_history");
  await pool.query("DROP TABLE IF EXISTS favorites");
  await pool.query("DROP TABLE IF EXISTS listing_amenities");
  await pool.query("DROP TABLE IF EXISTS listing_images");
  await pool.query("DROP TABLE IF EXISTS listings");
  await pool.query("DROP TABLE IF EXISTS amenities");
  await pool.query("DROP TABLE IF EXISTS property_types");
  await pool.query("DROP TABLE IF EXISTS users");
  await pool.query("DROP TYPE IF EXISTS listing_status");
  await pool.query("DROP TYPE IF EXISTS user_role");
}

async function resetRows(): Promise<void> {
  await pool.query("DELETE FROM moderation_history");
  await pool.query("DELETE FROM favorites");
  await pool.query("DELETE FROM listing_amenities");
  await pool.query("DELETE FROM listing_images");
  await pool.query("DELETE FROM listings");
  await pool.query("DELETE FROM users");
  await pool.query("UPDATE property_types SET is_active = true");
  await pool.query("UPDATE amenities SET is_active = true");
}

async function insertUser(role: UserRole, sequence: number, active = true): Promise<number> {
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO users (role, email, phone_e164, password_hash, is_active)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
    values: [
      role,
      `rm038.${role.toLowerCase()}.${sequence}@example.com`,
      role === "LANDLORD" ? `+8494${String(sequence).padStart(8, "0")}` : null,
      sequence === 1 ? privateSentinels.password : "rm038-test-only-hash",
      active
    ]
  });
  return response.rows[0]!.id;
}

async function lookupId(table: "property_types" | "amenities", code: string): Promise<number> {
  const response = await pool.query<{ id: number }>({
    text: `SELECT id FROM ${table} WHERE code = $1`,
    values: [code]
  });
  return response.rows[0]!.id;
}

type Status = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "INACTIVE" | "HIDDEN";

interface ListingInput {
  readonly landlordId: number;
  readonly sequence: number;
  readonly status?: Status;
  readonly title?: string;
  readonly description?: string;
  readonly rent?: number;
  readonly area?: number;
  readonly address?: string;
  readonly areaName?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly propertyType?: string;
  readonly amenities?: readonly string[];
  readonly updatedAt?: string;
  readonly image?: boolean;
}

async function insertListing(input: ListingInput): Promise<number> {
  const propertyTypeId = await lookupId("property_types", input.propertyType ?? "STUDIO");
  const response = await pool.query<{ id: number }>({
    text: `INSERT INTO listings (
      landlord_id, property_type_id, status, title, description, monthly_rent,
      room_area_sqm, address_text, area_name, latitude, longitude, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id`,
    values: [
      input.landlordId,
      propertyTypeId,
      input.status ?? "APPROVED",
      input.title ?? `RM038 listing ${input.sequence}`,
      input.description ?? `RM038 description ${input.sequence}`,
      String(input.rent ?? 5_000_000),
      String(input.area ?? 25),
      input.address ?? (input.sequence === 1 ? privateSentinels.address : `${input.sequence} Exact Street`),
      input.areaName ?? "District 1",
      input.latitude ?? centerLat,
      input.longitude ?? centerLng,
      input.updatedAt ?? "2026-08-01T00:00:00.000Z"
    ]
  });
  const listingId = response.rows[0]!.id;
  if (input.image !== false) {
    await pool.query({
      text: `INSERT INTO listing_images
        (listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order, alt_text)
        VALUES ($1,$2,$3,'webp',800,600,1000,1,'RM038 room')`,
      values: [
        listingId,
        input.sequence === 1 ? privateSentinels.provider : `rm038-provider-${input.sequence}`,
        `https://cdn.example.test/rm038-${listingId}.webp`
      ]
    });
  }
  for (const code of input.amenities ?? []) {
    await pool.query({
      text: "INSERT INTO listing_amenities (listing_id, amenity_id) VALUES ($1, $2)",
      values: [listingId, await lookupId("amenities", code)]
    });
  }
  return listingId;
}

async function makeApp(executor: SqlExecutor = realExecutor) {
  return createBackendApp({
    frontendOrigin: "http://localhost:3000",
    logger,
    checkDatabaseConnection: async () => undefined,
    sqlExecutor: executor,
    jwtSecret: secret,
    bcryptCost: 4,
    cookieSecure: false,
    sessionTokenClock: () => seconds,
    publicListingSearchConfig: {
      deploymentRegion: "HO_CHI_MINH_CITY_VN",
      maximumSearchRadiusKm: 50
    }
  });
}

async function session(userId: number, role: UserRole, issuedAt = seconds, tokenSecret = secret): Promise<string> {
  const token = await createSessionTokenService({ secret: tokenSecret, nowSeconds: () => issuedAt }).sign({
    userId,
    role
  });
  return `rentmate_session=${token}`;
}

function ids(response: request.Response): number[] {
  return (response.body.data as Array<{ id: number }>).map((item) => item.id);
}

function expectSameMembers(actual: readonly number[], expected: readonly number[]): void {
  expect([...actual].sort((left, right) => left - right)).toStrictEqual(
    [...expected].sort((left, right) => left - right)
  );
}

function expectNoPrivateData(value: unknown, allowedContact = false): void {
  const serialized = JSON.stringify(value);
  for (const sentinel of Object.values(privateSentinels)) expect(serialized).not.toContain(sentinel);
  expect(serialized).not.toMatch(/addressText|cloudinaryPublicId|moderationReason|passwordHash|landlordId/i);
  if (!allowedContact) expect(serialized).not.toMatch(/landlordContact|rm038\.landlord|\+8494/i);
}

beforeAll(async () => {
  await cleanFrozenSchema();
  await executeMigrationPlan(pool, createMigrationPlan("clean", await discoverMigrations(migrationDirectory)));
});

beforeEach(resetRows);

afterAll(async () => {
  await cleanFrozenSchema();
  await closeDatabasePool(pool);
});

describe("RM-038 PostgreSQL discovery, privacy, and performance verification", () => {
  it("enforces the exhaustive collection/detail visibility matrix with indistinguishable detail 404s", async () => {
    const activeOwner = await insertUser("LANDLORD", 1);
    const inactiveOwner = await insertUser("LANDLORD", 2, false);
    const visible = await insertListing({ landlordId: activeOwner, sequence: 1 });
    const hiddenIds: number[] = [];
    for (const [index, status] of (["DRAFT", "PENDING", "REJECTED", "INACTIVE", "HIDDEN"] as const).entries()) {
      hiddenIds.push(await insertListing({ landlordId: activeOwner, sequence: 10 + index, status }));
    }
    hiddenIds.push(await insertListing({ landlordId: inactiveOwner, sequence: 20 }));

    const application = await makeApp();
    const collection = await request(application).get("/api/v1/listings").expect(200);
    expect(ids(collection)).toStrictEqual([visible]);
    expectNoPrivateData(collection.body);

    const visibleDetail = await request(application).get(`/api/v1/listings/${visible}`).expect(200);
    expect(typeof visibleDetail.body.data.monthlyRent).toBe("number");
    expect(typeof visibleDetail.body.data.roomAreaSqm).toBe("number");
    expectNoPrivateData(visibleDetail.body);

    for (const listingId of [...hiddenIds, 2_147_483_647]) {
      const response = await request(application).get(`/api/v1/listings/${listingId}`).expect(404);
      expect(response.body.error).toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found."
      });
      expect(response.body.error.details).toBeUndefined();
    }
  });

  it("combines q and areaName with AND, searches title/area only, and treats %, _, and backslash literally", async () => {
    const owner = await insertUser("LANDLORD", 10);
    const title = await insertListing({
      landlordId: owner,
      sequence: 10,
      title: "Needle title 100%",
      areaName: "District 1"
    });
    const area = await insertListing({
      landlordId: owner,
      sequence: 11,
      title: "Ordinary",
      areaName: "Needle _ \\ Ward"
    });
    await insertListing({
      landlordId: owner,
      sequence: 12,
      title: "Ordinary address",
      description: "NEEDLE_DESCRIPTION_ONLY",
      address: "NEEDLE_ADDRESS_ONLY",
      areaName: "Elsewhere"
    });
    const application = await makeApp();

    expectSameMembers(ids(await request(application).get("/api/v1/listings?q=needle").expect(200)), [title, area]);
    expect(
      ids(await request(application).get("/api/v1/listings?q=needle&areaName=district").expect(200))
    ).toStrictEqual([title]);
    expect(ids(await request(application).get("/api/v1/listings?q=NEEDLE_ADDRESS_ONLY").expect(200))).toStrictEqual([]);
    expect(ids(await request(application).get("/api/v1/listings?q=NEEDLE_DESCRIPTION_ONLY").expect(200))).toStrictEqual(
      []
    );
    expect(ids(await request(application).get("/api/v1/listings?q=%25").expect(200))).toStrictEqual([title]);
    expect(ids(await request(application).get("/api/v1/listings?q=_").expect(200))).toStrictEqual([area]);
    expect(ids(await request(application).get("/api/v1/listings?q=%5C").expect(200))).toStrictEqual([area]);
  });

  it("uses inclusive rent/area boundaries and supports one-sided and equal ranges", async () => {
    const owner = await insertUser("LANDLORD", 20);
    const below = await insertListing({ landlordId: owner, sequence: 20, rent: 3_000_000, area: 19 });
    const lower = await insertListing({ landlordId: owner, sequence: 21, rent: 4_000_000, area: 20 });
    const equal = await insertListing({ landlordId: owner, sequence: 22, rent: 5_000_000, area: 25 });
    const upper = await insertListing({ landlordId: owner, sequence: 23, rent: 6_000_000, area: 30 });
    const above = await insertListing({ landlordId: owner, sequence: 24, rent: 7_000_000, area: 31 });
    const application = await makeApp();

    expectSameMembers(ids(await request(application).get("/api/v1/listings?minMonthlyRent=4000000").expect(200)), [
      lower,
      equal,
      upper,
      above
    ]);
    expectSameMembers(ids(await request(application).get("/api/v1/listings?maxMonthlyRent=6000000").expect(200)), [
      below,
      lower,
      equal,
      upper
    ]);
    expect(
      ids(await request(application).get("/api/v1/listings?minMonthlyRent=5000000&maxMonthlyRent=5000000").expect(200))
    ).toStrictEqual([equal]);
    expectSameMembers(
      ids(await request(application).get("/api/v1/listings?minMonthlyRent=4000000&maxMonthlyRent=6000000").expect(200)),
      [lower, equal, upper]
    );
    expectSameMembers(ids(await request(application).get("/api/v1/listings?minRoomAreaSqm=20").expect(200)), [
      lower,
      equal,
      upper,
      above
    ]);
    expectSameMembers(ids(await request(application).get("/api/v1/listings?maxRoomAreaSqm=30").expect(200)), [
      below,
      lower,
      equal,
      upper
    ]);
    expect(
      ids(await request(application).get("/api/v1/listings?minRoomAreaSqm=25&maxRoomAreaSqm=25").expect(200))
    ).toStrictEqual([equal]);
    expectSameMembers(
      ids(await request(application).get("/api/v1/listings?minRoomAreaSqm=20&maxRoomAreaSqm=30").expect(200)),
      [lower, equal, upper]
    );
  });

  it("accepts and displays retired property/amenity codes while preserving ALL amenity semantics", async () => {
    const owner = await insertUser("LANDLORD", 30);
    const onlyWifi = await insertListing({ landlordId: owner, sequence: 30, amenities: ["WIFI"] });
    const both = await insertListing({ landlordId: owner, sequence: 31, amenities: ["WIFI", "PARKING"] });
    const extra = await insertListing({
      landlordId: owner,
      sequence: 32,
      amenities: ["WIFI", "PARKING", "ELEVATOR"]
    });
    await pool.query("UPDATE property_types SET is_active = false WHERE code = 'STUDIO'");
    await pool.query("UPDATE amenities SET is_active = false WHERE code = 'WIFI'");
    const application = await makeApp();

    const response = await request(application)
      .get("/api/v1/listings?propertyType=STUDIO&amenities=WIFI,PARKING")
      .expect(200);
    expectSameMembers(ids(response), [both, extra]);
    expect(ids(response)).not.toContain(onlyWifi);
    expect(
      response.body.data.every((item: { propertyType: { code: string } }) => item.propertyType.code === "STUDIO")
    ).toBe(true);
    expect(response.body.data.find((item: { id: number }) => item.id === extra).amenities).toStrictEqual([
      { code: "ELEVATOR", label: "Elevator" },
      { code: "PARKING", label: "Parking" },
      { code: "WIFI", label: "Wi-Fi" }
    ]);
    await request(application).get("/api/v1/listings?propertyType=UNKNOWN").expect(422);
    await request(application).get("/api/v1/listings?amenities=UNKNOWN").expect(422);
  });

  it("includes every bounds edge, excludes every outside edge, proves tied sorts, stable pages, and map/list equivalence", async () => {
    const owner = await insertUser("LANDLORD", 40);
    const tiedTime = "2026-08-02T00:00:00.000Z";
    const insideInputs = [
      [10.75, 106.65],
      [11, 106.65],
      [10, 106.65],
      [10.75, 107],
      [10.75, 106]
    ] as const;
    const insideIds: number[] = [];
    for (const [index, [latitude, longitude]] of insideInputs.entries()) {
      insideIds.push(
        await insertListing({
          landlordId: owner,
          sequence: 40 + index,
          areaName: "Equivalence",
          latitude,
          longitude,
          rent: 5_000_000,
          updatedAt: tiedTime
        })
      );
    }
    for (const [index, [latitude, longitude]] of [
      [11.000001, 106.65],
      [9.999999, 106.65],
      [10.75, 107.000001],
      [10.75, 105.999999]
    ].entries()) {
      await insertListing({
        landlordId: owner,
        sequence: 50 + index,
        areaName: "Outside",
        latitude,
        longitude,
        rent: 5_000_000,
        updatedAt: tiedTime
      });
    }
    const application = await makeApp();
    const bounds = "north=11&south=10&east=107&west=106&areaName=Equivalence";

    expect(ids(await request(application).get(`/api/v1/listings?${bounds}&sort=newest`).expect(200))).toStrictEqual(
      [...insideIds].reverse()
    );
    expect(ids(await request(application).get(`/api/v1/listings?${bounds}&sort=rent_asc`).expect(200))).toStrictEqual(
      insideIds
    );
    expect(ids(await request(application).get(`/api/v1/listings?${bounds}&sort=rent_desc`).expect(200))).toStrictEqual(
      [...insideIds].reverse()
    );

    const ordinary = await request(application).get("/api/v1/listings?areaName=Equivalence&sort=rent_asc").expect(200);
    const mapped = await request(application).get(`/api/v1/listings?${bounds}&sort=rent_asc`).expect(200);
    expect(mapped.body.data).toStrictEqual(ordinary.body.data);
    expect(mapped.body.data.every((item: { distanceKm?: unknown }) => item.distanceKm === undefined)).toBe(true);

    for (const prefix of ["areaName=Equivalence&sort=rent_asc", `${bounds}&sort=rent_asc`]) {
      const page1 = await request(application).get(`/api/v1/listings?${prefix}&pageSize=2`).expect(200);
      const page2 = await request(application).get(`/api/v1/listings?${prefix}&page=2&pageSize=2`).expect(200);
      const page3 = await request(application).get(`/api/v1/listings?${prefix}&page=3&pageSize=2`).expect(200);
      const repeat1 = await request(application).get(`/api/v1/listings?${prefix}&pageSize=2`).expect(200);
      const repeat2 = await request(application).get(`/api/v1/listings?${prefix}&page=2&pageSize=2`).expect(200);
      expect(ids(repeat1)).toStrictEqual(ids(page1));
      expect(ids(repeat2)).toStrictEqual(ids(page2));
      const all = [...ids(page1), ...ids(page2), ...ids(page3)];
      expect(new Set(all).size).toBe(insideIds.length);
      expectSameMembers(all, insideIds);
    }
  });

  it("returns hard-coded known Haversine distances, exact-coordinate calculations, radius ties, rounding, and stable radius pages", async () => {
    const owner = await insertUser("LANDLORD", 60);
    const sameA = await insertListing({
      landlordId: owner,
      sequence: 60,
      title: "Same point A",
      areaName: "Known",
      latitude: centerLat,
      longitude: centerLng
    });
    const sameB = await insertListing({
      landlordId: owner,
      sequence: 61,
      title: "Same point B",
      areaName: "Radius Page",
      latitude: centerLat,
      longitude: centerLng
    });
    const northward = await insertListing({
      landlordId: owner,
      sequence: 62,
      title: "Northward pair",
      areaName: "Known",
      latitude: 10.782341,
      longitude: centerLng
    });
    const diagonal = await insertListing({
      landlordId: owner,
      sequence: 63,
      title: "Diagonal pair",
      areaName: "Known",
      latitude: 10.82,
      longitude: 106.73
    });
    const exact = await insertListing({
      landlordId: owner,
      sequence: 64,
      title: "Exact coordinate",
      areaName: "Known",
      latitude: 10.772549,
      longitude: centerLng
    });
    const positiveDown = await insertListing({
      landlordId: owner,
      sequence: 65,
      title: "Positive down",
      areaName: "Rounding",
      latitude: 10.7724,
      longitude: 106.6974
    });
    const positiveUp = await insertListing({
      landlordId: owner,
      sequence: 66,
      title: "Positive up",
      areaName: "Rounding",
      latitude: 10.7725,
      longitude: 106.6975
    });
    const negativeDown = await insertListing({
      landlordId: owner,
      sequence: 67,
      title: "Negative down",
      areaName: "Rounding",
      latitude: -10.7724,
      longitude: -106.6974
    });
    const negativeTie = await insertListing({
      landlordId: owner,
      sequence: 68,
      title: "Negative tie",
      areaName: "Rounding",
      latitude: -10.7725,
      longitude: -106.6975
    });
    for (let sequence = 69; sequence <= 72; sequence += 1) {
      await insertListing({
        landlordId: owner,
        sequence,
        title: `Radius page ${sequence}`,
        areaName: "Radius Page",
        latitude: centerLat,
        longitude: centerLng
      });
    }
    const application = await makeApp();

    const same = await request(application)
      .get(`/api/v1/listings?centerLat=${centerLat}&centerLng=${centerLng}&radiusKm=1&q=Same point A`)
      .expect(200);
    expect(ids(same)).toStrictEqual([sameA]);
    expect(same.body.data[0].distanceKm).toBe(0);

    const north = await request(application)
      .get(`/api/v1/listings?centerLat=${centerLat}&centerLng=${centerLng}&radiusKm=5&q=Northward`)
      .expect(200);
    expect(ids(north)).toStrictEqual([northward]);
    expect(Math.abs(north.body.data[0].distanceKm - 1.111950802)).toBeLessThanOrEqual(0.000001);

    const diagonalResponse = await request(application)
      .get("/api/v1/listings?centerLat=10.76&centerLng=106.68&radiusKm=20&q=Diagonal")
      .expect(200);
    expect(ids(diagonalResponse)).toStrictEqual([diagonal]);
    expect(Math.abs(diagonalResponse.body.data[0].distanceKm - 8.622015836)).toBeLessThanOrEqual(0.000001);

    const exactResponse = await request(application)
      .get(`/api/v1/listings?centerLat=${centerLat}&centerLng=${centerLng}&radiusKm=1&q=Exact coordinate`)
      .expect(200);
    expect(ids(exactResponse)).toStrictEqual([exact]);
    expect(exactResponse.body.data[0]).toMatchObject({ latitude: 10.773, longitude: 106.698 });
    expect(Math.abs(exactResponse.body.data[0].distanceKm - 0.023128576688449833)).toBeLessThanOrEqual(0.000001);
    expect(Math.abs(exactResponse.body.data[0].distanceKm - 0.07390537762500268)).toBeGreaterThan(0.05);

    const rounding = await request(application).get("/api/v1/listings?areaName=Rounding&sort=rent_asc").expect(200);
    const rounded = new Map(
      (rounding.body.data as Array<{ id: number; latitude: number; longitude: number }>).map((item) => [item.id, item])
    );
    expect(rounded.get(positiveDown)).toMatchObject({ latitude: 10.772, longitude: 106.697 });
    expect(rounded.get(positiveUp)).toMatchObject({ latitude: 10.773, longitude: 106.698 });
    expect(rounded.get(negativeDown)).toMatchObject({ latitude: -10.772, longitude: -106.697 });
    expect(rounded.get(negativeTie)).toMatchObject({ latitude: -10.772, longitude: -106.697 });

    const radiusPrefix = `centerLat=${centerLat}&centerLng=${centerLng}&radiusKm=1&areaName=Radius%20Page&pageSize=2`;
    const pages = await Promise.all(
      [1, 2, 3].map((page) => request(application).get(`/api/v1/listings?${radiusPrefix}&page=${page}`).expect(200))
    );
    const repeated = await Promise.all(
      [1, 2, 3].map((page) => request(application).get(`/api/v1/listings?${radiusPrefix}&page=${page}`).expect(200))
    );
    expect(repeated.map(ids)).toStrictEqual(pages.map(ids));
    const radiusIds = pages.flatMap(ids);
    expect(radiusIds).toStrictEqual([sameB, ...Array.from({ length: 4 }, (_value, index) => sameB + index + 8)]);
    expect(new Set(radiusIds).size).toBe(5);
    expect(pages.flatMap((page) => page.body.data).every((item: { distanceKm: number }) => item.distanceKm === 0)).toBe(
      true
    );
  });

  it("proves the complete V1-09 query-count matrix, limit-plus-one, no total, and constant 1/5/10-row SQL counts", async () => {
    const owner = await insertUser("LANDLORD", 80);
    for (let sequence = 80; sequence < 90; sequence += 1) {
      await insertListing({
        landlordId: owner,
        sequence,
        areaName: "Query Count",
        latitude: centerLat,
        longitude: centerLng,
        amenities: ["WIFI"]
      });
    }

    async function counted(query: string, expectedStatus = 200) {
      const executor = new CountingExecutor(realExecutor);
      const response = await request(await makeApp(executor))
        .get(`/api/v1/listings${query.length === 0 ? "" : `?${query}`}`)
        .expect(expectedStatus);
      return { executor, response };
    }

    const modes = [
      "areaName=Query%20Count",
      "north=11&south=10&east=107&west=106&areaName=Query%20Count",
      `centerLat=${centerLat}&centerLng=${centerLng}&radiusKm=1&areaName=Query%20Count`
    ] as const;
    for (const mode of modes) {
      const plain = await counted(mode);
      expect(plain.executor.queries).toHaveLength(1);
      expect(plain.executor.queries[0]!.text).not.toMatch(/COUNT\s*\(/i);
      expect(plain.response.body.pagination).toStrictEqual({ page: 1, pageSize: 20, hasNextPage: false });
      expect(plain.response.body.pagination).not.toHaveProperty("total");

      const controlled = await counted(`${mode}&propertyType=STUDIO&amenities=WIFI`);
      expect(controlled.executor.queries).toHaveLength(2);
      expect(controlled.executor.queries.filter((query) => query.text.includes("page_candidates"))).toHaveLength(1);
    }

    for (const pageSize of [1, 5, 10]) {
      const plain = await counted(`areaName=Query%20Count&pageSize=${pageSize}`);
      expect(plain.response.body.data).toHaveLength(pageSize);
      expect(plain.executor.queries).toHaveLength(1);
      const controlled = await counted(`areaName=Query%20Count&pageSize=${pageSize}&amenities=WIFI`);
      expect(controlled.response.body.data).toHaveLength(pageSize);
      expect(controlled.executor.queries).toHaveLength(2);
    }

    for (const unknown of ["propertyType=UNKNOWN", "amenities=UNKNOWN"]) {
      const checked = await counted(unknown, 422);
      expect(checked.executor.queries).toHaveLength(1);
      expect(checked.executor.queries[0]!.text).toContain("SELECT 'property_type' AS kind");
      expect(checked.executor.queries.some((query) => query.text.includes("page_candidates"))).toBe(false);
    }

    for (const invalid of [
      "north=11",
      `centerLat=${hcmc.south - 0.000001}&centerLng=${centerLng}&radiusKm=1`,
      `centerLat=${centerLat}&centerLng=${centerLng}&radiusKm=50.001`
    ]) {
      const checked = await counted(invalid, 422);
      expect(checked.executor.queries).toHaveLength(0);
    }

    for (const radius of [49.999, 50]) {
      const checked = await counted(`centerLat=${centerLat}&centerLng=${centerLng}&radiusKm=${radius}`);
      expect(checked.executor.queries).toHaveLength(1);
    }
  });

  it("keeps collection/detail sentinels private and enriches only active-tenant detail without a third query", async () => {
    const owner = await insertUser("LANDLORD", 1);
    const tenant = await insertUser("TENANT", 91);
    const landlord = await insertUser("LANDLORD", 92);
    const admin = await insertUser("ADMIN", 93);
    const listingId = await insertListing({
      landlordId: owner,
      sequence: 1,
      latitude: 10.772549,
      longitude: 106.697912,
      amenities: ["WIFI"]
    });
    await pool.query({
      text: `INSERT INTO moderation_history
        (listing_id, admin_id, previous_status, new_status, reason)
        VALUES ($1, $2, 'PENDING', 'APPROVED', $3)`,
      values: [listingId, admin, privateSentinels.moderation]
    });

    for (const query of [
      "",
      "?north=11&south=10&east=107&west=106",
      `?centerLat=${centerLat}&centerLng=${centerLng}&radiusKm=1`
    ]) {
      const response = await request(await makeApp())
        .get(`/api/v1/listings${query}`)
        .set("Cookie", await session(tenant, "TENANT"))
        .expect(200);
      expectNoPrivateData(response.body);
    }

    for (const [role, userId] of [
      ["LANDLORD", landlord],
      ["LANDLORD", owner],
      ["ADMIN", admin]
    ] as const) {
      const executor = new CountingExecutor(realExecutor);
      const response = await request(await makeApp(executor))
        .get(`/api/v1/listings/${listingId}`)
        .set("Cookie", await session(userId, role))
        .expect(200);
      expect(response.body.data).not.toHaveProperty("landlordContact");
      expect(executor.queries).toHaveLength(2);
      expectNoPrivateData(response.body);
    }

    const tenantExecutor = new CountingExecutor(realExecutor);
    const tenantResponse = await request(await makeApp(tenantExecutor))
      .get(`/api/v1/listings/${listingId}`)
      .set("Cookie", await session(tenant, "TENANT"))
      .expect(200);
    expect(tenantResponse.body.data.landlordContact).toStrictEqual({
      email: "rm038.landlord.1@example.com",
      phone: "+849400000001"
    });
    expect(Object.keys(tenantResponse.body.data.landlordContact).sort()).toStrictEqual(["email", "phone"]);
    expect(tenantExecutor.queries).toHaveLength(2);
    expect(tenantExecutor.queries[1]!.text).toMatch(/landlord\.email AS landlord_email/);
    const withoutContact = {
      ...tenantResponse.body,
      data: { ...tenantResponse.body.data, landlordContact: undefined }
    };
    expectNoPrivateData(withoutContact);
  });
});
