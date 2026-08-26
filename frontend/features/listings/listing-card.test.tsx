import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicListingSummary } from "../../types/api";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />
}));

import { ListingCard } from "./listing-card";

function listing(overrides: Partial<PublicListingSummary> = {}): PublicListingSummary {
  return {
    id: 42,
    title: "Studio sáng gần trung tâm",
    monthlyRent: 7_500_000,
    roomAreaSqm: 28.5,
    maxOccupants: null,
    areaName: "Bến Thành, Quận 1",
    latitude: 10.772,
    longitude: 106.698,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [{ code: "WIFI", label: "Wi-Fi" }],
    coverImage: { url: "https://res.cloudinary.com/rentmate/image/upload/studio.webp", altText: null, displayOrder: 1 },
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
    businessStatus: overrides.businessStatus ?? "AVAILABLE"
  };
}

describe("ListingCard", () => {
  it("shows the optional maximum occupancy without leaking it when absent", () => {
    const view = render(<ListingCard listing={listing({ maxOccupants: 2 })} />);
    expect(screen.getByText("2 người tối đa")).toBeInTheDocument();
    view.rerender(<ListingCard listing={listing({ maxOccupants: null })} />);
    expect(screen.queryByText("2 người tối đa")).not.toBeInTheDocument();
  });

  it("renders only the public summary presentation and detail link", () => {
    render(<ListingCard listing={listing()} />);

    expect(screen.getByRole("link", { name: /Studio sáng gần trung tâm/ })).toHaveAttribute("href", "/listings/42");
    expect(screen.getByText(/7[.\s]500[.\s]000/)).toBeInTheDocument();
    expect(screen.getByText(/28,5 m²/)).toHaveTextContent("Studio");
    expect(screen.getByText("Bến Thành, Quận 1")).toBeInTheDocument();
    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ảnh của Studio sáng gần trung tâm" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/landlord|addressText|moderation|106\.698/i);
  });

  it("renders distance only when the radius result supplies it and respects backend alt text", () => {
    const view = render(
      <ListingCard
        listing={listing({
          distanceKm: 2.34,
          coverImage: {
            url: "https://res.cloudinary.com/rentmate/image/upload/a.webp",
            altText: "Phòng có cửa sổ",
            displayOrder: 1
          }
        })}
      />
    );
    expect(screen.getByText("2,3 km")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Phòng có cửa sổ" })).toBeInTheDocument();

    view.rerender(<ListingCard listing={listing()} />);
    expect(screen.queryByText(/ km$/)).not.toBeInTheDocument();
  });

  it("shows the verified landlord badge without exposing landlord identity", () => {
    render(<ListingCard listing={listing({ landlordVerified: true })} />);

    expect(screen.getByText(/\u0110\u00e3 x\u00e1c minh/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/landlordId|landlord_id|owner@example.com|\+84901234567/i);
  });

  it("uses a restrained placeholder for a defensive runtime payload without a cover image", () => {
    const withoutCover = { ...listing(), coverImage: null } as unknown as PublicListingSummary;
    render(<ListingCard listing={withoutCover} />);

    expect(screen.getByRole("img", { name: "Chưa có ảnh cho Studio sáng gần trung tâm" })).toBeInTheDocument();
  });

  it("supports map selection without changing the listing link", () => {
    const onMapFocus = vi.fn();
    const onMapSelect = vi.fn();
    render(
      <ListingCard listing={listing()} variant="search" mapSelected onMapFocus={onMapFocus} onMapSelect={onMapSelect} />
    );

    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("id", "listing-card-42");
    expect(card).toHaveAttribute("aria-current", "true");
    fireEvent.mouseEnter(card);
    fireEvent.focus(screen.getByRole("link", { name: /Studio sáng gần trung tâm/ }));
    fireEvent.click(screen.getByRole("button", { name: "Xem Studio sáng gần trung tâm trên bản đồ" }));

    expect(onMapFocus).toHaveBeenCalledTimes(2);
    expect(onMapSelect).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /Studio sáng gần trung tâm/ })).toHaveAttribute("href", "/listings/42");
  });
});
