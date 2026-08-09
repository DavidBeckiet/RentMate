import { describe, expect, it } from "vitest";
import {
  mapPublicListingDetailRow,
  mapTenantPublicListingDetailResult
} from "../src/modules/listings/public-listing-detail-mapper.js";

const row = {
  id: 42,
  title: "Public studio",
  description: "A complete public description.",
  monthly_rent: "7500000",
  room_area_sqm: "28.50",
  area_name: "District 1",
  latitude: 10.772549,
  longitude: 106.697912,
  property_type_code: "STUDIO",
  property_type_label: "Studio",
  amenities: [
    { code: "WIFI", label: "Wi-Fi" },
    { code: "PARKING", label: "Parking" }
  ],
  images: [
    { url: "https://cdn.example.test/third.webp", altText: null, displayOrder: 3 },
    { url: "https://cdn.example.test/first.webp", altText: "First image", displayOrder: 1 }
  ],
  updated_at: "2026-07-29T07:15:00.000Z",
  address_text: "PRIVATE_ADDRESS",
  landlord_id: 17,
  moderation_reason: "PRIVATE_REASON",
  cloudinary_public_id: "PRIVATE_PROVIDER_ID"
};

describe("RM-037 public listing detail mapper", () => {
  it("maps the exact base DTO with rounded coordinates and deterministic aggregates", () => {
    const mapped = mapPublicListingDetailRow(row);
    expect(mapped).toStrictEqual({
      id: 42,
      title: "Public studio",
      description: "A complete public description.",
      monthlyRent: 7500000,
      roomAreaSqm: 28.5,
      areaName: "District 1",
      latitude: 10.773,
      longitude: 106.698,
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [
        { code: "PARKING", label: "Parking" },
        { code: "WIFI", label: "Wi-Fi" }
      ],
      images: [
        { url: "https://cdn.example.test/first.webp", altText: "First image", displayOrder: 1 },
        { url: "https://cdn.example.test/third.webp", altText: null, displayOrder: 3 }
      ],
      updatedAt: "2026-07-29T07:15:00.000Z"
    });
    expect(Object.keys(mapped).sort()).toStrictEqual(
      [
        "id",
        "title",
        "description",
        "monthlyRent",
        "roomAreaSqm",
        "areaName",
        "latitude",
        "longitude",
        "propertyType",
        "amenities",
        "images",
        "updatedAt"
      ].sort()
    );
    expect(mapped).not.toHaveProperty("coverImage");
    expect(mapped).not.toHaveProperty("distanceKm");
    expect(mapped).not.toHaveProperty("createdAt");
    expect(JSON.stringify(mapped)).not.toMatch(/PRIVATE_|address|landlord|moderation|cloudinary|provider/i);
    expect(Object.keys(mapped.images[0]!).sort()).toStrictEqual(["altText", "displayOrder", "url"]);
  });

  it("maps only current landlord email and phone in the tenant result", () => {
    const mapped = mapTenantPublicListingDetailResult({
      ...row,
      landlord_email: "owner@example.com",
      landlord_phone: "+84901234567"
    });
    expect(mapped.landlordContact).toStrictEqual({ email: "owner@example.com", phone: "+84901234567" });
    expect(Object.keys(mapped.landlordContact!).sort()).toStrictEqual(["email", "phone"]);
  });

  it.each([
    ["missing images", { images: [] }],
    ["malformed images", { images: [{ url: "http://unsafe.test/a", altText: null, displayOrder: 1 }] }],
    ["duplicate image slots", { images: row.images.map((image) => ({ ...image, displayOrder: 1 })) }],
    ["null description", { description: null }],
    ["blank description", { description: " " }],
    ["long description", { description: "x".repeat(5_001) }],
    ["rent", { monthly_rent: "7.5" }],
    ["area", { room_area_sqm: "1.234" }],
    ["timestamp", { updated_at: "not-a-time" }],
    ["latitude", { latitude: Number.NaN }],
    ["longitude", { longitude: 181 }],
    ["property type", { property_type_code: "bad" }],
    ["amenities", { amenities: [{ code: "bad", label: "Wi-Fi" }] }]
  ])("rejects %s as an internal invariant", (_label, override) => {
    expect(() => mapPublicListingDetailRow({ ...row, ...override })).toThrow();
  });

  it.each([
    [null, "+84901234567"],
    ["OWNER@EXAMPLE.COM", "+84901234567"],
    ["owner@example.com", null],
    ["owner@example.com", "0901234567"]
  ])("rejects malformed tenant contact", (email, phone) => {
    expect(() =>
      mapTenantPublicListingDetailResult({ ...row, landlord_email: email, landlord_phone: phone })
    ).toThrow();
  });
});
