import { describe, expect, it } from "vitest";
import {
  createOwnerListing,
  mapCreatedListingRow,
  mapOwnerListingToDto,
  OwnerListingMappingError,
  type CreatedListingRow
} from "../src/modules/listings/owner-listing-mapper.js";

const emptyRow: CreatedListingRow = {
  id: 42,
  status: "DRAFT",
  title: null,
  description: null,
  monthly_rent: null,
  room_area_sqm: null,
  address_text: null,
  area_name: null,
  latitude: null,
  longitude: null,
  created_at: "2026-08-04T01:00:00.000Z",
  updated_at: "2026-08-04T01:00:00.000Z"
};

describe("RM-020 owner listing mapper", () => {
  it("maps an empty draft to the exact frozen owner DTO", () => {
    const listing = createOwnerListing(mapCreatedListingRow(emptyRow), null, []);
    const dto = mapOwnerListingToDto(listing);

    expect(dto).toStrictEqual({
      id: 42,
      status: "DRAFT",
      title: null,
      description: null,
      monthlyRent: null,
      roomAreaSqm: null,
      addressText: null,
      areaName: null,
      latitude: null,
      longitude: null,
      propertyType: null,
      amenities: [],
      images: [],
      currentModerationReason: null,
      createdAt: "2026-08-04T01:00:00.000Z",
      updatedAt: "2026-08-04T01:00:00.000Z"
    });
    expect(Object.keys(dto)).toStrictEqual([
      "id",
      "status",
      "title",
      "description",
      "monthlyRent",
      "roomAreaSqm",
      "addressText",
      "areaName",
      "latitude",
      "longitude",
      "propertyType",
      "amenities",
      "images",
      "currentModerationReason",
      "createdAt",
      "updatedAt"
    ]);
    expect(Object.isFrozen(listing)).toBe(true);
    expect(Object.isFrozen(dto)).toBe(true);
    expect(Object.isFrozen(dto.images)).toBe(true);
    expect(Object.isFrozen(dto.amenities)).toBe(true);
  });

  it("maps PostgreSQL numerics and timestamps while preserving exact coordinates", () => {
    const listing = createOwnerListing(
      mapCreatedListingRow({
        ...emptyRow,
        title: "Studio",
        monthly_rent: "7500000",
        room_area_sqm: "28.50",
        latitude: 10.772341,
        longitude: 106.697912,
        created_at: new Date("2026-08-04T01:00:00.000Z")
      }),
      { code: "STUDIO", label: "Studio" },
      [
        { code: "WIFI", label: "Wi-Fi" },
        { code: "FURNISHED", label: "Furnished" }
      ]
    );
    const dto = mapOwnerListingToDto(listing);

    expect(dto).toMatchObject({
      monthlyRent: 7_500_000,
      roomAreaSqm: 28.5,
      latitude: 10.772341,
      longitude: 106.697912,
      propertyType: { code: "STUDIO", label: "Studio" },
      amenities: [
        { code: "FURNISHED", label: "Furnished" },
        { code: "WIFI", label: "Wi-Fi" }
      ],
      createdAt: "2026-08-04T01:00:00.000Z"
    });
    expect(Object.isFrozen(dto.propertyType)).toBe(true);
    expect(dto.amenities.every(Object.isFrozen)).toBe(true);
  });

  it("never exposes landlord, lookup, snake-case, or provider fields", () => {
    const dto = mapOwnerListingToDto(createOwnerListing(mapCreatedListingRow(emptyRow), null, []));
    const serialized = JSON.stringify(dto);

    expect(dto).not.toHaveProperty("landlordId");
    expect(dto).not.toHaveProperty("propertyTypeId");
    expect(serialized).not.toMatch(/amenityId|monthly_rent|created_at|cloudinary|secureUrl/i);
  });

  it.each([
    { ...emptyRow, id: 0 },
    { ...emptyRow, status: "PENDING" },
    { ...emptyRow, monthly_rent: "1.5" },
    { ...emptyRow, room_area_sqm: "1.234" },
    { ...emptyRow, latitude: 10, longitude: null },
    { ...emptyRow, created_at: "not-a-timestamp" }
  ])("rejects an invalid database row representation", (row) => {
    expect(() => mapCreatedListingRow(row)).toThrow(OwnerListingMappingError);
  });
});
