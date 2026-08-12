import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ComponentType, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapBaseProps, MapViewport } from "./map-base";

interface MapEvents {
  moveend?: () => void;
  click?: (event: { latlng: { lat: number; lng: number } }) => void;
}

interface MarkerEvents {
  dragend?: (event: { target: { getLatLng: () => { lat: number; lng: number } } }) => void;
}

const dynamicMock = vi.hoisted(() => ({
  loaders: [] as Array<() => Promise<unknown>>,
  options: [] as Array<{ ssr: boolean; loading: () => ReactNode }>
}));

const leafletMocks = vi.hoisted(() => {
  const state = {
    center: { lat: 10.77, lng: 106.7 },
    zoom: 13,
    bounds: { north: 10.9, south: 10.6, east: 106.9, west: 106.5 },
    events: {} as MapEvents,
    markerEvents: new Map<string, MarkerEvents>(),
    tile: null as null | { url: string; attribution: string },
    setView: vi.fn()
  };
  const map = {
    getCenter: () => state.center,
    getZoom: () => state.zoom,
    getBounds: () => ({
      getNorth: () => state.bounds.north,
      getSouth: () => state.bounds.south,
      getEast: () => state.bounds.east,
      getWest: () => state.bounds.west
    }),
    setView: state.setView
  };
  return { state, map };
});

vi.mock("next/dynamic", () => ({
  default: (
    loader: () => Promise<unknown>,
    options: { ssr: boolean; loading: () => ReactNode }
  ): ComponentType<MapBaseProps> => {
    dynamicMock.loaders.push(loader);
    dynamicMock.options.push(options);
    return function DynamicMapMock() {
      return options.loading();
    };
  }
}));

vi.mock("leaflet", () => ({ Icon: class Icon {} }));
vi.mock("leaflet/dist/images/marker-icon.png", () => ({ default: "marker-icon.png" }));
vi.mock("leaflet/dist/images/marker-icon-2x.png", () => ({ default: "marker-icon-2x.png" }));
vi.mock("leaflet/dist/images/marker-shadow.png", () => ({ default: "marker-shadow.png" }));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, className }: { children: ReactNode; className: string }) => (
    <div data-testid="leaflet-container" className={className}>
      {children}
    </div>
  ),
  TileLayer: ({ url, attribution }: { url: string; attribution: string }) => {
    leafletMocks.state.tile = { url, attribution };
    return <div data-testid="tile-layer" />;
  },
  Marker: ({ children, title, eventHandlers }: { children: ReactNode; title: string; eventHandlers: MarkerEvents }) => {
    leafletMocks.state.markerEvents.set(title, eventHandlers);
    return <div data-testid={`marker-${title}`}>{children}</div>;
  },
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useMap: () => leafletMocks.map,
  useMapEvents: (events: MapEvents) => {
    leafletMocks.state.events = events;
    return leafletMocks.map;
  }
}));

import LeafletMap from "./leaflet-map";
import { MapBase } from "./map-base";
import { MapSearchControl } from "./map-search-control";

const initialViewport: MapViewport = {
  center: { latitude: 10.77, longitude: 106.7 },
  zoom: 13,
  bounds: { north: 10.9, south: 10.6, east: 106.9, west: 106.5 }
};

beforeEach(() => {
  leafletMocks.state.center = { lat: 10.77, lng: 106.7 };
  leafletMocks.state.zoom = 13;
  leafletMocks.state.bounds = { north: 10.9, south: 10.6, east: 106.9, west: 106.5 };
  leafletMocks.state.events = {};
  leafletMocks.state.markerEvents.clear();
  leafletMocks.state.tile = null;
  leafletMocks.state.setView.mockClear();
});

describe("MapBase client boundary", () => {
  it("uses a no-SSR dynamic boundary with an accessible loading fallback", () => {
    render(<MapBase ariaLabel="Bản đồ phòng trọ" center={initialViewport.center} zoom={initialViewport.zoom} />);

    expect(dynamicMock.options).toHaveLength(1);
    expect(dynamicMock.options[0]?.ssr).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải bản đồ…");
  });
});

describe("LeafletMap", () => {
  it("uses standard OSM tiles, visible attribution, and responsive containment", () => {
    render(<LeafletMap ariaLabel="Bản đồ kết quả" center={initialViewport.center} zoom={initialViewport.zoom} />);

    const region = screen.getByRole("region", { name: "Bản đồ kết quả" });
    expect(region).toHaveClass("h-80", "w-full", "overflow-hidden", "sm:h-96", "lg:h-[28rem]");
    expect(leafletMocks.state.tile).toEqual({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: expect.stringContaining("OpenStreetMap")
    });
  });

  it("updates viewport on moveend but searches only after the explicit action using the latest viewport", () => {
    const onSearchRequested = vi.fn();

    function Harness() {
      const [viewport, setViewport] = useState(initialViewport);
      return (
        <>
          <LeafletMap
            ariaLabel="Bản đồ tìm kiếm"
            center={initialViewport.center}
            zoom={initialViewport.zoom}
            onViewportChange={setViewport}
          />
          <MapSearchControl viewport={viewport} onSearchRequested={onSearchRequested} />
        </>
      );
    }

    render(<Harness />);
    leafletMocks.state.center = { lat: 10.81, lng: 106.72 };
    leafletMocks.state.bounds = { north: 10.95, south: 10.67, east: 106.91, west: 106.53 };
    act(() => leafletMocks.state.events.moveend?.());
    expect(onSearchRequested).not.toHaveBeenCalled();

    leafletMocks.state.zoom = 14;
    leafletMocks.state.bounds = { north: 10.9, south: 10.7, east: 106.85, west: 106.59 };
    act(() => leafletMocks.state.events.moveend?.());
    expect(onSearchRequested).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Tìm trong khu vực này" }));
    expect(onSearchRequested).toHaveBeenCalledTimes(1);
    expect(onSearchRequested).toHaveBeenCalledWith({
      center: { latitude: 10.81, longitude: 106.72 },
      zoom: 14,
      bounds: { north: 10.9, south: 10.7, east: 106.85, west: 106.59 }
    });
  });

  it("exposes map-click and draggable-marker callbacks without provider requests", () => {
    const onMapClick = vi.fn();
    const onMarkerMove = vi.fn();
    render(
      <LeafletMap
        ariaLabel="Bản đồ chọn vị trí"
        center={initialViewport.center}
        zoom={initialViewport.zoom}
        markers={[
          {
            id: "draft-location",
            label: "Vị trí đã chọn",
            position: initialViewport.center,
            draggable: true
          }
        ]}
        onMapClick={onMapClick}
        onMarkerMove={onMarkerMove}
      />
    );

    act(() => leafletMocks.state.events.click?.({ latlng: { lat: 10.75, lng: 106.68 } }));
    expect(onMapClick).toHaveBeenCalledWith({ latitude: 10.75, longitude: 106.68 });

    act(() =>
      leafletMocks.state.markerEvents.get("Vị trí đã chọn")?.dragend?.({
        target: { getLatLng: () => ({ lat: 10.76, lng: 106.69 }) }
      })
    );
    expect(onMarkerMove).toHaveBeenCalledWith("draft-location", { latitude: 10.76, longitude: 106.69 });
  });
});
