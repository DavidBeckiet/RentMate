import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiPage, PublicListingSummary } from "../../types/api";

const navigation = vi.hoisted(() => ({ query: "", push: vi.fn() }));
const apiMocks = vi.hoisted(() => ({
  searchPublic: vi.fn(),
  listPropertyTypes: vi.fn(),
  listAmenities: vi.fn(),
  listPublicAreas: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ push: navigation.push })
}));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      lookups: {
        listPropertyTypes: apiMocks.listPropertyTypes,
        listAmenities: apiMocks.listAmenities,
        listPublicAreas: apiMocks.listPublicAreas
      },
      listings: { searchPublic: apiMocks.searchPublic }
    }
  };
});

vi.mock("./listing-card", () => ({
  ListingCardSkeleton: () => <div data-testid="listing-card-skeleton" />,
  ListingCard: ({
    listing,
    mapSelected,
    onMapFocus,
    onMapSelect
  }: {
    listing: PublicListingSummary;
    mapSelected?: boolean;
    onMapFocus?: () => void;
    onMapSelect?: () => void;
  }) => (
    <article
      data-testid={`card-${listing.id}`}
      aria-current={mapSelected ? "true" : undefined}
      onMouseEnter={onMapFocus}
      onFocus={onMapFocus}
    >
      <button type="button" onClick={onMapSelect}>
        card:{listing.title}
      </button>
    </article>
  )
}));

vi.mock("./search-filters", () => ({
  SearchFilters: ({
    committed,
    onApply,
    onClear,
    onOpenMap
  }: {
    committed: { q?: string; amenities: readonly string[]; sort: "newest" | "rent_asc" | "rent_desc" | "distance_asc" };
    onApply: (values: { q?: string; amenities: readonly string[] }, sort: "newest") => void;
    onClear: () => void;
    onOpenMap?: () => void;
  }) => (
    <div>
      <span>filter:{committed.q ?? "browse"}</span>
      {onOpenMap ? (
        <button type="button" onClick={onOpenMap}>
          Mở bản đồ
        </button>
      ) : null}
      <button type="button" onClick={() => onApply({ q: "applied", amenities: [] }, "newest")}>
        Apply mock filter
      </button>
      <button type="button" onClick={onClear}>
        Xóa bộ lọc
      </button>
    </div>
  )
}));

vi.mock("./radius-controls", () => ({
  RadiusControls: ({
    onCommit
  }: {
    onCommit: (center: { latitude: number; longitude: number }, radius: number) => void;
  }) => (
    <button type="button" onClick={() => onCommit({ latitude: 10.75, longitude: 106.67 }, 75)}>
      Commit radius
    </button>
  )
}));

vi.mock("./search-map", () => ({
  SearchMap: ({
    listings,
    pendingViewport,
    onViewportChange,
    onSearchBounds,
    activeListingId,
    onListingSelect
  }: {
    listings: readonly PublicListingSummary[];
    pendingViewport: null | {
      center: { latitude: number; longitude: number };
      zoom: number;
      bounds: { north: number; south: number; east: number; west: number };
    };
    onViewportChange: (viewport: {
      center: { latitude: number; longitude: number };
      zoom: number;
      bounds: { north: number; south: number; east: number; west: number };
    }) => void;
    onSearchBounds: (viewport: {
      center: { latitude: number; longitude: number };
      zoom: number;
      bounds: { north: number; south: number; east: number; west: number };
    }) => void;
    activeListingId: number | null;
    onListingSelect: (listingId: number) => void;
  }) => {
    const viewport = {
      center: { latitude: 10.75, longitude: 106.7 },
      zoom: 13,
      bounds: { north: 10.9, south: 10.6, east: 106.9, west: 106.5 }
    };
    return (
      <div>
        {listings.map((listing) => (
          <button
            key={listing.id}
            type="button"
            aria-label={`marker:${listing.title}`}
            aria-pressed={activeListingId === listing.id}
            onClick={() => onListingSelect(listing.id)}
          >
            marker:{listing.title}
          </button>
        ))}
        <button type="button" onClick={() => onViewportChange(viewport)}>
          Move map
        </button>
        {pendingViewport ? (
          <button type="button" onClick={() => onSearchBounds(pendingViewport)}>
            Tìm trong khu vực này
          </button>
        ) : null}
      </div>
    );
  }
}));

import { ApiError } from "../../lib/api/client";
import { SearchPage } from "./search-page";

function listing(id: number, title: string): PublicListingSummary {
  return {
    id,
    businessStatus: "AVAILABLE",
    title,
    monthlyRent: 5_000_000,
    roomAreaSqm: 20,
    maxOccupants: null,
    areaName: "Quận 1",
    latitude: 10.77,
    longitude: 106.69,
    propertyType: { code: "ROOM", label: "Room" },
    amenities: [],
    coverImage: { url: "https://res.cloudinary.com/rentmate/image/upload/a.webp", altText: null, displayOrder: 1 },
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function page(data: readonly PublicListingSummary[], current = 1, hasNextPage = false): ApiPage<PublicListingSummary> {
  return { data, pagination: { page: current, pageSize: 20, hasNextPage } };
}

beforeEach(() => {
  navigation.query = "";
  navigation.push.mockReset();
  apiMocks.searchPublic.mockReset();
  apiMocks.listPropertyTypes.mockReset().mockResolvedValue([{ code: "ROOM", label: "Room" }]);
  apiMocks.listAmenities.mockReset().mockResolvedValue([{ code: "WIFI", label: "Wi-Fi" }]);
  apiMocks.listPublicAreas.mockReset().mockResolvedValue(["Quan 1", "Quan 3"]);
});

describe("SearchPage", () => {
  it("makes one V1-09 call and feeds the same response to cards and map", async () => {
    navigation.query = "sort=newest";
    apiMocks.searchPublic.mockResolvedValue(page([listing(1, "Phòng A"), listing(2, "Phòng B")]));
    render(<SearchPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Đang tìm tin đăng");
    expect(await screen.findByText("card:Phòng A")).toBeInTheDocument();
    expect(screen.getByText("card:Phòng B")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem bản đồ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Bản đồ khám phá" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "card:Phòng A" }));
    expect(screen.getByText("marker:Phòng A")).toBeInTheDocument();
    expect(screen.getByText("marker:Phòng B")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Bản đồ khám phá" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng bản đồ" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đóng bản đồ" }));
    expect(screen.queryByRole("dialog", { name: "Bản đồ khám phá" })).not.toBeInTheDocument();
    expect(apiMocks.searchPublic).toHaveBeenCalledTimes(1);
    expect(apiMocks.searchPublic).toHaveBeenCalledWith(
      { page: 1, pageSize: 20, sort: "newest" },
      expect.any(AbortSignal)
    );
  });

  it("syncs map selection with cards and opens the map from a card action", async () => {
    navigation.query = "sort=newest";
    apiMocks.searchPublic.mockResolvedValue(page([listing(1, "Phòng A"), listing(2, "Phòng B")]));
    render(<SearchPage />);
    await screen.findByText("card:Phòng A");

    fireEvent.click(screen.getByRole("button", { name: "card:Phòng A" }));
    expect(screen.getByRole("dialog", { name: "Bản đồ khám phá" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng bản đồ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "marker:Phòng A" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "marker:Phòng B" }));
    expect(screen.getByTestId("card-2")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("card-1")).not.toHaveAttribute("aria-current");
  });

  it("does not search on map movement, then commits bounds and searches once after URL changes", async () => {
    navigation.query = "sort=newest";
    apiMocks.searchPublic.mockResolvedValue(page([listing(1, "Phòng A")]));
    const view = render(<SearchPage />);
    await screen.findByText("card:Phòng A");
    expect(apiMocks.searchPublic).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "card:Phòng A" }));
    fireEvent.click(screen.getByRole("button", { name: "Move map" }));
    expect(apiMocks.searchPublic).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Tìm trong khu vực này" }));
    expect(navigation.push).toHaveBeenLastCalledWith("/search?north=10.9&south=10.6&east=106.9&west=106.5");
    expect(apiMocks.searchPublic).toHaveBeenCalledTimes(1);

    navigation.query = "north=10.9&south=10.6&east=106.9&west=106.5";
    view.rerender(<SearchPage />);
    await waitFor(() => expect(apiMocks.searchPublic).toHaveBeenCalledTimes(2));
  });

  it("commits radius without bounds, with distance sort and no frontend maximum", async () => {
    navigation.query = "north=10.9&south=10.6&east=106.9&west=106.5&page=3";
    apiMocks.searchPublic.mockResolvedValue(page([]));
    render(<SearchPage />);
    await waitFor(() => expect(apiMocks.searchPublic).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Mở bản đồ" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit radius" }));
    expect(navigation.push).toHaveBeenCalledWith(
      "/search?centerLat=10.75&centerLng=106.67&radiusKm=75&sort=distance_asc"
    );
  });

  it("renders empty, 422 recovery, explicit retry, and no total count", async () => {
    navigation.query = "sort=newest";
    const validationError = new ApiError({
      status: 422,
      code: "VALIDATION_FAILED",
      message: "private backend detail",
      requestId: "req-search",
      category: "backend"
    });
    apiMocks.searchPublic.mockRejectedValueOnce(validationError).mockResolvedValueOnce(page([]));
    render(<SearchPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("chưa hợp lệ");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private backend detail");
    expect(screen.getByText(/req-search/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("heading", { name: "Không tìm thấy phòng phù hợp", level: 3 })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/tổng|kết quả trên tổng/i);
  });

  it("shows actual query context and Vietnamese presentation labels for active filters", async () => {
    navigation.query = "q=studio&areaName=Qu%E1%BA%ADn+3&propertyType=STUDIO&amenities=AIR_CONDITIONING";
    apiMocks.listPropertyTypes.mockResolvedValue([{ code: "STUDIO", label: "Studio" }]);
    apiMocks.listAmenities.mockResolvedValue([{ code: "AIR_CONDITIONING", label: "Air conditioning" }]);
    apiMocks.searchPublic.mockResolvedValue(page([listing(1, "Studio")]));
    render(<SearchPage />);

    await screen.findByText("card:Studio");
    expect(screen.getByTitle("Quận 3 · studio")).toBeInTheDocument();
    expect(screen.getByText("Loại: Căn studio")).toBeInTheDocument();
    expect(screen.getByText("Tiện ích: Điều hòa")).toBeInTheDocument();
  });

  it("uses page/hasNextPage only and preserves query during pagination", async () => {
    navigation.query = "q=studio&page=2";
    apiMocks.searchPublic.mockResolvedValue(page([listing(1, "Studio")], 2, true));
    render(<SearchPage />);
    await screen.findByText("card:Studio");
    expect(screen.getAllByText("Trang 2").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(navigation.push).toHaveBeenCalledWith("/search?q=studio");
    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(navigation.push).toHaveBeenCalledWith("/search?q=studio&page=3");
  });

  it("syncs the committed filter on back/forward URL changes", async () => {
    navigation.query = "q=first";
    apiMocks.searchPublic.mockResolvedValue(page([]));
    const view = render(<SearchPage />);
    expect(await screen.findByText("filter:first")).toBeInTheDocument();

    navigation.query = "q=second";
    view.rerender(<SearchPage />);
    expect(await screen.findByText("filter:second")).toBeInTheDocument();

    navigation.query = "q=first";
    view.rerender(<SearchPage />);
    expect(await screen.findByText("filter:first")).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.searchPublic).toHaveBeenCalledTimes(3));
  });

  it("ignores an aborted stale response that resolves after the current URL response", async () => {
    let resolveFirst: ((value: ApiPage<PublicListingSummary>) => void) | undefined;
    let resolveSecond: ((value: ApiPage<PublicListingSummary>) => void) | undefined;
    apiMocks.searchPublic
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        })
      );
    const view = render(<SearchPage />);
    await waitFor(() => expect(apiMocks.searchPublic).toHaveBeenCalledOnce());

    navigation.query = "q=current";
    view.rerender(<SearchPage />);
    await waitFor(() => expect(apiMocks.searchPublic).toHaveBeenCalledTimes(2));
    resolveSecond?.(page([listing(2, "Current")]));
    expect(await screen.findByText("card:Current")).toBeInTheDocument();
    resolveFirst?.(page([listing(1, "Stale")]));
    await waitFor(() => expect(screen.queryByText("card:Stale")).not.toBeInTheDocument());
    expect(screen.getByText("card:Current")).toBeInTheDocument();
  });

  it("handles malformed known query locally without calling V1-09", () => {
    navigation.query = "north=10.9&south=10.6&east=106.9";
    render(<SearchPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("chưa có đủ bốn cạnh");
    expect(apiMocks.searchPublic).not.toHaveBeenCalled();
  });
});
