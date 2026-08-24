import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import {
  createRm053DatabaseFixture,
  rm053AdminEmail,
  rm053AdminPassword,
  rm053Jpeg,
  rm053Origin
} from "./helpers/rm053-backend-fixture.js";
import { readTestDatabaseUrl } from "./support/test-database.js";

const fixture = createRm053DatabaseFixture();
const listingInput = Object.freeze({
  title: "RM-053 fresh backend listing",
  description: "A complete cross-module listing verified through the assembled backend.",
  monthlyRent: 7_500_000,
  propertyTypeCode: "STUDIO",
  roomAreaSqm: 28.5,
  addressText: "53 Private Street, Ben Thanh Ward, Ho Chi Minh City",
  areaName: "Ben Thanh, District 1",
  latitude: 10.772341,
  longitude: 106.697912,
  amenityCodes: ["WIFI", "PARKING"]
});

const publicSummaryKeys = [
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
];

const publicDetailKeys = [
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
];

const activationStateQuery = `SELECT
  landlord.is_active AS "isActive",
  listing.status::text AS status,
  (SELECT count(*)::integer FROM moderation_history WHERE listing_id = listing.id) AS "historyCount",
  (SELECT count(*)::integer FROM favorites WHERE tenant_id = $2 AND listing_id = listing.id) AS "favoriteCount"
FROM listings AS listing
JOIN users AS landlord ON landlord.id = listing.landlord_id
WHERE listing.id = $1`;

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

function expectExactKeys(value: unknown, keys: readonly string[]): void {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  expect(Object.keys(value as object).sort()).toStrictEqual([...keys].sort());
}

function expectNoPublicPrivateFields(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(listingInput.addressText);
  expect(serialized).not.toContain("cloudinaryPublicId");
  expect(serialized).not.toContain("addressText");
  expect(serialized).not.toContain("landlordId");
  expect(serialized).not.toContain("moderationHistory");
  expect(serialized).not.toContain("passwordHash");
  expect(serialized).not.toContain("snake_case");
}

describe("RM-053 fresh migrated backend journey", () => {
  afterAll(async () => {
    await fixture.dropKnownFrozenSchema();
    await fixture.close();
  });

  it("boots an empty test database and keeps one listing consistent through registration, moderation, privacy, favorites, and landlord activation", async () => {
    await fixture.dropKnownFrozenSchema();
    const configuredTestDatabaseName = decodeURIComponent(new URL(readTestDatabaseUrl()).pathname.slice(1));
    expect(await fixture.currentDatabaseName()).toBe(configuredTestDatabaseName);
    await expect(fixture.bootstrap()).resolves.toMatchObject({
      appliedMigrationCount: 12,
      lastAppliedMigrationVersion: 12,
      schema: {
        enumCount: 2,
        tableCount: 8,
        constraintCount: 52,
        explicitIndexCount: 10,
        propertyTypeCount: 5,
        amenityCount: 12
      },
      admin: { outcome: "created" }
    });

    const appFixture = await fixture.createApp();
    const { app } = appFixture;
    const health = await request(app).get("/api/health").expect(200);
    expect(health.body).toStrictEqual({ status: "ok", database: "connected" });

    const landlordRegistration = await request(app)
      .post("/api/v1/auth/register/landlord")
      .set("Origin", rm053Origin)
      .send({ email: "rm053.landlord.fresh@example.test", password: "Rm053LandlordPass123", phone: "+84911111111" })
      .expect(201);
    const landlordId = landlordRegistration.body.data.id as number;
    const landlordCookie = cookieFrom(landlordRegistration);
    expect(landlordRegistration.body.data).toMatchObject({ id: landlordId, role: "LANDLORD", isActive: true });

    const tenantRegistration = await request(app)
      .post("/api/v1/auth/register/tenant")
      .set("Origin", rm053Origin)
      .send({ email: "rm053.tenant.fresh@example.test", password: "Rm053TenantPass123", phone: "+84912222222" })
      .expect(201);
    const tenantId = tenantRegistration.body.data.id as number;
    const tenantCookie = cookieFrom(tenantRegistration);
    expect(tenantRegistration.body.data).toMatchObject({ id: tenantId, role: "TENANT", isActive: true });

    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", rm053Origin)
      .send({ email: rm053AdminEmail, password: rm053AdminPassword })
      .expect(200);
    const adminCookie = cookieFrom(adminLogin);
    expect(adminLogin.body.data.role).toBe("ADMIN");

    const propertyTypes = await request(app).get("/api/v1/lookups/property-types").expect(200);
    const amenities = await request(app).get("/api/v1/lookups/amenities").expect(200);
    expect(propertyTypes.body.data).toContainEqual({ code: "STUDIO", label: "Studio" });
    expect(amenities.body.data).toContainEqual({ code: "WIFI", label: "Wi-Fi" });

    const draft = await request(app)
      .post("/api/v1/landlord/listings")
      .set("Origin", rm053Origin)
      .set("Cookie", landlordCookie)
      .send({})
      .expect(201);
    const listingId = draft.body.data.id as number;
    expect(draft.body.data.status).toBe("DRAFT");

    const completed = await request(app)
      .patch(`/api/v1/landlord/listings/${listingId}`)
      .set("Origin", rm053Origin)
      .set("Cookie", landlordCookie)
      .send(listingInput)
      .expect(200);
    expect(completed.body.data).toMatchObject({
      id: listingId,
      status: "DRAFT",
      addressText: listingInput.addressText
    });

    const beforeGeocoding = await fixture.pool.query({
      text: "SELECT status, address_text, latitude, longitude, updated_at FROM listings WHERE id = $1",
      values: [listingId]
    });
    const geocoding = await request(app)
      .post("/api/v1/geocoding/forward")
      .set("Origin", rm053Origin)
      .set("Cookie", landlordCookie)
      .send({ addressText: listingInput.addressText })
      .expect(200);
    expect(geocoding.body.data).toStrictEqual([
      { displayName: "Ben Thanh, Ho Chi Minh City", latitude: 10.772341987, longitude: 106.697912345 }
    ]);
    expect(appFixture.nominatim.forwardGeocode).toHaveBeenCalledTimes(1);
    await expect(
      fixture.pool.query({
        text: "SELECT status, address_text, latitude, longitude, updated_at FROM listings WHERE id = $1",
        values: [listingId]
      })
    ).resolves.toStrictEqual(beforeGeocoding);

    const uploadedImage = await request(app)
      .post(`/api/v1/landlord/listings/${listingId}/images`)
      .set("Origin", rm053Origin)
      .set("Cookie", landlordCookie)
      .field("altText", "RM-053 fresh image")
      .attach("image", rm053Jpeg, { filename: "rm053.jpg", contentType: "image/jpeg" })
      .expect(201);
    expect(uploadedImage.body.data).toMatchObject({ displayOrder: 1, altText: "RM-053 fresh image" });
    expect(uploadedImage.body.data).not.toHaveProperty("cloudinaryPublicId");
    const imageRows = await fixture.pool.query<{ count: number; displayOrder: number }>({
      text: `SELECT count(*)::integer AS count, min(display_order)::integer AS "displayOrder"
             FROM listing_images WHERE listing_id = $1`,
      values: [listingId]
    });
    expect(imageRows.rows).toStrictEqual([{ count: 1, displayOrder: 1 }]);
    expect(appFixture.cloudinary.events).toStrictEqual(["upload:image/jpeg"]);

    const submitted = await request(app)
      .post(`/api/v1/landlord/listings/${listingId}/submit`)
      .set("Origin", rm053Origin)
      .set("Cookie", landlordCookie)
      .expect(200);
    expect(submitted.body.data.status).toBe("PENDING");

    const adminQueue = await request(app)
      .get("/api/v1/admin/listings?status=PENDING")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(ids(adminQueue)).toContain(listingId);
    const adminPendingDetail = await request(app)
      .get(`/api/v1/admin/listings/${listingId}`)
      .set("Cookie", adminCookie)
      .expect(200);
    expect(adminPendingDetail.body.data).toMatchObject({
      id: listingId,
      status: "PENDING",
      addressText: listingInput.addressText,
      landlord: { id: landlordId, email: "rm053.landlord.fresh@example.test", phone: "+84911111111" }
    });

    const approval = await request(app)
      .post(`/api/v1/admin/listings/${listingId}/moderation-actions`)
      .set("Origin", rm053Origin)
      .set("Cookie", adminCookie)
      .send({ action: "APPROVE" })
      .expect(201);
    expect(approval.body.data).toMatchObject({ listingId, previousStatus: "PENDING", newStatus: "APPROVED" });
    const history = await request(app)
      .get(`/api/v1/admin/listings/${listingId}/moderation-actions`)
      .set("Cookie", adminCookie)
      .expect(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({ listingId, previousStatus: "PENDING", newStatus: "APPROVED" });

    const ordinary = await request(app)
      .get(`/api/v1/listings?q=${encodeURIComponent(listingInput.title)}`)
      .expect(200);
    const bounds = await request(app)
      .get("/api/v1/listings?north=10.80&south=10.70&east=106.72&west=106.68")
      .expect(200);
    const radius = await request(app)
      .get(`/api/v1/listings?centerLat=${listingInput.latitude}&centerLng=${listingInput.longitude}&radiusKm=1`)
      .expect(200);
    expect(ids(ordinary)).toContain(listingId);
    expect(ids(bounds)).toContain(listingId);
    expect(ids(radius)).toContain(listingId);
    const publicSummary = ordinary.body.data.find((item: { id: number }) => item.id === listingId);
    expectExactKeys(publicSummary, publicSummaryKeys);
    expect(typeof publicSummary.monthlyRent).toBe("number");
    expect(typeof publicSummary.roomAreaSqm).toBe("number");
    expect(typeof publicSummary.latitude).toBe("number");
    expect(typeof publicSummary.longitude).toBe("number");
    expect(typeof radius.body.data.find((item: { id: number }) => item.id === listingId).distanceKm).toBe("number");
    expectNoPublicPrivateFields({ ordinary: ordinary.body, bounds: bounds.body, radius: radius.body });

    const anonymousDetail = await request(app).get(`/api/v1/listings/${listingId}`).expect(200);
    expectExactKeys(anonymousDetail.body.data, publicDetailKeys);
    expectNoPublicPrivateFields(anonymousDetail.body);
    const tenantDetail = await request(app)
      .get(`/api/v1/listings/${listingId}`)
      .set("Cookie", tenantCookie)
      .expect(200);
    expectExactKeys(tenantDetail.body.data, [...publicDetailKeys, "landlordContact"]);
    expect(tenantDetail.body.data.landlordContact).toStrictEqual({
      email: "rm053.landlord.fresh@example.test",
      phone: "+84911111111"
    });
    const ownerDetail = await request(app)
      .get(`/api/v1/landlord/listings/${listingId}`)
      .set("Cookie", landlordCookie)
      .expect(200);
    expect(ownerDetail.body.data).toMatchObject({
      addressText: listingInput.addressText,
      latitude: listingInput.latitude,
      longitude: listingInput.longitude
    });
    const adminApprovedDetail = await request(app)
      .get(`/api/v1/admin/listings/${listingId}`)
      .set("Cookie", adminCookie)
      .expect(200);
    expect(adminApprovedDetail.body.data).toMatchObject({
      addressText: listingInput.addressText,
      landlord: { id: landlordId }
    });

    await request(app)
      .put(`/api/v1/favorites/${listingId}`)
      .set("Origin", rm053Origin)
      .set("Cookie", tenantCookie)
      .expect(204);
    const visibleFavorites = await request(app).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(200);
    expect(ids(visibleFavorites)).toContain(listingId);
    expectExactKeys(visibleFavorites.body.data[0], publicSummaryKeys);
    expectNoPublicPrivateFields(visibleFavorites.body);
    expect(
      (
        await fixture.pool.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM favorites WHERE tenant_id = $1 AND listing_id = $2",
          [tenantId, listingId]
        )
      ).rows
    ).toStrictEqual([{ count: 1 }]);

    await request(app)
      .patch(`/api/v1/admin/users/${landlordId}/activation`)
      .set("Origin", rm053Origin)
      .set("Cookie", adminCookie)
      .send({ isActive: false })
      .expect(200);
    const inactiveState = await fixture.pool.query<{
      isActive: boolean;
      status: string;
      historyCount: number;
      favoriteCount: number;
    }>({
      text: activationStateQuery,
      values: [listingId, tenantId]
    });
    expect(inactiveState.rows).toStrictEqual([
      { isActive: false, status: "APPROVED", historyCount: 1, favoriteCount: 1 }
    ]);
    expect(
      ids(
        await request(app)
          .get(`/api/v1/listings?q=${encodeURIComponent(listingInput.title)}`)
          .expect(200)
      )
    ).not.toContain(listingId);
    expect(
      ids(await request(app).get("/api/v1/listings?north=10.80&south=10.70&east=106.72&west=106.68").expect(200))
    ).not.toContain(listingId);
    expect(
      ids(
        await request(app)
          .get(`/api/v1/listings?centerLat=${listingInput.latitude}&centerLng=${listingInput.longitude}&radiusKm=1`)
          .expect(200)
      )
    ).not.toContain(listingId);
    await request(app).get(`/api/v1/listings/${listingId}`).expect(404);
    expect(ids(await request(app).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(200))).not.toContain(
      listingId
    );

    await request(app)
      .patch(`/api/v1/admin/users/${landlordId}/activation`)
      .set("Origin", rm053Origin)
      .set("Cookie", adminCookie)
      .send({ isActive: true })
      .expect(200);
    const reactivatedState = await fixture.pool.query<{
      isActive: boolean;
      status: string;
      historyCount: number;
      favoriteCount: number;
    }>({
      text: activationStateQuery,
      values: [listingId, tenantId]
    });
    expect(reactivatedState.rows).toStrictEqual([
      { isActive: true, status: "APPROVED", historyCount: 1, favoriteCount: 1 }
    ]);
    expect(
      ids(
        await request(app)
          .get(`/api/v1/listings?q=${encodeURIComponent(listingInput.title)}`)
          .expect(200)
      )
    ).toContain(listingId);
    expect(
      ids(await request(app).get("/api/v1/listings?north=10.80&south=10.70&east=106.72&west=106.68").expect(200))
    ).toContain(listingId);
    expect(
      ids(
        await request(app)
          .get(`/api/v1/listings?centerLat=${listingInput.latitude}&centerLng=${listingInput.longitude}&radiusKm=1`)
          .expect(200)
      )
    ).toContain(listingId);
    await request(app).get(`/api/v1/listings/${listingId}`).expect(200);
    expect(ids(await request(app).get("/api/v1/favorites").set("Cookie", tenantCookie).expect(200))).toContain(
      listingId
    );
  });
});
