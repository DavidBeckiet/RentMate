import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicListingSummary } from "../../types/api";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />
}));

import { SearchMapListingPopup } from "./search-map-listing-popup";

const listing: PublicListingSummary = {
  id: 42,
  businessStatus: "AVAILABLE",
  title: "Studio sáng gần trung tâm",
  monthlyRent: 7_500_000,
  roomAreaSqm: 28.5,
  maxOccupants: 2,
  areaName: "Bến Thành, Quận 1",
  latitude: 10.772,
  longitude: 106.698,
  propertyType: { code: "STUDIO", label: "Studio" },
  amenities: [{ code: "WIFI", label: "Wi-Fi" }],
  coverImage: {
    url: "https://res.cloudinary.com/rentmate/image/upload/studio.webp",
    altText: null,
    displayOrder: 1
  },
  updatedAt: "2026-08-01T00:00:00.000Z"
};

describe("SearchMapListingPopup", () => {
  it("renders the public listing summary and navigates to detail", () => {
    render(<SearchMapListingPopup listing={listing} />);

    expect(screen.getByRole("heading", { name: listing.title })).toBeInTheDocument();
    expect(screen.getByText(/7[.\s]500[.\s]000/)).toBeInTheDocument();
    expect(screen.getByText("28,5 m²")).toBeInTheDocument();
    expect(screen.getByText("2 người tối đa")).toBeInTheDocument();
    expect(screen.getByText("Còn phòng")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem chi tiết" })).toHaveAttribute("href", "/listings/42");
    expect(document.body).not.toHaveTextContent(/106\.698|landlord|addressText|moderation|reporter/i);
  });
});
