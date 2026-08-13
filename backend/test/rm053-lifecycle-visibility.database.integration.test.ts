import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createRm053DatabaseFixture,
  rm053AdminEmail,
  rm053AdminPassword,
  rm053Jpeg,
  rm053Origin
} from "./helpers/rm053-backend-fixture.js";

const fixture = createRm053DatabaseFixture();
let accountSequence = 0;

const listingInput = Object.freeze({
  title: "RM-053 lifecycle visibility listing",
  description: "A listing used to verify the cross-module lifecycle and public visibility contract.",
  monthlyRent: 8_200_000,
  propertyTypeCode: "STUDIO",
  roomAreaSqm: 31.25,
  addressText: "53 Lifecycle Street, Ben Thanh Ward, Ho Chi Minh City",
  areaName: "Ben Thanh, District 1",
  latitude: 10.771421,
  longitude: 106.698112,
  amenityCodes: ["WIFI", "PARKING"]
});

interface ApprovedScenario {
  readonly app: Express;
  readonly adminCookie: string;
  readonly landlordCookie: string;
  readonly tenantCookie: string;
  readonly listingId: number;
}

function cookieFrom(response: request.Response): string {
  const header = response.headers["set-cookie"];
  const first = Array.isArray(header) ? header[0] : undefined;
  const cookie = first?.split(";", 1)[0];
  if (!cookie?.startsWith("rentmate_session=")) {
    throw new Error("RM-053 expected a session cookie without exposing its value.");
  }
  return cookie;
}

function ids(response: request.Response): number[] {
  return (response.body.data as Array<{ id: number }>).map(({ id }) => id);
}

async function listingState(listingId: number) {
  const result = await fixture.pool.query<{ status: string; updatedAt: Date }>({
    text: 'SELECT status::text AS status, updated_at AS "updatedAt" FROM listings WHERE id = $1',
    values: [listingId]
  });
  return result.rows[0]!;
}

async function favoriteCount(tenantId: number, listingId: number): Promise<number> {
  return (
    await fixture.pool.query<{ count: number }>({
      text: "SELECT count(*)::integer AS count FROM favorites WHERE tenant_id = $1 AND listing_id = $2",
      values: [tenantId, listingId]
    })
  ).rows[0]!.count;
}

async function prepareApprovedScenario(imageCount: number): Promise<ApprovedScenario & { readonly tenantId: number }> {
  accountSequence += 1;
  const appFixture = await fixture.createApp();
  const { app } = appFixture;
  const suffix = accountSequence.toString();
  const landlordRegistration = await request(app)
    .post("/api/v1/auth/register/landlord")
    .set("Origin", rm053Origin)
    .send({
      email: `rm053.lifecycle.landlord.${suffix}@example.test`,
      password: "Rm053LifecycleLandlordPass123",
      phone: `+8493${suffix.padStart(8, "0")}`
    })
    .expect(201);
  const tenantRegistration = await request(app)
    .post("/api/v1/auth/register/tenant")
    .set("Origin", rm053Origin)
    .send({ email: `rm053.lifecycle.tenant.${suffix}@example.test`, password: "Rm053LifecycleTenantPass123" })
    .expect(201);
  const adminLogin = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", rm053Origin)
    .send({ email: rm053AdminEmail, password: rm053AdminPassword })
    .expect(200);
  const landlordCookie = cookieFrom(landlordRegistration);
  const tenantCookie = cookieFrom(tenantRegistration);
  const adminCookie = cookieFrom(adminLogin);
  const tenantId = tenantRegistration.body.data.id as number;

  const draft = await request(app)
    .post("/api/v1/landlord/listings")
    .set("Origin", rm053Origin)
    .set("Cookie", landlordCookie)
    .send({})
    .expect(201);
  const listingId = draft.body.data.id as number;
  await request(app)
    .patch(`/api/v1/landlord/listings/${listingId}`)
    .set("Origin", rm053Origin)
    .set("Cookie", landlordCookie)
    .send(listingInput)
    .expect(200);
  for (let imageNumber = 1; imageNumber <= imageCount; imageNumber += 1) {
    await request(app)
      .post(`/api/v1/landlord/listings/${listingId}/images`)
      .set("Origin", rm053Origin)
      .set("Cookie", landlordCookie)
      .field("altText", `RM-053 lifecycle image ${imageNumber}`)
      .attach("image", rm053Jpeg, { filename: `rm053-lifecycle-${imageNumber}.jpg`, contentType: "image/jpeg" })
      .expect(201);
  }
  await request(app)
    .post(`/api/v1/landlord/listings/${listingId}/submit`)
    .set("Origin", rm053Origin)
    .set("Cookie", landlordCookie)
    .expect(200);
  await request(app)
    .post(`/api/v1/admin/listings/${listingId}/moderation-actions`)
    .set("Origin", rm053Origin)
    .set("Cookie", adminCookie)
    .send({ action: "APPROVE" })
    .expect(201);
  await request(app)
    .put(`/api/v1/favorites/${listingId}`)
    .set("Origin", rm053Origin)
    .set("Cookie", tenantCookie)
    .expect(204);

  return { app, adminCookie, landlordCookie, tenantCookie, tenantId, listingId };
}

async function expectPublicAndFavoriteVisibility(scenario: ApprovedScenario, expectedVisible: boolean): Promise<void> {
  const publicSearch = await request(scenario.app)
    .get(`/api/v1/listings?q=${encodeURIComponent(listingInput.title)}`)
    .expect(200);
  const favorites = await request(scenario.app)
    .get("/api/v1/favorites")
    .set("Cookie", scenario.tenantCookie)
    .expect(200);
  const presentInSearch = ids(publicSearch).includes(scenario.listingId);
  const presentInFavorites = ids(favorites).includes(scenario.listingId);
  expect(presentInSearch).toBe(expectedVisible);
  expect(presentInFavorites).toBe(expectedVisible);
  await request(scenario.app)
    .get(`/api/v1/listings/${scenario.listingId}`)
    .expect(expectedVisible ? 200 : 404);
}

beforeAll(async () => {
  await fixture.dropKnownFrozenSchema();
  await fixture.bootstrap();
});

beforeEach(async () => {
  await fixture.resetMutableData();
});

afterAll(async () => {
  await fixture.dropKnownFrozenSchema();
  await fixture.close();
});

describe("RM-053 lifecycle and visibility acceptance", () => {
  it("keeps an existing favorite relationship while admin hide and restore changes the public projection", async () => {
    const scenario = await prepareApprovedScenario(1);
    await expectPublicAndFavoriteVisibility(scenario, true);
    expect(await favoriteCount(scenario.tenantId, scenario.listingId)).toBe(1);

    await request(scenario.app)
      .post(`/api/v1/admin/listings/${scenario.listingId}/moderation-actions`)
      .set("Origin", rm053Origin)
      .set("Cookie", scenario.adminCookie)
      .send({ action: "HIDE", reason: "RM-053 hide visibility verification" })
      .expect(201);
    expect((await listingState(scenario.listingId)).status).toBe("HIDDEN");
    await expectPublicAndFavoriteVisibility(scenario, false);
    expect(await favoriteCount(scenario.tenantId, scenario.listingId)).toBe(1);

    await request(scenario.app)
      .post(`/api/v1/admin/listings/${scenario.listingId}/moderation-actions`)
      .set("Origin", rm053Origin)
      .set("Cookie", scenario.adminCookie)
      .send({ action: "RESTORE" })
      .expect(201);
    expect((await listingState(scenario.listingId)).status).toBe("APPROVED");
    await expectPublicAndFavoriteVisibility(scenario, true);
    expect(await favoriteCount(scenario.tenantId, scenario.listingId)).toBe(1);
    const history = await fixture.pool.query<{
      previousStatus: string;
      newStatus: string;
      reason: string | null;
    }>({
      text: `SELECT previous_status::text AS "previousStatus", new_status::text AS "newStatus", reason
        FROM moderation_history WHERE listing_id = $1 ORDER BY id`,
      values: [scenario.listingId]
    });
    expect(history.rows).toStrictEqual([
      { previousStatus: "PENDING", newStatus: "APPROVED", reason: null },
      { previousStatus: "APPROVED", newStatus: "HIDDEN", reason: "RM-053 hide visibility verification" },
      { previousStatus: "HIDDEN", newStatus: "APPROVED", reason: null }
    ]);
  });

  it("keeps approved visibility through a normalized no-op and reorder, then suppresses it during a significant edit until re-approval", async () => {
    const scenario = await prepareApprovedScenario(2);
    const beforeNoop = await listingState(scenario.listingId);
    await request(scenario.app)
      .patch(`/api/v1/landlord/listings/${scenario.listingId}`)
      .set("Origin", rm053Origin)
      .set("Cookie", scenario.landlordCookie)
      .send({ title: `  ${listingInput.title}  ` })
      .expect(200)
      .expect(({ body }) => expect(body.data.status).toBe("APPROVED"));
    expect(await listingState(scenario.listingId)).toStrictEqual(beforeNoop);
    await expectPublicAndFavoriteVisibility(scenario, true);

    const ownerDetail = await request(scenario.app)
      .get(`/api/v1/landlord/listings/${scenario.listingId}`)
      .set("Cookie", scenario.landlordCookie)
      .expect(200);
    const currentImageIds = (ownerDetail.body.data.images as Array<{ id: number }>).map(({ id }) => id);
    const reorderedImageIds = [...currentImageIds].reverse();
    await request(scenario.app)
      .put(`/api/v1/landlord/listings/${scenario.listingId}/images/order`)
      .set("Origin", rm053Origin)
      .set("Cookie", scenario.landlordCookie)
      .send({ imageIds: reorderedImageIds })
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.map((image: { id: number }) => image.id)).toStrictEqual(reorderedImageIds)
      );
    const afterReorder = await listingState(scenario.listingId);
    expect(afterReorder.status).toBe("APPROVED");
    expect(afterReorder.updatedAt.getTime()).toBeGreaterThan(beforeNoop.updatedAt.getTime());
    await expectPublicAndFavoriteVisibility(scenario, true);

    await request(scenario.app)
      .patch(`/api/v1/landlord/listings/${scenario.listingId}`)
      .set("Origin", rm053Origin)
      .set("Cookie", scenario.landlordCookie)
      .send({ description: "RM-053 significant content change awaiting re-approval." })
      .expect(200)
      .expect(({ body }) => expect(body.data.status).toBe("PENDING"));
    expect((await listingState(scenario.listingId)).status).toBe("PENDING");
    await expectPublicAndFavoriteVisibility(scenario, false);
    expect(await favoriteCount(scenario.tenantId, scenario.listingId)).toBe(1);

    await request(scenario.app)
      .post(`/api/v1/admin/listings/${scenario.listingId}/moderation-actions`)
      .set("Origin", rm053Origin)
      .set("Cookie", scenario.adminCookie)
      .send({ action: "APPROVE" })
      .expect(201);
    expect((await listingState(scenario.listingId)).status).toBe("APPROVED");
    await expectPublicAndFavoriteVisibility(scenario, true);
    expect(await favoriteCount(scenario.tenantId, scenario.listingId)).toBe(1);
    const historyCount = await fixture.pool.query<{ count: number }>({
      text: "SELECT count(*)::integer AS count FROM moderation_history WHERE listing_id = $1",
      values: [scenario.listingId]
    });
    expect(historyCount.rows).toStrictEqual([{ count: 2 }]);
  });
});
