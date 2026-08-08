import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPhase4DatabaseFixture,
  phase4Origin,
  type Phase4AppFixture,
  type Phase4DatabaseFixture
} from "./helpers/listings-phase4-fixture.js";

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const originalTimestamp = "2026-01-01T00:00:00.000Z";
const statuses = ["DRAFT", "PENDING", "REJECTED", "APPROVED", "INACTIVE", "HIDDEN"] as const;
const significantResults = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  REJECTED: "DRAFT",
  APPROVED: "PENDING",
  INACTIVE: "PENDING",
  HIDDEN: "HIDDEN"
} as const;

type ListingStatus = (typeof statuses)[number];
type ReasonStatus = Extract<ListingStatus, "REJECTED" | "HIDDEN">;

let fixture: Phase4DatabaseFixture;
let sequence = 0;

async function insertListing(
  landlordId: number,
  status: ListingStatus,
  options: Readonly<{ title?: string; propertyCode?: string }> = {}
): Promise<number> {
  sequence += 1;
  const title = options.title ?? `RM-028 ${status} listing`;
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude, updated_at
      )
      VALUES (
        $1, (SELECT id FROM property_types WHERE code = $2), $3::listing_status,
        $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz
      )
      RETURNING id
    `,
    values: [
      landlordId,
      options.propertyCode ?? "STUDIO",
      status,
      title,
      `RM-028 private description ${sequence}`,
      String(5_000_000 + sequence),
      "25.50",
      `${sequence} Private Street`,
      "District 1",
      10.75 + sequence / 1_000_000,
      106.67 + sequence / 1_000_000,
      originalTimestamp
    ]
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
    values: [listingId, `rm028/lifecycle-${sequence}`, `https://example.test/rm028-${sequence}.webp`]
  });
}

async function replaceSeedAmenities(listingId: number, codes: readonly string[]): Promise<void> {
  await fixture.pool.query({ text: "DELETE FROM listing_amenities WHERE listing_id = $1", values: [listingId] });
  if (codes.length === 0) return;
  await fixture.pool.query({
    text: `
      INSERT INTO listing_amenities (listing_id, amenity_id)
      SELECT $1, id FROM amenities WHERE code = ANY($2::text[])
    `,
    values: [listingId, [...codes]]
  });
}

async function insertReason(
  listingId: number,
  adminId: number,
  status: ReasonStatus,
  reason: string,
  createdAt = new Date("2026-08-05T08:00:00.000Z")
): Promise<void> {
  await fixture.pool.query({
    text: `
      INSERT INTO moderation_history (
        listing_id, admin_id, previous_status, new_status, reason, created_at
      )
      VALUES ($1, $2, $3::listing_status, $4::listing_status, $5, $6)
    `,
    values: [listingId, adminId, status === "REJECTED" ? "PENDING" : "APPROVED", status, reason, createdAt]
  });
}

async function seedRequiredReason(listingId: number, status: ListingStatus): Promise<string | null> {
  if (status !== "REJECTED" && status !== "HIDDEN") return null;
  const adminId = await fixture.insertUser("ADMIN", ++sequence);
  const reason = `Current ${status.toLowerCase()} reason ${sequence}`;
  await insertReason(listingId, adminId, status, reason);
  return reason;
}

async function listingRow(listingId: number) {
  const result = await fixture.pool.query({
    text: `
      SELECT id, property_type_id, status, title, description, monthly_rent,
             room_area_sqm, address_text, area_name, latitude, longitude, created_at, updated_at
      FROM listings
      WHERE id = $1
    `,
    values: [listingId]
  });
  return result.rows[0];
}

async function amenityCodes(listingId: number): Promise<string[]> {
  const result = await fixture.pool.query<{ code: string }>({
    text: `
      SELECT a.code
      FROM listing_amenities AS la
      JOIN amenities AS a ON a.id = la.amenity_id
      WHERE la.listing_id = $1
      ORDER BY a.code
    `,
    values: [listingId]
  });
  return result.rows.map((row) => row.code);
}

async function historyRows(listingId: number) {
  return (
    await fixture.pool.query({
      text: `
        SELECT id, listing_id, admin_id, previous_status, new_status, reason, created_at
        FROM moderation_history
        WHERE listing_id = $1
        ORDER BY id
      `,
      values: [listingId]
    })
  ).rows;
}

function patch(app: Express, token: string, listingId: number, body: object) {
  return request(app)
    .patch(`/api/v1/landlord/listings/${listingId}`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`)
    .send(body);
}

function action(app: Express, token: string, listingId: number, name: "submit" | "deactivate" | "reactivate") {
  return request(app)
    .post(`/api/v1/landlord/listings/${listingId}/${name}`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`);
}

function deleteListing(app: Express, token: string, listingId: number) {
  return request(app)
    .delete(`/api/v1/landlord/listings/${listingId}`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`);
}

function listingWrites(app: Phase4AppFixture) {
  return app.faultState.statements.filter((statement) => statement.text.includes("UPDATE listings"));
}

function moderationWrites(app: Phase4AppFixture) {
  return app.faultState.statements.filter((statement) =>
    /(?:INSERT INTO|UPDATE|DELETE FROM)\s+moderation_history/i.test(statement.text)
  );
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

describe("RM-028 six-state persisted PATCH matrices", () => {
  it.each(statuses)("applies the scalar significant-edit matrix from %s", async (status) => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, status);
    const expectedReason = await seedRequiredReason(listingId, status);
    const before = await listingRow(listingId);
    const historyBefore = await historyRows(listingId);
    const application = await fixture.createApp();
    const response = await patch(application.app, await fixture.signToken(ownerId), listingId, {
      title: `Changed ${status} title`
    }).expect(200);
    const after = await listingRow(listingId);

    expect(after).toMatchObject({ title: `Changed ${status} title`, status: significantResults[status] });
    expect((after!.updated_at as Date).getTime()).toBeGreaterThan((before!.updated_at as Date).getTime());
    expect(listingWrites(application)).toHaveLength(1);
    expect(moderationWrites(application)).toHaveLength(0);
    expect(await historyRows(listingId)).toStrictEqual(historyBefore);
    expect(response.body.data).toMatchObject({ id: listingId, status: significantResults[status] });
    expect(response.body.data.currentModerationReason).toBe(status === "HIDDEN" ? expectedReason : null);
  });

  it.each(statuses)("applies the amenity significant-edit matrix atomically from %s", async (status) => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, status);
    await replaceSeedAmenities(listingId, ["WIFI"]);
    const expectedReason = await seedRequiredReason(listingId, status);
    const before = await listingRow(listingId);
    const historyBefore = await historyRows(listingId);
    const application = await fixture.createApp();
    const response = await patch(application.app, await fixture.signToken(ownerId), listingId, {
      amenityCodes: ["KITCHEN"]
    }).expect(200);
    const after = await listingRow(listingId);

    expect(await amenityCodes(listingId)).toStrictEqual(["KITCHEN"]);
    expect(after!.status).toBe(significantResults[status]);
    expect((after!.updated_at as Date).getTime()).toBeGreaterThan((before!.updated_at as Date).getTime());
    expect(application.faultState.statements.map((statement) => statement.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("UPDATE listings"),
        expect.stringContaining("DELETE FROM listing_amenities"),
        expect.stringContaining("INSERT INTO listing_amenities")
      ])
    );
    const updateIndex = application.faultState.statements.findIndex((statement) =>
      statement.text.includes("UPDATE listings")
    );
    const deleteIndex = application.faultState.statements.findIndex((statement) =>
      statement.text.includes("DELETE FROM listing_amenities")
    );
    const insertIndex = application.faultState.statements.findIndex((statement) =>
      statement.text.includes("INSERT INTO listing_amenities")
    );
    expect(updateIndex).toBeLessThan(deleteIndex);
    expect(deleteIndex).toBeLessThan(insertIndex);
    expect(listingWrites(application)).toHaveLength(1);
    expect(await historyRows(listingId)).toStrictEqual(historyBefore);
    expect(response.body.data.currentModerationReason).toBe(status === "HIDDEN" ? expectedReason : null);
  });

  it.each(statuses)("keeps normalized scalar and amenity-order no-ops exact in %s", async (status) => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const title = `RM-028 normalized ${status}`;
    const listingId = await insertListing(ownerId, status, { title });
    await replaceSeedAmenities(listingId, ["WIFI", "KITCHEN"]);
    const expectedReason = await seedRequiredReason(listingId, status);
    const before = await listingRow(listingId);
    const amenitiesBefore = await amenityCodes(listingId);
    const historyBefore = await historyRows(listingId);
    const application = await fixture.createApp();
    const response = await patch(application.app, await fixture.signToken(ownerId), listingId, {
      title: `  ${title}  `,
      amenityCodes: ["WIFI", "KITCHEN"]
    }).expect(200);

    expect(await listingRow(listingId)).toStrictEqual(before);
    expect(await amenityCodes(listingId)).toStrictEqual(amenitiesBefore);
    expect(await historyRows(listingId)).toStrictEqual(historyBefore);
    expect(
      application.faultState.statements.filter((statement) =>
        /UPDATE listings|DELETE FROM listing_amenities|INSERT INTO listing_amenities/i.test(statement.text)
      )
    ).toHaveLength(0);
    expect(response.body.data.status).toBe(status);
    expect(response.body.data.currentModerationReason).toBe(expectedReason);
  });
});

describe("RM-028 retired lookup and source-state verification", () => {
  it("retains readable retired associations through PATCH/no-op/submission and rejects new invalid selections", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const token = await fixture.signToken(ownerId);
    const retainedId = await insertListing(ownerId, "DRAFT");
    await replaceSeedAmenities(retainedId, ["WIFI"]);
    await insertImage(retainedId);
    await fixture.pool.query("UPDATE property_types SET is_active = false WHERE code = 'STUDIO'");
    await fixture.pool.query("UPDATE amenities SET is_active = false WHERE code = 'WIFI'");
    const application = await fixture.createApp();

    const initial = await request(application.app)
      .get(`/api/v1/landlord/listings/${retainedId}`)
      .set("Cookie", `rentmate_session=${token}`)
      .expect(200);
    expect(initial.body.data.propertyType).toStrictEqual({ code: "STUDIO", label: "Studio" });
    expect(initial.body.data.amenities).toStrictEqual([{ code: "WIFI", label: "Wi-Fi" }]);

    const unrelated = await patch(application.app, token, retainedId, { title: "Retained lookup edit" }).expect(200);
    expect(unrelated.body.data.propertyType).toStrictEqual({ code: "STUDIO", label: "Studio" });
    expect(unrelated.body.data.amenities).toStrictEqual([{ code: "WIFI", label: "Wi-Fi" }]);
    const noOp = await patch(application.app, token, retainedId, {
      title: " Retained lookup edit ",
      amenityCodes: ["WIFI"]
    }).expect(200);
    expect(noOp.body.data.amenities).toStrictEqual([{ code: "WIFI", label: "Wi-Fi" }]);
    const mixed = await patch(application.app, token, retainedId, {
      amenityCodes: ["KITCHEN", "WIFI"]
    }).expect(200);
    expect(mixed.body.data.amenities).toStrictEqual([
      { code: "KITCHEN", label: "Kitchen" },
      { code: "WIFI", label: "Wi-Fi" }
    ]);
    const submitted = await action(application.app, token, retainedId, "submit").expect(200);
    expect(submitted.body.data).toMatchObject({
      status: "PENDING",
      propertyType: { code: "STUDIO", label: "Studio" }
    });

    const activePropertyId = await insertListing(ownerId, "DRAFT", { propertyCode: "ROOM" });
    const retiredAmenityId = await insertListing(ownerId, "DRAFT", { propertyCode: "ROOM" });
    const cases = [
      [activePropertyId, { propertyTypeCode: "UNKNOWN" }, "propertyTypeCode"],
      [activePropertyId, { amenityCodes: ["UNKNOWN"] }, "amenityCodes"],
      [activePropertyId, { propertyTypeCode: "STUDIO" }, "propertyTypeCode"],
      [retiredAmenityId, { amenityCodes: ["WIFI"] }, "amenityCodes"]
    ] as const;
    for (const [listingId, body, field] of cases) {
      const response = await patch(application.app, token, listingId, body).expect(422);
      expect(response.body.error).toMatchObject({ code: "VALIDATION_FAILED" });
      expect(response.body.error.details[0].field).toBe(field);
    }
  });

  it("verifies the complete submit source-state matrix and bounded query ordering", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const token = await fixture.signToken(ownerId);
    for (const status of statuses) {
      const listingId = await insertListing(ownerId, status);
      await insertImage(listingId);
      await seedRequiredReason(listingId, status);
      const application = await fixture.createApp();
      const legal = status === "DRAFT" || status === "HIDDEN";
      const response = await action(application.app, token, listingId, "submit").expect(legal ? 200 : 409);
      if (legal) {
        expect(response.body.data).toMatchObject({ status: "PENDING", currentModerationReason: null });
        expect(application.faultState.statements).toHaveLength(7);
        expect(application.faultState.statements[0]!.text).toContain("FOR UPDATE OF l");
        expect(application.faultState.statements[1]!.text).toContain("NOT EXISTS");
        expect(application.faultState.statements[2]!.text).toContain("SELECT EXISTS");
        expect(listingWrites(application)).toHaveLength(1);
      } else {
        expect(response.body.error.code).toBe("INVALID_LISTING_TRANSITION");
        expect(application.faultState.statements).toHaveLength(1);
      }
    }
  });

  it.each([
    ["deactivate", "APPROVED"],
    ["reactivate", "INACTIVE"]
  ] as const)("verifies every forbidden %s source state stops after the lock", async (name, legalStatus) => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const token = await fixture.signToken(ownerId);
    for (const status of statuses.filter((candidate) => candidate !== legalStatus)) {
      const listingId = await insertListing(ownerId, status);
      await seedRequiredReason(listingId, status);
      const before = await listingRow(listingId);
      const application = await fixture.createApp();
      const response = await action(application.app, token, listingId, name).expect(409);
      expect(response.body.error.code).toBe("INVALID_LISTING_TRANSITION");
      expect(application.faultState.statements).toHaveLength(1);
      expect(application.faultState.statements[0]!.text).toContain("FOR UPDATE OF l");
      expect(await listingRow(listingId)).toStrictEqual(before);
    }
  });

  it("verifies delete state/history eligibility while preserving history", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const token = await fixture.signToken(ownerId);
    const eligibleId = await insertListing(ownerId, "DRAFT");
    await replaceSeedAmenities(eligibleId, ["WIFI"]);
    await insertImage(eligibleId);
    await deleteListing((await fixture.createApp()).app, token, eligibleId).expect(204);
    expect(await listingRow(eligibleId)).toBeUndefined();

    const moderatedDraftId = await insertListing(ownerId, "REJECTED");
    await insertReason(moderatedDraftId, adminId, "REJECTED", "Retained rejection");
    await fixture.pool.query("UPDATE listings SET status = 'DRAFT' WHERE id = $1", [moderatedDraftId]);
    const historyBefore = await historyRows(moderatedDraftId);
    const moderatedApp = await fixture.createApp();
    const moderated = await deleteListing(moderatedApp.app, token, moderatedDraftId).expect(409);
    expect(moderated.body.error.code).toBe("LISTING_DELETE_NOT_ALLOWED");
    expect(moderatedApp.faultState.statements).toHaveLength(2);
    expect(await historyRows(moderatedDraftId)).toStrictEqual(historyBefore);

    for (const status of statuses.filter((candidate) => candidate !== "DRAFT")) {
      const listingId = await insertListing(ownerId, status);
      await seedRequiredReason(listingId, status);
      const application = await fixture.createApp();
      const response = await deleteListing(application.app, token, listingId).expect(409);
      expect(response.body.error.code).toBe("LISTING_DELETE_NOT_ALLOWED");
      expect(application.faultState.statements).toHaveLength(1);
    }
  });
});

describe("RM-028 real lifecycle journeys and rollback closure", () => {
  it("runs rejected remediation from reason through DRAFT to PENDING without history mutation", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertListing(ownerId, "REJECTED");
    await insertReason(listingId, adminId, "REJECTED", "Newest rejection", new Date("2026-08-05T09:00:00Z"));
    await insertImage(listingId);
    const before = await historyRows(listingId);
    const token = await fixture.signToken(ownerId);
    const application = await fixture.createApp();
    const detail = await request(application.app)
      .get(`/api/v1/landlord/listings/${listingId}`)
      .set("Cookie", `rentmate_session=${token}`)
      .expect(200);
    expect(detail.body.data.currentModerationReason).toBe("Newest rejection");
    const edited = await patch(application.app, token, listingId, { title: "Remediated rejected title" }).expect(200);
    expect(edited.body.data).toMatchObject({ status: "DRAFT", currentModerationReason: null });
    const submitted = await action(application.app, token, listingId, "submit").expect(200);
    expect(submitted.body.data).toMatchObject({ status: "PENDING", currentModerationReason: null });
    expect(await historyRows(listingId)).toStrictEqual(before);
  });

  it("runs hidden remediation while retaining then clearing only the current-reason projection", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertListing(ownerId, "HIDDEN");
    await insertReason(listingId, adminId, "HIDDEN", "Newest hidden reason");
    await insertImage(listingId);
    const before = await historyRows(listingId);
    const token = await fixture.signToken(ownerId);
    const application = await fixture.createApp();
    const noOp = await patch(application.app, token, listingId, {}).expect(200);
    expect(noOp.body.data).toMatchObject({
      status: "HIDDEN",
      currentModerationReason: "Newest hidden reason"
    });
    const edited = await patch(application.app, token, listingId, { title: "Hidden remediation" }).expect(200);
    expect(edited.body.data).toMatchObject({
      status: "HIDDEN",
      currentModerationReason: "Newest hidden reason"
    });
    const submitted = await action(application.app, token, listingId, "submit").expect(200);
    expect(submitted.body.data).toMatchObject({ status: "PENDING", currentModerationReason: null });
    expect(await historyRows(listingId)).toStrictEqual(before);
  });

  it("runs APPROVED to INACTIVE to APPROVED with no eligibility or association mutation", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const adminId = await fixture.insertUser("ADMIN", ++sequence);
    const listingId = await insertListing(ownerId, "APPROVED");
    await replaceSeedAmenities(listingId, ["WIFI"]);
    await insertImage(listingId);
    await fixture.pool.query({
      text: `
        INSERT INTO moderation_history (listing_id, admin_id, previous_status, new_status)
        VALUES ($1, $2, 'PENDING', 'APPROVED')
      `,
      values: [listingId, adminId]
    });
    const before = await fixture.stateSnapshot();
    const token = await fixture.signToken(ownerId);
    const deactivateApp = await fixture.createApp();
    await action(deactivateApp.app, token, listingId, "deactivate").expect(200);
    expect(
      deactivateApp.faultState.statements.some((statement) =>
        /NOT EXISTS|SELECT EXISTS|moderation_history|is_active\s*=\s*true|WHERE code\s*=/i.test(statement.text)
      )
    ).toBe(false);
    const reactivateApp = await fixture.createApp();
    await action(reactivateApp.app, token, listingId, "reactivate").expect(200);
    expect(
      reactivateApp.faultState.statements.some((statement) =>
        /NOT EXISTS|SELECT EXISTS|moderation_history|is_active\s*=\s*true|WHERE code\s*=/i.test(statement.text)
      )
    ).toBe(false);
    const after = await fixture.stateSnapshot();
    expect(after.listing_amenities).toStrictEqual(before.listing_amenities);
    expect(after.listing_images).toStrictEqual(before.listing_images);
    expect(after.moderation_history).toStrictEqual(before.moderation_history);
    expect(after.listings[0]).toMatchObject({
      status: "APPROVED",
      title: before.listings[0]!.title,
      description: before.listings[0]!.description
    });
  });

  it("moves an INACTIVE significant edit to PENDING and rejects direct reactivation without losing content", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, "INACTIVE");
    const token = await fixture.signToken(ownerId);
    const application = await fixture.createApp();
    const edited = await patch(application.app, token, listingId, { title: "Inactive content edit" }).expect(200);
    expect(edited.body.data).toMatchObject({ title: "Inactive content edit", status: "PENDING" });
    const reactivated = await action(application.app, token, listingId, "reactivate").expect(409);
    expect(reactivated.body.error.code).toBe("INVALID_LISTING_TRANSITION");
    expect(await listingRow(listingId)).toMatchObject({ title: "Inactive content edit", status: "PENDING" });
  });

  it.each(["amenity-insert", "detail-read"] as const)(
    "rolls back scalar, status, timestamp, amenities, and history on %s failure",
    async (fault) => {
      const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
      const adminId = await fixture.insertUser("ADMIN", ++sequence);
      const listingId = await insertListing(ownerId, "APPROVED");
      await replaceSeedAmenities(listingId, ["WIFI"]);
      await insertReason(listingId, adminId, "HIDDEN", "Unrelated retained history");
      const before = await fixture.stateSnapshot();
      const application = await fixture.createApp({ fault });
      const response = await patch(application.app, await fixture.signToken(ownerId), listingId, {
        title: "Must roll back",
        amenityCodes: ["KITCHEN"]
      }).expect(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(JSON.stringify(response.body)).not.toMatch(/synthetic|UPDATE listings|listing_amenities|stack/i);
      expect(await fixture.stateSnapshot()).toStrictEqual(before);
    }
  );

  it("maps a reactivate zero-row expected-state write to a sanitized stale conflict", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", ++sequence);
    const listingId = await insertListing(ownerId, "INACTIVE");
    const before = await listingRow(listingId);
    const application = await fixture.createApp({ fault: "conditional-update" });
    const response = await action(application.app, await fixture.signToken(ownerId), listingId, "reactivate").expect(
      409
    );
    expect(response.body.error).toMatchObject({
      code: "CONCURRENT_MODIFICATION",
      message: "The listing changed during this request."
    });
    expect(JSON.stringify(response.body)).not.toMatch(/UPDATE listings|status =|SQL|stack/i);
    expect(await listingRow(listingId)).toStrictEqual(before);
    expect(await historyRows(listingId)).toStrictEqual([]);
  });
});
