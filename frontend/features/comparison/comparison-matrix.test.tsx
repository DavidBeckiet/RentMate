import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComparisonListing } from "./comparison-data";

vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock("./share-listing-control", () => ({
  ShareListingControl: ({ listingId }: { listingId: number }) => <button>chia-sẻ:{listingId}</button>
}));

vi.mock("../roommate/roommate-listing-cta", () => ({ RoommateListingCta: () => null }));

import { ComparisonMatrix } from "./comparison-matrix";

function listing(id: number): ComparisonListing {
  return {
    id,
    title: `Phòng ${id}`,
    monthlyRent: 4_000_000 + id * 100_000,
    roomAreaSqm: 20 + id,
    maxOccupants: 2,
    areaName: id % 2 === 0 ? "Quận 3" : "Bình Thạnh",
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [{ code: "WIFI", label: "Wi-Fi" }],
    coverImage: null,
    landlordVerified: id % 2 === 0,
    businessStatus: "AVAILABLE",
    updatedAt: "2026-09-07T00:00:00.000Z"
  };
}

describe("ComparisonMatrix", () => {
  it.each([2, 3, 4])("aligns %s listing columns in one scrollable matrix", (count) => {
    const listings = Array.from({ length: count }, (_, index) => listing(index + 1));
    render(<ComparisonMatrix listings={listings} needs={null} onRemove={vi.fn()} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(count + 1);
    expect(screen.getAllByText("Phòng 1")).toHaveLength(1);
    expect(screen.getByText("Khu vực")).toBeInTheDocument();
    expect(screen.getByText("Tiêu chí")).toBeInTheDocument();
  });

  it("shows amenity differences and does not render a giant image card", () => {
    const left = listing(1);
    const right = { ...listing(2), amenities: [{ code: "PARKING", label: "Chỗ để xe" }] };
    render(<ComparisonMatrix listings={[left, right]} needs={null} onRemove={vi.fn()} />);

    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();
    expect(screen.getByText("Chỗ để xe")).toBeInTheDocument();
    expect(screen.getAllByText("Khác biệt").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Bảng so sánh tin đăng" })).toHaveAttribute("tabindex", "0");
  });
});
