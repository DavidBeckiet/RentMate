import { describe, expect, it } from "vitest";
import { mapPublicListingSummaryRow } from "../src/modules/listings/public-listing-summary-mapper.js";

const row = {
  id: 42,
  title: "Studio",
  monthly_rent: "7500000",
  room_area_sqm: "28.50",
  area_name: "District 1",
  latitude: 10.772549,
  longitude: -106.697912,
  property_type_code: "STUDIO",
  property_type_label: "Studio",
  amenities: [
    { code: "WIFI", label: "Wi-Fi" },
    { code: "PARKING", label: "Parking" }
  ],
  cover_image_url: "https://cdn.example.test/cover.webp",
  cover_image_alt_text: null,
  cover_image_display_order: 2,
  updated_at: "2026-07-29T07:15:00.000Z"
};

describe("RM-035 public listing summary mapper", () => {
  it("maps strict database values to the exact privacy-safe public DTO", () => {
    const mapped = mapPublicListingSummaryRow(row);
    expect(mapped).toStrictEqual({
      id: 42,
      title: "Studio",
      monthlyRent: 7500000,
      roomAreaSqm: 28.5,
      areaName: "District 1",
      latitude: 10.773,
      longitude: -106.698,
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [
        { code: "PARKING", label: "Parking" },
        { code: "WIFI", label: "Wi-Fi" }
      ],
      coverImage: { url: "https://cdn.example.test/cover.webp", altText: null, displayOrder: 2 },
      updatedAt: "2026-07-29T07:15:00.000Z"
    });
    expect(Object.keys(mapped).sort()).toStrictEqual(
      [
        "id",
        "title",
        "monthlyRent",
        "roomAreaSqm",
        "areaName",
        "latitude",
        "longitude",
        "propertyType",
        "amenities",
        "coverImage",
        "updatedAt"
      ].sort()
    );
    expect(JSON.stringify(mapped)).not.toMatch(/address|landlord|contact|cloudinary|provider|moderation|status/i);
  });

  it.each([
    ["malformed rent", { monthly_rent: "7.5" }],
    ["out-of-domain rent", { monthly_rent: "0" }],
    ["malformed area", { room_area_sqm: "1.234" }],
    ["out-of-domain area", { room_area_sqm: "0" }],
    ["timestamp", { updated_at: "not-a-time" }],
    ["latitude", { latitude: Number.NaN }],
    ["longitude", { longitude: 181 }],
    ["missing cover", { cover_image_url: null, cover_image_display_order: null }],
    ["amenity aggregate", { amenities: { code: "WIFI" } }],
    ["amenity item", { amenities: [{ code: "bad", label: "Wi-Fi" }] }]
  ])("rejects %s as an internal invariant", (_name, override) => {
    expect(() => mapPublicListingSummaryRow({ ...row, ...override })).toThrow();
  });
});
