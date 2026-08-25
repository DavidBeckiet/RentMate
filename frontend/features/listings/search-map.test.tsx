import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MapBaseProps, MapViewport } from "../../components/map/map-base";
import type { PublicListingSummary } from "../../types/api";

const mapState = vi.hoisted(() => ({ props: null as unknown }));

vi.mock("../../components/map/map-base", () => ({
  MapBase: (props: MapBaseProps) => {
    mapState.props = props;
    return (
      <div role="region" aria-label={props.ariaLabel}>
        {props.markers?.map((marker) => (
          <span key={marker.id}>{marker.label}</span>
        ))}
      </div>
    );
  }
}));

vi.mock("../../components/map/map-search-control", () => ({
  MapSearchControl: ({
    viewport,
    onSearchRequested
  }: {
    viewport: MapViewport;
    onSearchRequested: (value: MapViewport) => void;
  }) => (
    <button type="button" onClick={() => onSearchRequested(viewport)}>
      Tìm trong khu vực này
    </button>
  )
}));

import { SearchMap } from "./search-map";

const viewport: MapViewport = {
  center: { latitude: 10.75, longitude: 106.7 },
  zoom: 13,
  bounds: { north: 10.9, south: 10.6, east: 106.9, west: 106.5 }
};

const listings: readonly PublicListingSummary[] = [
  {
    id: 1,
    businessStatus: "AVAILABLE",
    title: "Phòng A",
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
  },
  {
    id: 2,
    businessStatus: "UNKNOWN",
    title: "Phòng B",
    monthlyRent: 6_000_000,
    roomAreaSqm: 24,
    maxOccupants: null,
    areaName: "Quận 3",
    latitude: 10.78,
    longitude: 106.68,
    propertyType: { code: "STUDIO", label: "Studio" },
    amenities: [],
    coverImage: { url: "https://res.cloudinary.com/rentmate/image/upload/b.webp", altText: null, displayOrder: 1 },
    updatedAt: "2026-08-02T00:00:00.000Z"
  }
];

function props(
  overrides: Partial<React.ComponentProps<typeof SearchMap>> = {}
): React.ComponentProps<typeof SearchMap> {
  return {
    listings,
    pendingViewport: null,
    proposedRadiusCenter: null,
    selectingRadiusCenter: false,
    onViewportChange: vi.fn(),
    onSearchBounds: vi.fn(),
    onRadiusCenterSelected: vi.fn(),
    ...overrides
  };
}

describe("SearchMap", () => {
  it("uses provided public summaries as approximate markers without making a request", () => {
    render(<SearchMap {...props()} />);
    expect(screen.getByText(/Vị trí xấp xỉ/)).toBeInTheDocument();
    expect(screen.getByText("Phòng A — Quận 1")).toBeInTheDocument();
    expect(screen.getByText("Phòng B — Quận 3")).toBeInTheDocument();
    const received = mapState.props as MapBaseProps;
    expect(received.markers?.map((marker) => marker.position)).toEqual([
      { latitude: 10.77, longitude: 106.69 },
      { latitude: 10.78, longitude: 106.68 }
    ]);
    expect(screen.queryByText(/10\.77|106\.69/)).not.toBeInTheDocument();
  });

  it("stores viewport through its callback and emits bounds only from the explicit action", () => {
    const onViewportChange = vi.fn();
    const onSearchBounds = vi.fn();
    const view = render(<SearchMap {...props({ onViewportChange, onSearchBounds })} />);
    const received = mapState.props as MapBaseProps;

    received.onViewportChange?.(viewport);
    expect(onViewportChange).toHaveBeenCalledWith(viewport);
    expect(onSearchBounds).not.toHaveBeenCalled();

    view.rerender(<SearchMap {...props({ pendingViewport: viewport, onViewportChange, onSearchBounds })} />);
    fireEvent.click(screen.getByRole("button", { name: "Tìm trong khu vực này" }));
    expect(onSearchBounds).toHaveBeenCalledWith(viewport);
  });

  it("supports manual radius-center selection and a visible proposed-center marker", () => {
    const onRadiusCenterSelected = vi.fn();
    render(
      <SearchMap
        {...props({
          proposedRadiusCenter: { latitude: 10.75, longitude: 106.67 },
          selectingRadiusCenter: true,
          onRadiusCenterSelected
        })}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Chọn một điểm");
    expect(screen.getByText("Tâm tìm kiếm theo bán kính")).toBeInTheDocument();
    const received = mapState.props as MapBaseProps;
    received.onMapClick?.({ latitude: 10.74, longitude: 106.66 });
    expect(onRadiusCenterSelected).toHaveBeenCalledWith({ latitude: 10.74, longitude: 106.66 });
  });
});
