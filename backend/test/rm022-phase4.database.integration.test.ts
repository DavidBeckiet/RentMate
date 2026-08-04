import path from "node:path";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Phase4DatabaseFixture } from "./helpers/listings-phase4-fixture.js";
import {
  createPhase4DatabaseFixture,
  expectExactKeys,
  ownerDetailKeys,
  ownerImageKeys,
  ownerSummaryKeys,
  phase4Origin
} from "./helpers/listings-phase4-fixture.js";

const migrationDirectory = path.resolve(process.cwd(), "migrations");
const lookupKeys = ["code", "label"] as const;
const paginationKeys = ["page", "pageSize", "hasNextPage"] as const;

let fixture: Phase4DatabaseFixture;

function postDraft(app: Express, token: string, body: object) {
  return request(app)
    .post("/api/v1/landlord/listings")
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`)
    .send(body);
}

function ownerGet(app: Express, token: string, path: string) {
  return request(app).get(path).set("Cookie", `rentmate_session=${token}`);
}

function expectNoSessionCookie(response: request.Response): void {
  expect(response.headers["set-cookie"]).toBeUndefined();
}

function expectLookupResponse(body: unknown): asserts body is { data: Array<{ code: string; label: string }> } {
  expectExactKeys(body, ["data"]);
  const data = (body as { data: unknown }).data;
  expect(Array.isArray(data)).toBe(true);
  for (const item of data as unknown[]) expectExactKeys(item, lookupKeys);
}

function expectDetailShape(detail: unknown): void {
  expectExactKeys(detail, ownerDetailKeys);
  const typed = detail as {
    propertyType: unknown;
    amenities: unknown[];
    images: unknown[];
  };
  if (typed.propertyType !== null) expectExactKeys(typed.propertyType, lookupKeys);
  for (const amenity of typed.amenities) expectExactKeys(amenity, lookupKeys);
  for (const image of typed.images) expectExactKeys(image, ownerImageKeys);
}

function expectCollectionShape(body: unknown): void {
  expectExactKeys(body, ["data", "pagination"]);
  const typed = body as { data: unknown[]; pagination: unknown };
  expectExactKeys(typed.pagination, paginationKeys);
  for (const summary of typed.data) {
    expectExactKeys(summary, ownerSummaryKeys);
    const value = summary as { propertyType: unknown; coverImage: unknown };
    if (value.propertyType !== null) expectExactKeys(value.propertyType, lookupKeys);
    if (value.coverImage !== null) expectExactKeys(value.coverImage, ownerImageKeys);
  }
}

function expectNoInternalProjection(value: unknown): void {
  expect(JSON.stringify(value)).not.toMatch(
    /landlordId|landlord_id|propertyTypeId|property_type_id|amenityIds|amenity_id|listingId|listing_id|cloudinaryPublicId|cloudinary_public_id|secureUrl|secure_url|isActive|is_active|passwordHash|password_hash|JWT|cookie|SELECT |INSERT |UPDATE |DELETE |stack|raw row/i
  );
}

function completeDraftBody(title: string, propertyTypeCode = "STUDIO", amenityCodes: string[] = ["WIFI", "FURNISHED"]) {
  return {
    title,
    description: `${title} private description`,
    monthlyRent: 7_500_000,
    propertyTypeCode,
    roomAreaSqm: 28.5,
    addressText: `${title} exact address`,
    areaName: "District 1",
    latitude: 10.772341,
    longitude: 106.697912,
    amenityCodes
  };
}

async function insertImage(listingId: number, displayOrder: number, sequence: number): Promise<number> {
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listing_images (
        listing_id, cloudinary_public_id, secure_url, format, width, height,
        byte_size, display_order, alt_text
      )
      VALUES ($1, $2, $3, 'webp', 800, 600, 12345, $4, $5)
      RETURNING id
    `,
    values: [
      listingId,
      `rm022-private-provider-${sequence}`,
      `https://cdn.example.test/rm022-${sequence}.webp`,
      displayOrder,
      `Image ${sequence}`
    ]
  });
  return result.rows[0]!.id;
}

beforeAll(async () => {
  fixture = createPhase4DatabaseFixture(migrationDirectory);
  await fixture.rebuildSchema();
});

beforeEach(async () => {
  await fixture.resetData();
});

afterAll(async () => {
  await fixture.dropSchema();
  await fixture.close();
});

describe("RM-022 Phase 4 PostgreSQL cross-flow verification", () => {
  it("Journey A keeps one empty nullable draft identical across create, collection, and detail", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", 1);
    const token = await fixture.signToken(landlordId);
    const { app } = await fixture.createApp();

    const created = await postDraft(app, token, {}).expect(201);
    expectExactKeys(created.body, ["data"]);
    expectDetailShape(created.body.data);
    expect(created.body.data).toMatchObject({
      status: "DRAFT",
      title: null,
      description: null,
      monthlyRent: null,
      roomAreaSqm: null,
      addressText: null,
      areaName: null,
      latitude: null,
      longitude: null,
      propertyType: null,
      amenities: [],
      images: [],
      currentModerationReason: null
    });

    const listingId = created.body.data.id as number;
    const collection = await ownerGet(app, token, "/api/v1/landlord/listings").expect(200);
    expectCollectionShape(collection.body);
    expect(collection.body.data).toStrictEqual([
      {
        id: listingId,
        status: "DRAFT",
        title: null,
        monthlyRent: null,
        areaName: null,
        propertyType: null,
        coverImage: null,
        currentModerationReason: null,
        updatedAt: created.body.data.updatedAt
      }
    ]);

    const detail = await ownerGet(app, token, `/api/v1/landlord/listings/${listingId}`).expect(200);
    expectExactKeys(detail.body, ["data"]);
    expectDetailShape(detail.body.data);
    expect(detail.body.data).toStrictEqual(created.body.data);
    expect(await fixture.tableCount("listings")).toBe(1);
    expect(await fixture.tableCount("listing_amenities")).toBe(0);
    for (const response of [created, collection, detail]) expectNoSessionCookie(response);
  });

  it("Journey B selects active public codes and preserves the complete private owner aggregate", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", 2);
    const token = await fixture.signToken(landlordId);
    const { app } = await fixture.createApp();

    const propertyTypes = await request(app).get("/api/v1/lookups/property-types").expect(200);
    const amenities = await request(app).get("/api/v1/lookups/amenities").expect(200);
    expectLookupResponse(propertyTypes.body);
    expectLookupResponse(amenities.body);
    const selectedProperty = propertyTypes.body.data[0]!;
    const selectedAmenities = amenities.body.data.slice(0, 2);

    const body = completeDraftBody(
      "Complete active-code draft",
      selectedProperty.code,
      selectedAmenities.map(({ code }) => code)
    );
    const created = await postDraft(app, token, body).expect(201);
    expectDetailShape(created.body.data);
    expect(created.body.data.propertyType).toStrictEqual(selectedProperty);
    const expectedAmenities = [...selectedAmenities].sort(
      (left, right) => left.label.localeCompare(right.label) || left.code.localeCompare(right.code)
    );
    expect(created.body.data.amenities).toStrictEqual(expectedAmenities);
    expect(created.body.data.images).toStrictEqual([]);

    const listingId = created.body.data.id as number;
    const collection = await ownerGet(app, token, "/api/v1/landlord/listings").expect(200);
    const detail = await ownerGet(app, token, `/api/v1/landlord/listings/${listingId}`).expect(200);
    expectCollectionShape(collection.body);
    expectDetailShape(detail.body.data);
    expectExactKeys(collection.body.data[0], ownerSummaryKeys);
    expect(detail.body.data).toMatchObject({
      addressText: body.addressText,
      latitude: body.latitude,
      longitude: body.longitude,
      propertyType: selectedProperty,
      amenities: expectedAmenities,
      images: []
    });
    expect(collection.body.data[0].id).toBe(listingId);
    expectNoInternalProjection({ propertyTypes: propertyTypes.body, amenities: amenities.body, created: created.body });
    expectNoInternalProjection({ collection: collection.body, detail: detail.body });
  });

  it("Journey C omits retired values publicly while retaining existing owner associations", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", 3);
    const token = await fixture.signToken(landlordId);
    const { app } = await fixture.createApp();
    const propertyTypes = await request(app).get("/api/v1/lookups/property-types").expect(200);
    const amenities = await request(app).get("/api/v1/lookups/amenities").expect(200);
    const selectedProperty = propertyTypes.body.data.find(({ code }: { code: string }) => code === "STUDIO")!;
    const selectedAmenity = amenities.body.data.find(({ code }: { code: string }) => code === "WIFI")!;
    const created = await postDraft(
      app,
      token,
      completeDraftBody("Retirement journey", selectedProperty.code, [selectedAmenity.code])
    ).expect(201);
    const listingId = created.body.data.id as number;

    try {
      await fixture.pool.query("UPDATE property_types SET is_active = false WHERE code = 'STUDIO'");
      await fixture.pool.query("UPDATE amenities SET is_active = false WHERE code = 'WIFI'");
      const retiredRows = await fixture.pool.query<{ table_name: string; code: string; is_active: boolean }>({
        text: `
          SELECT 'property_types' AS table_name, code, is_active FROM property_types WHERE code = 'STUDIO'
          UNION ALL
          SELECT 'amenities' AS table_name, code, is_active FROM amenities WHERE code = 'WIFI'
          ORDER BY table_name
        `,
        values: []
      });
      expect(retiredRows.rows).toStrictEqual([
        { table_name: "amenities", code: "WIFI", is_active: false },
        { table_name: "property_types", code: "STUDIO", is_active: false }
      ]);

      const currentPropertyTypes = await request(app).get("/api/v1/lookups/property-types").expect(200);
      const currentAmenities = await request(app).get("/api/v1/lookups/amenities").expect(200);
      expectLookupResponse(currentPropertyTypes.body);
      expectLookupResponse(currentAmenities.body);
      expect(currentPropertyTypes.body.data).not.toContainEqual(selectedProperty);
      expect(currentAmenities.body.data).not.toContainEqual(selectedAmenity);
      expect(currentPropertyTypes.body.data.length).toBeGreaterThan(0);
      expect(currentAmenities.body.data.length).toBeGreaterThan(0);

      const collection = await ownerGet(app, token, "/api/v1/landlord/listings").expect(200);
      const detail = await ownerGet(app, token, `/api/v1/landlord/listings/${listingId}`).expect(200);
      expect(collection.body.data[0].propertyType).toStrictEqual(selectedProperty);
      expect(detail.body.data.propertyType).toStrictEqual(selectedProperty);
      expect(detail.body.data.amenities).toContainEqual(selectedAmenity);

      const beforeListings = await fixture.tableCount("listings");
      const beforeJunctions = await fixture.tableCount("listing_amenities");
      for (const unavailableBody of [
        { propertyTypeCode: selectedProperty.code },
        { amenityCodes: [selectedAmenity.code] }
      ]) {
        const response = await postDraft(app, token, unavailableBody).expect(422);
        expect(response.body.error.code).toBe("VALIDATION_FAILED");
        expect(JSON.stringify(response.body)).not.toMatch(/property_type_id|amenity_id|is_active|SELECT |stack/i);
      }
      expect(await fixture.tableCount("listings")).toBe(beforeListings);
      expect(await fixture.tableCount("listing_amenities")).toBe(beforeJunctions);
    } finally {
      await fixture.pool.query("UPDATE property_types SET is_active = true WHERE code = 'STUDIO'");
      await fixture.pool.query("UPDATE amenities SET is_active = true WHERE code = 'WIFI'");
    }
  });

  it.each(["junction", "mapping"] as const)(
    "Journey D keeps a failed %s aggregate invisible after real rollback",
    async (fault) => {
      const landlordId = await fixture.insertUser("LANDLORD", fault === "junction" ? 4 : 5);
      const token = await fixture.signToken(landlordId);
      const failing = await fixture.createApp({ fault });
      const before = await fixture.stateSnapshot();
      const response = await postDraft(failing.app, token, completeDraftBody(`Failed ${fault}`)).expect(500);

      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expectNoSessionCookie(response);
      expect(failing.faultState.attemptedListingId).toEqual(expect.any(Number));
      expect(JSON.stringify(response.body)).not.toMatch(
        /synthetic|junction|mapping|private SQL|constraint|RETURNING|raw row|stack/i
      );
      expect(failing.faultState.statements.some((statement) => statement.text.includes("INSERT INTO listings"))).toBe(
        true
      );
      expect(failing.faultState.statements.some((statement) => /\bDELETE\b/i.test(statement.text))).toBe(false);

      const normal = await fixture.createApp();
      const collection = await ownerGet(normal.app, token, "/api/v1/landlord/listings").expect(200);
      expect(collection.body.data).toStrictEqual([]);
      const detail = await ownerGet(
        normal.app,
        token,
        `/api/v1/landlord/listings/${failing.faultState.attemptedListingId}`
      ).expect(404);
      expect(detail.body.error).toMatchObject({
        code: "RESOURCE_NOT_FOUND",
        message: "The requested resource was not found."
      });
      expect(await fixture.stateSnapshot()).toStrictEqual(before);
    }
  );

  it("Journey E prevents cross-owner disclosure for an endpoint-created private draft", async () => {
    const ownerA = await fixture.insertUser("LANDLORD", 6);
    const ownerB = await fixture.insertUser("LANDLORD", 7);
    const tokenA = await fixture.signToken(ownerA);
    const tokenB = await fixture.signToken(ownerB);
    const { app } = await fixture.createApp();
    const privateBody = completeDraftBody("Owner A private title", "STUDIO", ["WIFI"]);
    const created = await postDraft(app, tokenA, privateBody).expect(201);
    const listingId = created.body.data.id as number;

    const ownerACollection = await ownerGet(app, tokenA, "/api/v1/landlord/listings").expect(200);
    const ownerADetail = await ownerGet(app, tokenA, `/api/v1/landlord/listings/${listingId}`).expect(200);
    expect(ownerACollection.body.data.map(({ id }: { id: number }) => id)).toContain(listingId);
    expect(ownerADetail.body.data).toMatchObject({
      title: privateBody.title,
      description: privateBody.description,
      addressText: privateBody.addressText,
      latitude: privateBody.latitude,
      longitude: privateBody.longitude
    });

    const ownerBCollection = await ownerGet(app, tokenB, "/api/v1/landlord/listings").expect(200);
    expect(ownerBCollection.body.data).toStrictEqual([]);
    const nonOwner = await ownerGet(app, tokenB, `/api/v1/landlord/listings/${listingId}`).expect(404);
    const missing = await ownerGet(app, tokenB, "/api/v1/landlord/listings/2147483647").expect(404);
    const stableError = (response: request.Response) => ({
      status: response.status,
      body: {
        error: {
          ...response.body.error,
          requestId: "<request-id>"
        }
      }
    });
    expectExactKeys(nonOwner.body, ["error"]);
    expectExactKeys(nonOwner.body.error, ["code", "message", "requestId"]);
    expect(stableError(nonOwner)).toStrictEqual(stableError(missing));
    expect(nonOwner.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    const stableSerialized = JSON.stringify(stableError(nonOwner));
    expect(stableSerialized).not.toContain(String(listingId));
    for (const privateValue of [
      privateBody.title,
      privateBody.description,
      privateBody.addressText,
      privateBody.areaName,
      String(privateBody.latitude),
      String(privateBody.longitude),
      privateBody.propertyTypeCode,
      privateBody.amenityCodes[0]!
    ]) {
      expect(stableSerialized).not.toContain(privateValue);
    }
  });

  it("Journey F applies stable pagination and one collection query across cardinalities", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", 8);
    const adminId = await fixture.insertUser("ADMIN", 9);
    const token = await fixture.signToken(landlordId);
    const appFixture = await fixture.createApp();
    const ids: number[] = [];
    for (let index = 1; index <= 4; index += 1) {
      const response = await postDraft(
        appFixture.app,
        token,
        completeDraftBody(`Pagination ${index}`, "STUDIO", ["WIFI", "FURNISHED"])
      ).expect(201);
      ids.push(response.body.data.id as number);
    }

    const latest = new Date("2026-08-04T10:00:00.000Z");
    const middle = new Date("2026-08-04T09:00:00.000Z");
    const oldest = new Date("2026-08-04T08:00:00.000Z");
    await fixture.pool.query("UPDATE listings SET updated_at = $2 WHERE id = $1", [ids[0], oldest]);
    await fixture.pool.query("UPDATE listings SET updated_at = $2 WHERE id = $1", [ids[1], latest]);
    await fixture.pool.query("UPDATE listings SET updated_at = $2 WHERE id = $1", [ids[2], latest]);
    await fixture.pool.query("UPDATE listings SET updated_at = $2, status = 'REJECTED' WHERE id = $1", [
      ids[3],
      middle
    ]);
    await insertImage(ids[1]!, 2, 21);
    await insertImage(ids[1]!, 1, 22);
    await insertImage(ids[2]!, 1, 23);
    await fixture.pool.query(
      `
        INSERT INTO moderation_history (
          listing_id, admin_id, previous_status, new_status, reason, created_at
        )
        VALUES
          ($1, $2, 'PENDING', 'REJECTED', 'Older pagination reason', $3),
          ($1, $2, 'PENDING', 'REJECTED', 'Current pagination reason', $4)
      `,
      [ids[3], adminId, new Date("2026-08-04T09:01:00.000Z"), new Date("2026-08-04T09:02:00.000Z")]
    );
    const beforeReads = await fixture.stateSnapshot();

    const getPage = async (page: number) => {
      appFixture.resetOwnerReads();
      const response = await ownerGet(
        appFixture.app,
        token,
        `/api/v1/landlord/listings?page=${page}&pageSize=2`
      ).expect(200);
      expect(appFixture.ownerReads).toStrictEqual(["collection"]);
      expectCollectionShape(response.body);
      expect(response.body.pagination).toMatchObject({ page, pageSize: 2 });
      expect(response.body.pagination).not.toHaveProperty("totalCount");
      return response;
    };

    const pageOne = await getPage(1);
    expect(pageOne.body.data.map(({ id }: { id: number }) => id)).toStrictEqual([ids[2], ids[1]]);
    expect(pageOne.body.pagination.hasNextPage).toBe(true);
    expectExactKeys(pageOne.body.data[0].coverImage, ownerImageKeys);

    const pageTwo = await getPage(2);
    expect(pageTwo.body.data.map(({ id }: { id: number }) => id)).toStrictEqual([ids[3], ids[0]]);
    expect(pageTwo.body.data[0].currentModerationReason).toBe("Current pagination reason");
    expect(pageTwo.body.pagination.hasNextPage).toBe(false);

    const pageThree = await getPage(3);
    expect(pageThree.body.data).toStrictEqual([]);
    expect(pageThree.body.pagination.hasNextPage).toBe(false);

    appFixture.resetOwnerReads();
    const filtered = await ownerGet(
      appFixture.app,
      token,
      "/api/v1/landlord/listings?status=draft&pageSize=100"
    ).expect(200);
    expect(appFixture.ownerReads).toStrictEqual(["collection"]);
    expect(filtered.body.data.map(({ id }: { id: number }) => id)).toStrictEqual([ids[2], ids[1], ids[0]]);
    expect(filtered.body.data.every(({ status }: { status: string }) => status === "DRAFT")).toBe(true);
    expect(await fixture.stateSnapshot()).toStrictEqual(beforeReads);
  });
});
