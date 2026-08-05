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

type Action = "deactivate" | "reactivate";

async function insertListing(landlordId: number, status: string): Promise<number> {
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude, updated_at
      )
      VALUES (
        $1, (SELECT id FROM property_types WHERE code = 'STUDIO'), $2::listing_status,
        'RM-026 listing', 'Availability lifecycle listing', 5000000,
        25.50, 'Private address', 'District', 10.75, 106.67, $3::timestamptz
      )
      RETURNING id
    `,
    values: [landlordId, status, originalTimestamp]
  });
  return result.rows[0]!.id;
}

async function addAssociations(listingId: number): Promise<void> {
  sequence += 1;
  await fixture.pool.query({
    text: `INSERT INTO listing_amenities (listing_id, amenity_id) SELECT $1, id FROM amenities WHERE code = 'WIFI'`,
    values: [listingId]
  });
  await fixture.pool.query({
    text: `
      INSERT INTO listing_images (
        listing_id, cloudinary_public_id, secure_url, format, width, height, byte_size, display_order
      )
      VALUES ($1, $2, $3, 'webp', 800, 600, 1234, 1)
    `,
    values: [listingId, `rm026/test-${sequence}`, `https://example.test/rm026-${sequence}.webp`]
  });
}

async function listingState(listingId: number): Promise<{ status: string; updated_at: Date }> {
  const result = await fixture.pool.query<{ status: string; updated_at: Date }>({
    text: `SELECT status, updated_at FROM listings WHERE id = $1`,
    values: [listingId]
  });
  return result.rows[0]!;
}

async function act(
  app: Awaited<ReturnType<Phase4DatabaseFixture["createApp"]>>,
  landlordId: number,
  listingId: number,
  action: Action,
  expectedStatus: number
) {
  return request(app.app)
    .post(`/api/v1/landlord/listings/${listingId}/${action}`)
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

describe("RM-026 listing lifecycle actions PostgreSQL integration", () => {
  it("deactivates and reactivates while preserving content, associations, images, and moderation history", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertListing(landlordId, "APPROVED");
    await addAssociations(listingId);
    await fixture.pool.query({
      text: `INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status) VALUES ($1, $2, 'PENDING', 'APPROVED')`,
      values: [listingId, adminId]
    });
    const before = await fixture.stateSnapshot();

    const deactivateApp = await fixture.createApp();
    const deactivated = await act(deactivateApp, landlordId, listingId, "deactivate", 200);
    expectExactKeys(deactivated.body.data, ownerDetailKeys);
    expect(deactivated.body.data).toMatchObject({
      id: listingId,
      status: "INACTIVE",
      title: "RM-026 listing",
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [{ code: "WIFI", label: "Wi-Fi" }],
      currentModerationReason: null
    });
    expect(deactivated.body.data.images).toHaveLength(1);
    expect((await listingState(listingId)).updated_at.toISOString()).not.toBe(originalTimestamp);
    expect(deactivateApp.faultState.statements).toHaveLength(5);
    expect(
      deactivateApp.faultState.statements.filter((statement) => statement.text.includes("UPDATE listings"))
    ).toHaveLength(1);
    expect(deactivateApp.faultState.statements.map((statement) => statement.text)).toEqual([
      expect.stringContaining("FOR UPDATE OF l"),
      expect.stringContaining("UPDATE listings"),
      expect.stringContaining("FROM listings AS l"),
      expect.stringContaining("FROM listing_amenities AS la"),
      expect.stringContaining("FROM listing_images")
    ]);
    expect(
      deactivateApp.faultState.statements.some((statement) =>
        /moderation_history|NOT EXISTS|SELECT EXISTS/i.test(statement.text)
      )
    ).toBe(false);

    const reactivateApp = await fixture.createApp();
    const reactivated = await act(reactivateApp, landlordId, listingId, "reactivate", 200);
    expectExactKeys(reactivated.body.data, ownerDetailKeys);
    expect(reactivated.body.data).toMatchObject({ status: "APPROVED", currentModerationReason: null });
    expect(reactivateApp.faultState.statements).toHaveLength(5);
    expect(
      reactivateApp.faultState.statements.filter((statement) => statement.text.includes("UPDATE listings"))
    ).toHaveLength(1);
    expect(
      reactivateApp.faultState.statements.some((statement) =>
        /moderation_history|NOT EXISTS|SELECT EXISTS|is_active/i.test(statement.text)
      )
    ).toBe(false);
    const after = await fixture.stateSnapshot();
    expect(after.listing_amenities).toStrictEqual(before.listing_amenities);
    expect(after.listing_images).toStrictEqual(before.listing_images);
    expect(after.moderation_history).toStrictEqual(before.moderation_history);
    expect(after.listings[0]).toMatchObject({
      title: before.listings[0]!.title,
      description: before.listings[0]!.description,
      address_text: before.listings[0]!.address_text,
      latitude: before.listings[0]!.latitude,
      longitude: before.listings[0]!.longitude
    });
  });

  it.each([
    ["deactivate", "DRAFT"],
    ["deactivate", "INACTIVE"],
    ["reactivate", "APPROVED"],
    ["reactivate", "HIDDEN"]
  ] as const)("rejects %s from %s without changing status or timestamp", async (action, status) => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, status);
    const app = await fixture.createApp();
    const response = await act(app, landlordId, listingId, action, 409);
    expect(response.body.error.code).toBe("INVALID_LISTING_TRANSITION");
    expect(await listingState(listingId)).toMatchObject({ status });
    expect((await listingState(listingId)).updated_at.toISOString()).toBe(originalTimestamp);
    expect(app.faultState.statements).toHaveLength(1);
  });

  it.each([
    ["deactivate", "APPROVED", "INACTIVE"],
    ["reactivate", "INACTIVE", "APPROVED"]
  ] as const)("makes repeated %s an exact transition conflict", async (action, source, result) => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(landlordId, source);
    const app = await fixture.createApp();
    await act(app, landlordId, listingId, action, 200);
    const timestamp = (await listingState(listingId)).updated_at.toISOString();
    const repeated = await act(app, landlordId, listingId, action, 409);
    expect(repeated.body.error.code).toBe("INVALID_LISTING_TRANSITION");
    expect(await listingState(listingId)).toMatchObject({ status: result });
    expect((await listingState(listingId)).updated_at.toISOString()).toBe(timestamp);
  });

  it("uses the same owner-safe 404 for a missing and non-owned listing", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const otherId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, "APPROVED");
    const app = await fixture.createApp();
    const other = await act(app, otherId, listingId, "deactivate", 404);
    const missing = await act(app, ownerId, 2_147_483_647, "deactivate", 404);
    expect(other.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
    expect(missing.body.error).toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      message: "The requested resource was not found."
    });
  });

  it("rolls back stale conditional updates and failures while reading the final detail", async () => {
    const landlordId = await fixture.insertUser("LANDLORD", ++sequence);
    const staleId = await insertListing(landlordId, "APPROVED");
    const staleApp = await fixture.createApp({ fault: "conditional-update" });
    const stale = await act(staleApp, landlordId, staleId, "deactivate", 409);
    expect(stale.body.error.code).toBe("CONCURRENT_MODIFICATION");
    expect(await listingState(staleId)).toMatchObject({ status: "APPROVED" });
    expect((await listingState(staleId)).updated_at.toISOString()).toBe(originalTimestamp);

    const detailId = await insertListing(landlordId, "INACTIVE");
    await addAssociations(detailId);
    const before = await fixture.stateSnapshot();
    const detailApp = await fixture.createApp({ fault: "detail-read" });
    await act(detailApp, landlordId, detailId, "reactivate", 500);
    const after = await fixture.stateSnapshot();
    expect(after).toStrictEqual(before);
    expect(detailApp.faultState.statements).toHaveLength(3);
  });
});
