import path from "node:path";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPhase4DatabaseFixture,
  phase4Origin,
  type Phase4DatabaseFixture
} from "./helpers/listings-phase4-fixture.js";

const migrationDirectory = path.resolve(process.cwd(), "migrations");
let fixture: Phase4DatabaseFixture;

type ListingStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN" | "INACTIVE";
type ReasonStatus = Extract<ListingStatus, "REJECTED" | "HIDDEN">;

async function propertyTypeId(): Promise<number> {
  const result = await fixture.pool.query<{ id: number }>({
    text: "SELECT id FROM property_types WHERE code = $1",
    values: ["STUDIO"]
  });
  return result.rows[0]!.id;
}

async function insertListing(landlordId: number, status: ListingStatus, sequence: number): Promise<number> {
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO listings (
        landlord_id, property_type_id, status, title, description, monthly_rent,
        room_area_sqm, address_text, area_name, latitude, longitude, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
      RETURNING id
    `,
    values: [
      landlordId,
      await propertyTypeId(),
      status,
      `RM-024 listing ${sequence}`,
      `Private description ${sequence}`,
      String(6_000_000 + sequence),
      "30.00",
      `${sequence} Exact Street`,
      "District 1",
      10.77 + sequence / 100_000,
      106.69 + sequence / 100_000,
      new Date(Date.UTC(2026, 7, 5, 0, sequence, 0))
    ]
  });
  return result.rows[0]!.id;
}

async function insertReason(
  listingId: number,
  adminId: number,
  status: ReasonStatus,
  reason: string,
  createdAt: Date
): Promise<number> {
  const result = await fixture.pool.query<{ id: number }>({
    text: `
      INSERT INTO moderation_history (
        listing_id, admin_id, previous_status, new_status, reason, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    values: [listingId, adminId, status === "REJECTED" ? "PENDING" : "APPROVED", status, reason, createdAt]
  });
  return result.rows[0]!.id;
}

async function historySnapshot() {
  return (
    await fixture.pool.query({
      text: `
        SELECT id, listing_id, admin_id, previous_status, new_status, reason, created_at
        FROM moderation_history
        ORDER BY id
      `,
      values: []
    })
  ).rows;
}

function ownerGet(app: Express, token: string, requestPath: string) {
  return request(app).get(requestPath).set("Cookie", `rentmate_session=${token}`);
}

function ownerPatch(app: Express, token: string, listingId: number, body: object) {
  return request(app)
    .patch(`/api/v1/landlord/listings/${listingId}`)
    .set("Origin", phase4Origin)
    .set("Cookie", `rentmate_session=${token}`)
    .send(body);
}

describe("RM-024 current moderation reason PostgreSQL integration", () => {
  beforeAll(async () => {
    fixture = createPhase4DatabaseFixture(migrationDirectory);
    await fixture.rebuildSchema();
  });

  beforeEach(async () => fixture.resetData());

  afterAll(async () => {
    await fixture.dropSchema();
    await fixture.close();
  });

  it("selects latest applicable reasons by timestamp and ID while excluding the other status", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", 1);
    const adminId = await fixture.insertUser("ADMIN", 2);
    const rejectedId = await insertListing(ownerId, "REJECTED", 1);
    const hiddenId = await insertListing(ownerId, "HIDDEN", 2);
    const tieId = await insertListing(ownerId, "REJECTED", 3);
    const old = new Date("2026-08-05T01:00:00.000Z");
    const newer = new Date("2026-08-05T02:00:00.000Z");
    const newestOtherStatus = new Date("2026-08-05T03:00:00.000Z");
    const tieTime = new Date("2026-08-05T04:00:00.000Z");

    await insertReason(rejectedId, adminId, "REJECTED", "Older rejection", old);
    await insertReason(rejectedId, adminId, "REJECTED", "Newest rejection", newer);
    await insertReason(rejectedId, adminId, "HIDDEN", "Newer but different hidden", newestOtherStatus);
    await insertReason(hiddenId, adminId, "HIDDEN", "Older hidden", old);
    await insertReason(hiddenId, adminId, "HIDDEN", "Newest hidden", newer);
    await insertReason(hiddenId, adminId, "REJECTED", "Newer but different rejection", newestOtherStatus);
    await insertReason(tieId, adminId, "REJECTED", "Lower ID at tie", tieTime);
    const higherTieId = await insertReason(tieId, adminId, "REJECTED", "Higher ID at tie", tieTime);
    const before = await historySnapshot();
    const token = await fixture.signToken(ownerId);
    const appFixture = await fixture.createApp();

    for (const [listingId, reason] of [
      [rejectedId, "Newest rejection"],
      [hiddenId, "Newest hidden"],
      [tieId, "Higher ID at tie"]
    ] as const) {
      appFixture.resetOwnerReads();
      const response = await ownerGet(appFixture.app, token, `/api/v1/landlord/listings/${listingId}`).expect(200);
      expect(response.body.data.currentModerationReason).toBe(reason);
      expect(appFixture.ownerReads).toStrictEqual(["detail", "amenities", "images", "reason"]);
    }
    expect(before.find((row) => row.id === higherTieId)?.reason).toBe("Higher ID at tie");

    appFixture.resetOwnerReads();
    const collection = await ownerGet(appFixture.app, token, "/api/v1/landlord/listings?pageSize=100").expect(200);
    expect(appFixture.ownerReads).toStrictEqual(["collection"]);
    expect(
      Object.fromEntries(
        collection.body.data.map((listing: { id: number; currentModerationReason: string | null }) => [
          listing.id,
          listing.currentModerationReason
        ])
      )
    ).toMatchObject({
      [rejectedId]: "Newest rejection",
      [hiddenId]: "Newest hidden",
      [tieId]: "Higher ID at tie"
    });
    expect(await historySnapshot()).toStrictEqual(before);
  });

  it("projects null for ordinary current statuses while preserving old history and three-query detail reads", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", 10);
    const adminId = await fixture.insertUser("ADMIN", 11);
    const statuses = ["DRAFT", "PENDING", "APPROVED", "INACTIVE"] as const;
    const ids: number[] = [];
    for (const [index, status] of statuses.entries()) {
      const listingId = await insertListing(ownerId, status, index + 10);
      ids.push(listingId);
      await insertReason(
        listingId,
        adminId,
        index % 2 === 0 ? "REJECTED" : "HIDDEN",
        `Historical reason ${index}`,
        new Date(Date.UTC(2026, 7, 5, 5, index, 0))
      );
    }
    const before = await historySnapshot();
    const token = await fixture.signToken(ownerId);
    const appFixture = await fixture.createApp();

    for (const listingId of ids) {
      appFixture.resetOwnerReads();
      const response = await ownerGet(appFixture.app, token, `/api/v1/landlord/listings/${listingId}`).expect(200);
      expect(response.body.data.currentModerationReason).toBeNull();
      expect(appFixture.ownerReads).toStrictEqual(["detail", "amenities", "images"]);
    }
    appFixture.resetOwnerReads();
    const collection = await ownerGet(appFixture.app, token, "/api/v1/landlord/listings?pageSize=100").expect(200);
    expect(appFixture.ownerReads).toStrictEqual(["collection"]);
    expect(
      collection.body.data.every(
        (listing: { currentModerationReason: unknown }) => listing.currentModerationReason === null
      )
    ).toBe(true);
    expect(await historySnapshot()).toStrictEqual(before);
  });

  it.each(["REJECTED", "HIDDEN"] as const)(
    "sanitizes a missing current %s reason after exactly four detail reads",
    async (status) => {
      const ownerId = await fixture.insertUser("LANDLORD", status === "REJECTED" ? 20 : 21);
      const listingId = await insertListing(ownerId, status, status === "REJECTED" ? 20 : 21);
      const appFixture = await fixture.createApp();
      const response = await ownerGet(
        appFixture.app,
        await fixture.signToken(ownerId),
        `/api/v1/landlord/listings/${listingId}`
      ).expect(500);

      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(appFixture.ownerReads).toStrictEqual(["detail", "amenities", "images", "reason"]);
      expect(JSON.stringify(response.body)).not.toMatch(/moderation_history|SELECT|stack|row|admin|reason/i);
      expect(response.body.error.message).not.toContain(String(listingId));
      expect(await historySnapshot()).toStrictEqual([]);
    }
  );

  it("keeps PATCH reason reads transaction-bound and never mutates moderation history", async () => {
    const ownerId = await fixture.insertUser("LANDLORD", 30);
    const adminId = await fixture.insertUser("ADMIN", 31);
    const rejectedId = await insertListing(ownerId, "REJECTED", 30);
    const hiddenId = await insertListing(ownerId, "HIDDEN", 31);
    await insertReason(
      rejectedId,
      adminId,
      "REJECTED",
      "Latest rejection for PATCH",
      new Date("2026-08-05T06:00:00.000Z")
    );
    await insertReason(hiddenId, adminId, "HIDDEN", "Latest hidden for PATCH", new Date("2026-08-05T07:00:00.000Z"));
    const before = await historySnapshot();
    const token = await fixture.signToken(ownerId);

    const rejectedNoop = await fixture.createApp();
    const noOpResponse = await ownerPatch(rejectedNoop.app, token, rejectedId, {}).expect(200);
    expect(noOpResponse.body.data).toMatchObject({
      status: "REJECTED",
      currentModerationReason: "Latest rejection for PATCH"
    });
    expect(
      rejectedNoop.faultState.statements.some((statement) => statement.text.includes("FROM moderation_history"))
    ).toBe(true);

    const rejectedEdit = await fixture.createApp();
    const rejectedResponse = await ownerPatch(rejectedEdit.app, token, rejectedId, {
      title: "Edited rejected listing"
    }).expect(200);
    expect(rejectedResponse.body.data).toMatchObject({ status: "DRAFT", currentModerationReason: null });
    expect(
      rejectedEdit.faultState.statements.some((statement) => statement.text.includes("FROM moderation_history"))
    ).toBe(false);

    const hiddenEdit = await fixture.createApp();
    const hiddenResponse = await ownerPatch(hiddenEdit.app, token, hiddenId, {
      title: "Edited hidden listing"
    }).expect(200);
    expect(hiddenResponse.body.data).toMatchObject({
      status: "HIDDEN",
      currentModerationReason: "Latest hidden for PATCH"
    });
    const reasonIndex = hiddenEdit.faultState.statements.findIndex((statement) =>
      statement.text.includes("FROM moderation_history")
    );
    const updateIndex = hiddenEdit.faultState.statements.findIndex((statement) =>
      statement.text.includes("UPDATE listings")
    );
    expect(updateIndex).toBeGreaterThan(-1);
    expect(reasonIndex).toBeGreaterThan(updateIndex);

    const allStatements = [
      ...rejectedNoop.faultState.statements,
      ...rejectedEdit.faultState.statements,
      ...hiddenEdit.faultState.statements
    ];
    expect(allStatements).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringMatching(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+moderation_history/i)
        })
      ])
    );
    expect(await historySnapshot()).toStrictEqual(before);
  });
});
