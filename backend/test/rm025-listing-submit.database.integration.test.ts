import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPhase4DatabaseFixture,
  expectExactKeys,
  ownerDetailKeys,
  phase4Origin,
  type Phase4DatabaseFixture
} from "./helpers/listings-phase4-fixture.js";

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const originalTimestamp = "2026-01-01T00:00:00.000Z";
let fixture: Phase4DatabaseFixture;
let sequence = 0;

interface ListingOptions {
  readonly status?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN" | "INACTIVE";
  readonly complete?: boolean;
  readonly propertyCode?: string;
}

async function insertListing(landlordId: number, options: ListingOptions = {}): Promise<number> {
  const complete = options.complete ?? true;
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude, updated_at
      )
      VALUES (
        $1,
        CASE WHEN $3::boolean THEN (SELECT id FROM property_types WHERE code = $4) ELSE NULL END,
        $2::listing_status,
        CASE WHEN $3::boolean THEN 'RM-025 listing' ELSE NULL END,
        CASE WHEN $3::boolean THEN 'Complete listing for submission' ELSE NULL END,
        CASE WHEN $3::boolean THEN 5000000 ELSE NULL END,
        CASE WHEN $3::boolean THEN 25.50 ELSE NULL END,
        CASE WHEN $3::boolean THEN 'Private address' ELSE NULL END,
        CASE WHEN $3::boolean THEN 'District' ELSE NULL END,
        CASE WHEN $3::boolean THEN 10.75 ELSE NULL END,
        CASE WHEN $3::boolean THEN 106.67 ELSE NULL END,
        $5::timestamptz
      )
      RETURNING id
    `,
    values: [landlordId, options.status ?? "DRAFT", complete, options.propertyCode ?? "STUDIO", originalTimestamp]
  });
  return result.rows[0]!.id;
}

async function insertImage(listingId: number): Promise<void> {
  sequence += 1;
  await fixture.pool.query({
    text: `
      INSERT INTO listing_images (
        listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order
      )
      VALUES ($1, $2, $3, 'webp', 800, 600, 1234, 1)
    `,
    values: [listingId, `rm025/test-${sequence}`, `https://example.test/rm025-${sequence}.webp`]
  });
}

async function associateAmenity(listingId: number, code: string): Promise<void> {
  await fixture.pool.query({
    text: `INSERT INTO listing_amenities (listing_id, amenity_id) SELECT $1, id FROM amenities WHERE code = $2`,
    values: [listingId, code]
  });
}

async function listingState(listingId: number): Promise<{ status: string; updated_at: Date }> {
  const result = await fixture.pool.query<{ status: string; updated_at: Date }>({
    text: `SELECT status, updated_at FROM listings WHERE id = $1`,
    values: [listingId]
  });
  return result.rows[0]!;
}

async function submit(
  app: Awaited<ReturnType<Phase4DatabaseFixture["createApp"]>>,
  landlordId: number,
  listingId: number,
  expectedStatus: number
) {
  return request(app.app)
    .post(`/api/v1/landlord/listings/${listingId}/submit`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${await fixture.signToken(landlordId)}`)
    .expect(expectedStatus);
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

describe("RM-025 listing submit PostgreSQL integration", () => {
  it("submits a complete draft with an image and an empty amenity set in seven bounded queries", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId);
    await insertImage(listingId);
    const app = await fixture.createApp();
    const response = await submit(app, landlordId, listingId, 200);

    expectExactKeys(response.body.data, ownerDetailKeys);
    expect(response.body.data).toMatchObject({
      id: listingId,
      status: "PENDING",
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [],
      currentModerationReason: null
    });
    expect(response.body.data.images).toHaveLength(1);
    const state = await listingState(listingId);
    expect(state.status).toBe("PENDING");
    expect(state.updated_at.toISOString()).not.toBe(originalTimestamp);
    expect(await fixture.tableCount("moderation_history")).toBe(0);
    expect(app.faultState.statements).toHaveLength(7);
    expect(app.faultState.statements[0]!.text).toContain("FOR UPDATE OF l");
    expect(app.faultState.statements[1]!.text).toContain("NOT EXISTS");
    expect(app.faultState.statements[2]!.text).toContain("SELECT EXISTS");
    expect(app.faultState.statements.filter((statement) => statement.text.includes("UPDATE listings"))).toHaveLength(1);
    expect(app.faultState.statements.some((statement) => /moderation_history/i.test(statement.text))).toBe(false);
  });

  it("retains known retired property and amenity associations", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    await fixture.pool.query(`UPDATE property_types SET is_active = false WHERE code = 'STUDIO'`);
    await fixture.pool.query(`UPDATE amenities SET is_active = false WHERE code = 'WIFI'`);
    const listingId = await insertListing(landlordId);
    await associateAmenity(listingId, "WIFI");
    await insertImage(listingId);
    const response = await submit(await fixture.createApp(), landlordId, listingId, 200);
    expect(response.body.data.propertyType).toStrictEqual({ code: "STUDIO", label: "Studio" });
    expect(response.body.data.amenities).toStrictEqual([{ code: "WIFI", label: "Wi-Fi" }]);
    expect(await fixture.tableCount("listing_amenities")).toBe(1);
  });

  it("submits HIDDEN without change proof, preserves history, and projects no current reason", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertListing(landlordId, { status: "HIDDEN" });
    await insertImage(listingId);
    await fixture.pool.query({
      text: `INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status, reason) VALUES ($1, $2, 'APPROVED', 'HIDDEN', 'Hidden for review')`,
      values: [listingId, adminId]
    });
    const before = await fixture.stateSnapshot();
    const app = await fixture.createApp();
    const response = await submit(app, landlordId, listingId, 200);
    const after = await fixture.stateSnapshot();
    expect(response.body.data).toMatchObject({ status: "PENDING", currentModerationReason: null });
    expect(after.moderation_history).toStrictEqual(before.moderation_history);
    expect(after.listing_images).toStrictEqual(before.listing_images);
    expect(app.faultState.statements.filter((statement) => statement.text.includes("UPDATE listings"))).toHaveLength(1);
  });

  it("rejects incomplete content and a missing image without changing status or timestamp", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const incompleteId = await insertListing(landlordId, { complete: false });
    await insertImage(incompleteId);
    const incomplete = await submit(await fixture.createApp(), landlordId, incompleteId, 422);
    expect(incomplete.body.error.details[0]).toMatchObject({ field: "propertyType", code: "REQUIRED" });
    expect(incomplete.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "latitude", code: "REQUIRED" }),
        expect.objectContaining({ field: "longitude", code: "REQUIRED" })
      ])
    );
    expect(await listingState(incompleteId)).toMatchObject({ status: "DRAFT" });
    expect((await listingState(incompleteId)).updated_at.toISOString()).toBe(originalTimestamp);

    const noImageId = await insertListing(landlordId);
    const noImage = await submit(await fixture.createApp(), landlordId, noImageId, 422);
    expect(noImage.body.error.details[0]).toMatchObject({ field: "images", code: "REQUIRED" });
    expect((await listingState(noImageId)).updated_at.toISOString()).toBe(originalTimestamp);
  });

  it.each(["PENDING", "APPROVED", "REJECTED", "INACTIVE"] as const)(
    "rejects %s before amenity/image checks",
    async (status) => {
      const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
      const listingId = await insertListing(landlordId, { status });
      await insertImage(listingId);
      const app = await fixture.createApp();
      const response = await submit(app, landlordId, listingId, 409);
      expect(response.body.error.code).toBe("INVALID_LISTING_TRANSITION");
      expect(app.faultState.statements).toHaveLength(1);
      expect((await listingState(listingId)).updated_at.toISOString()).toBe(originalTimestamp);
    }
  );

  it("uses an owner-safe 404 and makes repeated submission a transition conflict", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const otherId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId);
    await insertImage(listingId);
    const app = await fixture.createApp();
    const other = await submit(app, otherId, listingId, 404);
    const missing = await submit(app, ownerId, 2_147_483_647, 404);
    expect(other.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(missing.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(other.body.error.requestId).not.toBe(missing.body.error.requestId);
    await submit(app, ownerId, listingId, 200);
    const firstTimestamp = (await listingState(listingId)).updated_at.toISOString();
    const repeated = await submit(app, ownerId, listingId, 409);
    expect(repeated.body.error.code).toBe("INVALID_LISTING_TRANSITION");
    expect((await listingState(listingId)).updated_at.toISOString()).toBe(firstTimestamp);
  });

  it("rolls back a stale conditional result and a final-detail failure", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const staleId = await insertListing(landlordId);
    await insertImage(staleId);
    const staleApp = await fixture.createApp({ fault: "conditional-update" });
    const stale = await submit(staleApp, landlordId, staleId, 409);
    expect(stale.body.error.code).toBe("CONCURRENT_MODIFICATION");
    expect(await listingState(staleId)).toMatchObject({ status: "DRAFT" });
    expect((await listingState(staleId)).updated_at.toISOString()).toBe(originalTimestamp);

    const detailId = await insertListing(landlordId);
    await associateAmenity(detailId, "WIFI");
    await insertImage(detailId);
    const before = await fixture.stateSnapshot();
    const detailApp = await fixture.createApp({ fault: "detail-read" });
    await submit(detailApp, landlordId, detailId, 500);
    const after = await fixture.stateSnapshot();
    expect(after.listings).toStrictEqual(before.listings);
    expect(after.listing_amenities).toStrictEqual(before.listing_amenities);
    expect(after.listing_images).toStrictEqual(before.listing_images);
    expect(after.moderation_history).toStrictEqual(before.moderation_history);
    expect(detailApp.faultState.statements).toHaveLength(5);
  });
});
