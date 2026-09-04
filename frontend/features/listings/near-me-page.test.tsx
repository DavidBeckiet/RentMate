import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapBaseProps, MapMarker } from "../../components/map/map-base";
import type { ApiPage, PublicListingSummary } from "../../types/api";

const apiMocks = vi.hoisted(() => ({ searchPublic: vi.fn() }));
const mapMocks = vi.hoisted(() => ({ props: null as MapBaseProps | null }));

vi.mock("../../lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api/client")>("../../lib/api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      listings: { ...actual.api.listings, searchPublic: apiMocks.searchPublic }
    }
  };
});

vi.mock("../../components/map/map-base", () => ({
  MapBase: (props: MapBaseProps) => {
    mapMocks.props = props;
    return (
      <div role="region" aria-label={props.ariaLabel}>
        {(props.markers ?? []).map((marker: MapMarker) => (
          <button
            key={marker.id}
            type="button"
            aria-label={`marker:${marker.label}`}
            aria-pressed={marker.selected === true}
            data-display-label={marker.displayLabel ?? ""}
            onClick={() => props.onMarkerSelect?.(marker.id)}
          >
            {marker.displayLabel ?? marker.label}
          </button>
        ))}
        {(props.markers ?? [])
          .filter((marker) => marker.openPopup && marker.popup)
          .map((marker) => (
            <div key={`popup-${marker.id}`} role="dialog" aria-label={`Xem trước ${marker.label}`}>
              {marker.popup}
            </div>
          ))}
      </div>
    );
  }
}));

vi.mock("../../components/ui/media-image", () => ({
  MediaImage: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />
}));
vi.mock("../../components/ui/listing-save-control", () => ({ ListingSaveControl: () => null }));
vi.mock("../comparison/comparison-toggle", () => ({ ComparisonToggle: () => null }));

import { NearMePage } from "./near-me-page";

function listing(
  id: number,
  title: string,
  distanceKm: number,
  roomAreaSqm = id === 1 ? 20 : 32
): PublicListingSummary {
  return {
    id,
    businessStatus: "AVAILABLE",
    title,
    monthlyRent: id === 1 ? 4_200_000 : 6_500_000,
    roomAreaSqm,
    maxOccupants: 2,
    areaName: id === 1 ? "Tân Bình" : "Bình Thạnh",
    latitude: 10.77 + id / 1000,
    longitude: 106.69 + id / 1000,
    propertyType: { code: "ROOM", label: "Room" },
    amenities: [],
    coverImage: {
      url: `https://res.cloudinary.com/rentmate/image/upload/room-${id}.webp`,
      altText: null,
      displayOrder: 1
    },
    distanceKm,
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
}

function page(data: readonly PublicListingSummary[]): ApiPage<PublicListingSummary> {
  return { data, pagination: { page: 1, pageSize: 30, hasNextPage: false } };
}

beforeEach(() => {
  apiMocks.searchPublic.mockReset();
  mapMocks.props = null;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});

describe("NearMePage", () => {
  it("uses the distance-sorted API response for the summary, rail, and price markers", async () => {
    apiMocks.searchPublic.mockResolvedValue(page([listing(1, "Phòng gần", 0.45), listing(2, "Phòng xa", 2.3)]));
    render(<NearMePage />);

    fireEvent.click(screen.getByRole("button", { name: "ĐH CNTT" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng trong bán kính" }));

    expect(
      await screen.findByRole("heading", { name: "Tìm thấy 2 phòng trong bán kính 5 km.", level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByText("450 m")).toBeInTheDocument();
    expect(screen.getByText("2,3 km")).toBeInTheDocument();
    const railLink = screen.getByRole("link", { name: /Phòng gần/ });
    expect(railLink).toHaveAttribute("href", "/listings/1");
    expect(railLink).toHaveAttribute("target", "_blank");
    expect(railLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Vị trí chỉ dùng để tìm phòng xung quanh và không được lưu lại.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/10\.87|106\.8031/);

    expect(apiMocks.searchPublic).toHaveBeenCalledWith({
      centerLat: 10.87,
      centerLng: 106.8031,
      radiusKm: 5,
      sort: "distance_asc",
      page: 1,
      pageSize: 30
    });
    await waitFor(() => expect(mapMocks.props?.markers).toHaveLength(3));
    expect(mapMocks.props?.markers?.[0]).toMatchObject({ id: "search-center", variant: "center" });
    expect(mapMocks.props?.markers?.slice(1)).toMatchObject([
      { id: 1, variant: "price", displayLabel: "4,2tr", selected: false },
      { id: 2, variant: "price", displayLabel: "6,5tr", selected: false }
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.mouseEnter(document.getElementById("near-me-listing-1") as HTMLElement);
    expect(mapMocks.props?.markers?.slice(1)).toMatchObject([
      { id: 1, selected: false, openPopup: false },
      { id: 2, selected: false, openPopup: false }
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /marker:Phòng xa/ }));
    expect(document.getElementById("near-me-listing-2")).toHaveAttribute("aria-current", "true");
    expect(mapMocks.props?.markers?.[2]).toMatchObject({ id: 2, selected: true });
    const preview = await screen.findByRole("dialog", { name: /Phòng xa/ });
    expect(preview).toHaveTextContent("6,5 triệu/tháng");
    expect(preview).toHaveTextContent("Bình Thạnh");
    expect(preview).toHaveTextContent("Cách 2,3 km");
    expect(preview).toHaveTextContent("32 m²");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const popupLink = screen.getByRole("link", { name: "Xem chi tiết" });
    expect(popupLink).toHaveAttribute("href", "/listings/2");
    expect(popupLink).toHaveAttribute("target", "_blank");
    expect(popupLink).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.click(screen.getByRole("button", { name: /marker:Phòng gần/ }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: /Phòng gần/ })).toHaveTextContent("Cách 450 m");
  });

  it("does not invent an area value when the public listing has no usable size", async () => {
    apiMocks.searchPublic.mockResolvedValue(page([listing(1, "Phòng chưa có diện tích", 0.45, 0)]));
    render(<NearMePage />);

    fireEvent.click(screen.getByRole("button", { name: "ĐH CNTT" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng trong bán kính" }));
    await screen.findByRole("heading", { name: "Tìm thấy 1 phòng trong bán kính 5 km.", level: 2 });
    fireEvent.click(screen.getByRole("button", { name: /marker:Phòng chưa có diện tích/ }));

    const preview = await screen.findByRole("dialog", { name: /Phòng chưa có diện tích/ });
    expect(preview).toHaveTextContent("Cách 450 m");
    expect(preview).not.toHaveTextContent("m²");
  });

  it("refreshes with the selected radius while keeping the explicit distance sort", async () => {
    apiMocks.searchPublic.mockResolvedValue(page([listing(1, "Phòng gần", 0.45)]));
    render(<NearMePage />);

    fireEvent.click(screen.getByRole("button", { name: "ĐH CNTT" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng trong bán kính" }));
    await screen.findByRole("heading", { name: "Tìm thấy 1 phòng trong bán kính 5 km.", level: 2 });

    fireEvent.click(screen.getByRole("button", { name: "10 km" }));
    await waitFor(() => expect(apiMocks.searchPublic).toHaveBeenCalledTimes(2), { timeout: 1500 });
    expect(apiMocks.searchPublic).toHaveBeenLastCalledWith({
      centerLat: 10.87,
      centerLng: 106.8031,
      radiusKm: 10,
      sort: "distance_asc",
      page: 1,
      pageSize: 30
    });
  });

  it("renders the exact zero-result state from the committed radius", async () => {
    apiMocks.searchPublic.mockResolvedValue(page([]));
    render(<NearMePage />);

    fireEvent.click(screen.getByRole("button", { name: "ĐH CNTT" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm phòng trong bán kính" }));

    expect(
      await screen.findByRole("heading", { name: "Không tìm thấy phòng trong bán kính 5 km.", level: 2 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Không tìm thấy phòng trong bán kính 5 km.", level: 3 })
    ).toBeInTheDocument();
  });

  it("explains a denied GPS permission without issuing a search request", () => {
    Object.defineProperty(window.navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) =>
          error?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 })
      }
    });
    render(<NearMePage />);

    fireEvent.click(screen.getByRole("button", { name: "Dùng vị trí hiện tại" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Không thể lấy vị trí");
    expect(apiMocks.searchPublic).not.toHaveBeenCalled();
  });
});
