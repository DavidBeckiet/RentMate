import { describe, expect, it } from "vitest";
import type { PublicListingDetail } from "../../types/api";
import { projectComparisonListing } from "./comparison-data";

const detail: PublicListingDetail = {
  id: 7,
  title: "Studio Quận 3",
  description: "Mô tả không đi vào Compare.",
  monthlyRent: 5_000_000,
  roomAreaSqm: 25,
  maxOccupants: 2,
  areaName: "Quận 3",
  latitude: 10.77,
  longitude: 106.69,
  propertyType: { code: "STUDIO", label: "Studio" },
  amenities: [{ code: "WIFI", label: "Wi-Fi" }],
  images: [],
  landlordVerified: true,
  hasReported: false,
  landlordContact: { email: "private@example.com", phone: "0900000000" },
  businessStatus: "AVAILABLE",
  updatedAt: "2026-09-07T00:00:00.000Z"
};

describe("projectComparisonListing", () => {
  it("keeps only public-safe comparison fields", () => {
    const projected = projectComparisonListing(detail);

    expect(projected).toMatchObject({ id: 7, title: "Studio Quận 3", monthlyRent: 5_000_000 });
    expect(projected).not.toHaveProperty("description");
    expect(projected).not.toHaveProperty("landlordContact");
    expect(projected).not.toHaveProperty("latitude");
    expect(projected).not.toHaveProperty("longitude");
  });
});
