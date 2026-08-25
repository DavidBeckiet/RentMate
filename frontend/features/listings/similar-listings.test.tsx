import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicListingSummary } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ listSimilar: vi.fn() }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return { ...actual, api: { listings: { listSimilar: apiMocks.listSimilar } } };
});
vi.mock("./listing-card", () => ({
  ListingCard: ({ listing }: { listing: PublicListingSummary }) => <article>card:{listing.title}</article>
}));

import { SimilarListings } from "./similar-listings";

const listing: PublicListingSummary = {
  id: 51,
  businessStatus: "AVAILABLE",
  title: "Phòng sáng gần chợ",
  monthlyRent: 5_500_000,
  roomAreaSqm: 24,
  maxOccupants: 2,
  areaName: "Quận 3",
  latitude: 10.78,
  longitude: 106.69,
  propertyType: { code: "STUDIO", label: "Studio" },
  amenities: [],
  coverImage: { url: "https://example.com/room.webp", altText: null, displayOrder: 1 },
  updatedAt: "2026-08-25T00:00:00.000Z"
};

describe("SimilarListings", () => {
  beforeEach(() => {
    apiMocks.listSimilar.mockReset();
  });

  it("renders up to the backend-provided nearby suggestions", async () => {
    apiMocks.listSimilar.mockResolvedValue({
      data: [listing],
      pagination: { page: 1, pageSize: 3, hasNextPage: false }
    });
    render(<SimilarListings listingId={42} />);

    expect(await screen.findByRole("heading", { name: "Phòng tương tự trong khu vực" })).toBeInTheDocument();
    expect(screen.getByText("card:Phòng sáng gần chợ")).toBeInTheDocument();
    expect(apiMocks.listSimilar).toHaveBeenCalledWith(42, expect.any(AbortSignal));
  });

  it("does not add an empty section when no public room matches", async () => {
    apiMocks.listSimilar.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 3, hasNextPage: false } });
    render(<SimilarListings listingId={42} />);

    await waitFor(() => expect(apiMocks.listSimilar).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Phòng tương tự trong khu vực" })).not.toBeInTheDocument();
  });
});
