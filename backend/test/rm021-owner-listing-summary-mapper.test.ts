import { describe, expect, it } from "vitest";
import {
  mapOwnerListingSummaryRow,
  mapOwnerListingSummaryToDto,
  OwnerListingSummaryMappingError,
  type OwnerListingSummaryRow
} from "../src/modules/listings/owner-listing-summary-mapper.js";
import { listingStatuses } from "../src/modules/listings/owner-listing-mapper.js";

const emptyRow: OwnerListingSummaryRow = {
  id: 42,
  status: "DRAFT",
  title: null,
  monthly_rent: null,
  area_name: null,
  updated_at: "2026-07-29T07:15:00.000Z",
  property_type_code: null,
  property_type_label: null,
  cover_image_id: null,
  cover_image_url: null,
  cover_image_format: null,
  cover_image_width: null,
  cover_image_height: null,
  cover_image_byte_size: null,
  cover_image_display_order: null,
  cover_image_alt_text: null,
  cover_image_created_at: null,
  current_moderation_reason: null
};

describe("RM-021 owner listing summary mapper", () => {
  it("maps an incomplete draft to exact summary keys and frozen null projections", () => {
    const summary = mapOwnerListingSummaryRow(emptyRow);
    const dto = mapOwnerListingSummaryToDto(summary);

    expect(dto).toStrictEqual({
      id: 42,
      status: "DRAFT",
      title: null,
      monthlyRent: null,
      areaName: null,
      propertyType: null,
      coverImage: null,
      currentModerationReason: null,
      updatedAt: "2026-07-29T07:15:00.000Z"
    });
    expect(Object.keys(dto)).toStrictEqual([
      "id",
      "status",
      "title",
      "monthlyRent",
      "areaName",
      "propertyType",
      "coverImage",
      "currentModerationReason",
      "updatedAt"
    ]);
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(dto)).toBe(true);
  });

  it("maps whole rent, property type, and private owner cover image", () => {
    const dto = mapOwnerListingSummaryToDto(
      mapOwnerListingSummaryRow({
        ...emptyRow,
        status: "APPROVED",
        title: "Studio",
        monthly_rent: "7500000",
        area_name: "District 1",
        property_type_code: "STUDIO",
        property_type_label: "Studio",
        cover_image_id: 91,
        cover_image_url: "https://cdn.example.test/listing.webp",
        cover_image_format: "webp",
        cover_image_width: 1600,
        cover_image_height: 1200,
        cover_image_byte_size: 384210,
        cover_image_display_order: 1,
        cover_image_alt_text: null,
        cover_image_created_at: "2026-07-28T05:00:00.000Z"
      })
    );

    expect(dto).toMatchObject({
      monthlyRent: 7_500_000,
      propertyType: { code: "STUDIO", label: "Studio" },
      coverImage: {
        id: 91,
        url: "https://cdn.example.test/listing.webp",
        displayOrder: 1,
        altText: null
      }
    });
    expect(Object.isFrozen(dto.propertyType)).toBe(true);
    expect(Object.isFrozen(dto.coverImage)).toBe(true);
    expect(JSON.stringify(dto)).not.toMatch(
      /description|addressText|latitude|amenities|images|landlord|cloudinary|secure_url/i
    );
  });

  it.each(listingStatuses)("maps status %s with only an applicable current reason", (status) => {
    const currentReason = status === "REJECTED" ? "Needs changes" : status === "HIDDEN" ? "Policy issue" : null;
    const dto = mapOwnerListingSummaryToDto(
      mapOwnerListingSummaryRow({ ...emptyRow, status, current_moderation_reason: currentReason })
    );
    expect(dto.status).toBe(status);
    expect(dto.currentModerationReason).toBe(currentReason);
  });

  it.each(["REJECTED", "HIDDEN"] as const)("rejects missing current reason for %s", (status) => {
    expect(() => mapOwnerListingSummaryRow({ ...emptyRow, status })).toThrow(OwnerListingSummaryMappingError);
  });

  it("rejects a current reason for a non-applicable status", () => {
    expect(() =>
      mapOwnerListingSummaryRow({ ...emptyRow, status: "APPROVED", current_moderation_reason: "old reason" })
    ).toThrow(OwnerListingSummaryMappingError);
  });

  it.each([
    { ...emptyRow, id: 0 },
    { ...emptyRow, status: "UNKNOWN" },
    { ...emptyRow, monthly_rent: "1.5" },
    { ...emptyRow, property_type_code: "STUDIO", property_type_label: null },
    { ...emptyRow, cover_image_id: 1 },
    { ...emptyRow, updated_at: "invalid" }
  ])("rejects corrupt summary rows", (row) => {
    expect(() => mapOwnerListingSummaryRow(row)).toThrow(OwnerListingSummaryMappingError);
  });
});
