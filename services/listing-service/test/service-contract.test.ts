import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityAccountClient } from "../../shared/identity-account-client.js";
import { createListingCatalogClient } from "../../shared/listing-catalog-client.js";

const publicSummary = {
  id: 42,
  businessStatus: "AVAILABLE",
  title: "Studio sáng",
  monthlyRent: 7_500_000,
  roomAreaSqm: 28,
  maxOccupants: null,
  areaName: "Quận 1",
  latitude: 10.772,
  longitude: 106.698,
  propertyType: { code: "STUDIO", label: "Studio" },
  amenities: [],
  coverImage: { url: "https://example.com/cover.webp", altText: null, displayOrder: 1 },
  updatedAt: "2026-08-25T00:00:00.000Z"
} as const;

const roommateTenantProjection = {
  tenantId: 7,
  role: "TENANT",
  displayName: "Minh Anh",
  isActive: true,
  memberSince: "2025-11",
  emailVerified: true,
  phoneVerified: false
} as const;
const roommateRiskProjection = {
  tenantId: 7,
  createdAt: "2025-11-02T00:00:00.000Z"
} as const;

test("Identity and Listing clients enforce internal headers and DTO contracts", async () => {
  const requests: Array<{ path: string; headers: Headers }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ path: `${url.pathname}${url.search}`, headers: new Headers(init?.headers) });

    if (url.pathname === "/internal/v1/accounts/7") {
      return Response.json({ data: { id: 7, role: "LANDLORD", isActive: true } });
    }
    if (url.pathname === "/internal/v1/landlords/verified-ids") {
      return Response.json({ data: [7] });
    }
    if (url.pathname === "/internal/v1/roommate-tenant-projections") {
      return Response.json({
        data: [{ ...roommateTenantProjection, email: "private@example.com", phone: "+84900000000" }]
      });
    }
    if (url.pathname === "/internal/v1/roommate-risk-projections") {
      return Response.json({ data: [roommateRiskProjection] });
    }
    if (url.pathname === "/internal/v1/listings/public-summaries") {
      return Response.json({ data: [publicSummary] });
    }
    return new Response(null, { status: 404 });
  };

  const identity = createIdentityAccountClient({
    baseUrl: "http://identity:4100/",
    internalToken: "internal-secret",
    fetcher
  });
  const listing = createListingCatalogClient({
    baseUrl: "http://listing:4200",
    internalToken: "internal-secret",
    fetcher
  });

  assert.deepEqual(await identity.loadAuthenticationAccount(7), { id: 7, role: "LANDLORD", isActive: true });
  assert.deepEqual(await identity.loadVerifiedLandlordIds([7]), [7]);
  assert.deepEqual(await identity.loadRoommateTenantProjectionsByIds([7]), [roommateTenantProjection]);
  assert.deepEqual(await identity.loadRoommateRiskProjectionsByIds([7]), [roommateRiskProjection]);
  assert.deepEqual(await listing.loadPublicSummariesByIds([42]), [publicSummary]);
  assert.equal(requests.length, 5);
  assert.ok(requests.every(({ headers }) => headers.get("x-rentmate-internal-token") === "internal-secret"));
  assert.equal(requests[1]?.path, "/internal/v1/landlords/verified-ids?ids=7");
  assert.equal(requests[2]?.path, "/internal/v1/roommate-tenant-projections?ids=7");
  assert.equal(requests[3]?.path, "/internal/v1/roommate-risk-projections?ids=7");
  assert.equal(requests[4]?.path, "/internal/v1/listings/public-summaries?ids=42");
});

test("service clients reject malformed internal responses instead of exposing them to callers", async () => {
  const identity = createIdentityAccountClient({
    baseUrl: "http://identity:4100",
    internalToken: "internal-secret",
    fetcher: async () => Response.json({ data: { id: "7" } })
  });
  const listing = createListingCatalogClient({
    baseUrl: "http://listing:4200",
    internalToken: "internal-secret",
    fetcher: async () => Response.json({ data: [{ ...publicSummary, providerId: "secret" }] })
  });

  await assert.rejects(() => identity.loadAuthenticationAccount(7), /response is invalid/i);
  const [summary] = await listing.loadPublicSummariesByIds([42]);
  assert.deepEqual(summary, publicSummary);
  assert.equal("providerId" in (summary ?? {}), false);

  const invalidRoommateProjection = createIdentityAccountClient({
    baseUrl: "http://identity:4100",
    internalToken: "internal-secret",
    fetcher: async () => Response.json({ data: [{ ...roommateTenantProjection, memberSince: "November 2025" }] })
  });
  await assert.rejects(
    () => invalidRoommateProjection.loadRoommateTenantProjectionsByIds([7]),
    /roommate tenant response is invalid/i
  );

  const invalidRoommateRiskProjection = createIdentityAccountClient({
    baseUrl: "http://identity:4100",
    internalToken: "internal-secret",
    fetcher: async () => Response.json({ data: [{ tenantId: 7, createdAt: "not-a-timestamp" }] })
  });
  await assert.rejects(
    () => invalidRoommateRiskProjection.loadRoommateRiskProjectionsByIds([7]),
    /roommate risk response is invalid/i
  );
});
