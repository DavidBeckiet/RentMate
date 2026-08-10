import { describe, expect, it } from "vitest";
import {
  createAdminListingDetail,
  mapAdminListingDetailRow,
  mapAdminListingDetailToDto
} from "../src/modules/listings/admin-listing-detail-mapper.js";
import {
  mapAdminListingSummaryRow,
  mapAdminListingSummaryToDto
} from "../src/modules/listings/admin-listing-summary-mapper.js";
import {
  mapModerationHistoryItemRow,
  mapModerationHistoryItemToDto
} from "../src/modules/listings/moderation-history-mapper.js";
import { mapOwnerImageRow } from "../src/modules/listings/owner-image-mapper.js";

const timestamp = "2026-08-09T07:15:00.000Z";

const detailRow = {
  id: 42,
  status: "REJECTED",
  title: "Studio",
  description: "Description",
  monthly_rent: "7500000",
  room_area_sqm: "28.50",
  address_text: "Exact address",
  area_name: "District 1",
  latitude: 10.772341,
  longitude: 106.697912,
  created_at: timestamp,
  updated_at: timestamp,
  property_type_code: "STUDIO",
  property_type_label: "Studio",
  landlord_id: 17,
  landlord_role: "LANDLORD",
  landlord_email: "owner@example.com",
  landlord_phone: "+84901234567",
  landlord_is_active: false
};

describe("RM-041 admin listing mappers", () => {
  it("maps the exact nullable admin summary and strict landlord projection", () => {
    const summary = mapAdminListingSummaryRow({
      id: 42,
      status: "DRAFT",
      title: null,
      area_name: null,
      landlord_id: 17,
      landlord_email: "owner@example.com",
      landlord_phone: "+84901234567",
      landlord_is_active: false,
      updated_at: timestamp
    });
    expect(mapAdminListingSummaryToDto(summary)).toStrictEqual({
      id: 42,
      status: "DRAFT",
      title: null,
      areaName: null,
      landlord: { id: 17, email: "owner@example.com", phone: "+84901234567", isActive: false },
      updatedAt: timestamp
    });
    expect(Object.keys(mapAdminListingSummaryToDto(summary)).sort()).toStrictEqual([
      "areaName",
      "id",
      "landlord",
      "status",
      "title",
      "updatedAt"
    ]);
  });

  it("composes canonical owner detail with exact landlord and owner image metadata", () => {
    const base = mapAdminListingDetailRow(detailRow);
    const image = mapOwnerImageRow({
      id: 91,
      secure_url: "https://cdn.example.test/image.webp",
      format: "webp",
      width: 800,
      height: 600,
      byte_size: 12345,
      display_order: 1,
      alt_text: null,
      created_at: timestamp
    });
    const detail = createAdminListingDetail(base, [{ code: "WIFI", label: "Wi-Fi" }], [image], "Latest rejection");
    const dto = mapAdminListingDetailToDto(detail);
    expect(dto).toMatchObject({
      id: 42,
      monthlyRent: 7_500_000,
      roomAreaSqm: 28.5,
      addressText: "Exact address",
      latitude: 10.772341,
      longitude: 106.697912,
      landlord: {
        id: 17,
        role: "LANDLORD",
        email: "owner@example.com",
        phone: "+84901234567",
        isActive: false
      },
      currentModerationReason: "Latest rejection"
    });
    expect(dto.images[0]).toStrictEqual({
      id: 91,
      url: "https://cdn.example.test/image.webp",
      format: "webp",
      width: 800,
      height: 600,
      byteSize: 12345,
      displayOrder: 1,
      altText: null,
      createdAt: timestamp
    });
  });

  it("maps the reusable exact seven-field moderation history DTO", () => {
    const item = mapModerationHistoryItemRow({
      id: 301,
      listing_id: 42,
      admin_id: 3,
      previous_status: "PENDING",
      new_status: "APPROVED",
      reason: null,
      created_at: timestamp
    });
    expect(mapModerationHistoryItemToDto(item)).toStrictEqual({
      id: 301,
      listingId: 42,
      adminId: 3,
      previousStatus: "PENDING",
      newStatus: "APPROVED",
      reason: null,
      createdAt: timestamp
    });
  });

  it("maps 1000 astral reason code points and rejects 1001", () => {
    const maximum = "😀".repeat(1_000);
    expect(
      mapModerationHistoryItemRow({
        id: 301,
        listing_id: 42,
        admin_id: 3,
        previous_status: "PENDING",
        new_status: "REJECTED",
        reason: maximum,
        created_at: timestamp
      }).reason
    ).toBe(maximum);
    expect(() =>
      mapModerationHistoryItemRow({
        id: 302,
        listing_id: 42,
        admin_id: 3,
        previous_status: "PENDING",
        new_status: "REJECTED",
        reason: `${maximum}😀`,
        created_at: timestamp
      })
    ).toThrow("Moderation history representation is invalid.");
  });

  it("fails closed for corrupt mandatory landlord/reason data", () => {
    expect(() => mapAdminListingDetailRow({ ...detailRow, landlord_phone: null })).toThrow(
      "Admin listing detail representation is invalid."
    );
    expect(() =>
      mapAdminListingSummaryRow({
        id: 1,
        status: "PENDING",
        title: "x",
        area_name: "y",
        landlord_id: 2,
        landlord_email: "owner@example.com",
        landlord_phone: null,
        landlord_is_active: true,
        updated_at: timestamp
      })
    ).toThrow("Admin listing summary representation is invalid.");
    expect(() =>
      mapModerationHistoryItemRow({
        id: 1,
        listing_id: 2,
        admin_id: 3,
        previous_status: "PENDING",
        new_status: "REJECTED",
        reason: " ",
        created_at: timestamp
      })
    ).toThrow("Moderation history representation is invalid.");
  });
});
