import assert from "node:assert/strict";
import test from "node:test";
import { mapPublicInquiryListingSummary } from "./public-inquiry-listing-summary.js";

test("maps only public-safe listing context for an inquiry", () => {
  const summary = mapPublicInquiryListingSummary({
    id: 243,
    businessStatus: "AVAILABLE",
    title: "Studio có ban công tại Bình Thạnh",
    monthlyRent: 6500000,
    roomAreaSqm: 32,
    maxOccupants: 2,
    areaName: "Bình Thạnh",
    latitude: 10.801,
    longitude: 106.714,
    propertyType: { code: "STUDIO", label: "Căn studio" },
    amenities: [],
    coverImage: { url: "https://example.test/studio.webp", altText: "Phòng studio", displayOrder: 1 },
    landlordVerified: true,
    updatedAt: "2026-09-04T00:00:00.000Z"
  });

  assert.deepEqual(summary, {
    id: 243,
    title: "Studio có ban công tại Bình Thạnh",
    propertyType: { code: "STUDIO", label: "Căn studio" },
    monthlyRent: 6500000,
    roomAreaSqm: 32,
    areaName: "Bình Thạnh",
    businessStatus: "AVAILABLE",
    coverImage: { url: "https://example.test/studio.webp", altText: "Phòng studio", displayOrder: 1 }
  });
  assert.equal("latitude" in summary, false);
  assert.equal("longitude" in summary, false);
});
