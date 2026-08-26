import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ComponentType, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapBaseProps, MapViewport } from "./map-base";

interface MapEvents {
  moveend?: () => void;
  click?: (event: { latlng: { lat: number; lng: number } }) => void;
}

interface MarkerEvents {
  click?: () => void;
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
    markerIcons: new Map<string, unknown>(),
    clusterOptions: null as null | Record<string, unknown>,
    tile: null as null | { url: string; attribution: string },
    setView: vi.fn(),
    fitBounds: vi.fn()
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
    setView: state.setView,
    fitBounds: state.fitBounds
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

vi.mock("leaflet", () => ({
  Icon: class Icon {},
  divIcon: (options: unknown) => options,
  latLng: (latitude: number, longitude: number) => ({
    toBounds: (sizeInMeters: number) => ({ latitude, longitude, sizeInMeters })
  })
}));
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
  Marker: ({
    children,
    title,
    icon,
    eventHandlers
  }: {
    children: ReactNode;
    title: string;
    icon: unknown;
    eventHandlers: MarkerEvents;
  }) => {
    leafletMocks.state.markerEvents.set(title, eventHandlers);
    leafletMocks.state.markerIcons.set(title, icon);
    return <div data-testid={`marker-${title}`}>{children}</div>;
  },
  Circle: ({ children, radius }: { children: ReactNode; radius: number }) => (
    <div data-testid="radius-circle" data-radius={radius}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div data-testid="map-popup">{children}</div>,
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useMap: () => leafletMocks.map,
  useMapEvents: (events: MapEvents) => {
    leafletMocks.state.events = events;
    return leafletMocks.map;
  }
}));

vi.mock("react-leaflet-cluster", () => ({
  default: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
    leafletMocks.state.clusterOptions = props;
    return <div data-testid="marker-cluster-group">{children}</div>;
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
  leafletMocks.state.markerIcons.clear();
  leafletMocks.state.clusterOptions = null;
  leafletMocks.state.tile = null;
  leafletMocks.state.setView.mockClear();
  leafletMocks.state.fitBounds.mockClear();
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

  it("selects a marker and gives selected markers a distinct presentation", () => {
    const onMarkerSelect = vi.fn();
    const marker = {
      id: "listing-42",
      label: "Phòng cần chọn",
      position: initialViewport.center
    };
    const view = render(
      <LeafletMap
        ariaLabel="Bản đồ chọn phòng"
        center={initialViewport.center}
        zoom={initialViewport.zoom}
        markers={[marker]}
        onMarkerSelect={onMarkerSelect}
      />
    );

    act(() => leafletMocks.state.markerEvents.get(marker.label)?.click?.());
    expect(onMarkerSelect).toHaveBeenCalledWith(marker.id);
    const defaultIcon = leafletMocks.state.markerIcons.get(marker.label);

    view.rerender(
      <LeafletMap
        ariaLabel="Bản đồ chọn phòng"
        center={initialViewport.center}
        zoom={initialViewport.zoom}
        markers={[{ ...marker, selected: true }]}
        onMarkerSelect={onMarkerSelect}
      />
    );
    expect(leafletMocks.state.markerIcons.get(marker.label)).not.toBe(defaultIcon);
  });

  it("renders an optional marker popup without changing markers that have no popup", () => {
    render(
      <LeafletMap
        ariaLabel="Bản đồ có xem nhanh"
        center={initialViewport.center}
        zoom={initialViewport.zoom}
        markers={[{ id: "listing-42", label: "Phòng xem nhanh", position: initialViewport.center, popup: "Tóm tắt" }]}
      />
    );

    expect(screen.getByTestId("map-popup")).toHaveTextContent("Tóm tắt");
  });

  it("clusters only when enabled and keeps viewport updates separate from search callbacks", () => {
    const onViewportChange = vi.fn();
    render(
      <LeafletMap
        ariaLabel="Bản đồ gom cụm"
        center={initialViewport.center}
        zoom={initialViewport.zoom}
        clusterMarkers
        onViewportChange={onViewportChange}
        markers={[
          { id: "listing-1", label: "Phòng 1", position: initialViewport.center },
          { id: "listing-2", label: "Phòng 2", position: { latitude: 10.771, longitude: 106.701 } }
        ]}
      />
    );

    expect(screen.getByTestId("marker-cluster-group")).toBeInTheDocument();
    expect(leafletMocks.state.clusterOptions).toMatchObject({
      chunkedLoading: true,
      maxClusterRadius: 48,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true
    });
    const createClusterIcon = leafletMocks.state.clusterOptions?.iconCreateFunction as (cluster: {
      getChildCount: () => number;
    }) => { html: string; className: string };
    expect(createClusterIcon({ getChildCount: () => 3 })).toMatchObject({
      className: "rentmate-map-cluster",
      html: expect.stringContaining('aria-label="3 phòng trong cụm"')
    });
    act(() => leafletMocks.state.events.moveend?.());
    expect(onViewportChange).toHaveBeenCalledTimes(1);
  });

  it("fits the viewport to and renders an optional radius circle", () => {
    render(
      <LeafletMap
        ariaLabel="Bản đồ bán kính"
        center={initialViewport.center}
        zoom={13}
        radiusCircle={{ center: initialViewport.center, radiusMeters: 5000, label: "Bán kính 5 km" }}
      />
    );

    expect(leafletMocks.state.fitBounds).toHaveBeenCalledWith(
      { latitude: 10.77, longitude: 106.7, sizeInMeters: 10000 },
      { padding: [28, 28], maxZoom: 15 }
    );
    expect(screen.getByTestId("radius-circle")).toHaveAttribute("data-radius", "5000");
    expect(screen.getByText("Bán kính 5 km")).toBeInTheDocument();
  });

  it("restores saved bounds without changing the map search callback", () => {
    const onViewportChange = vi.fn();
    render(
      <LeafletMap
        ariaLabel="Bản đồ vùng đã lưu"
        center={initialViewport.center}
        zoom={13}
        viewportBounds={{ north: 10.9, south: 10.6, east: 106.9, west: 106.5 }}
        onViewportChange={onViewportChange}
      />
    );

    expect(leafletMocks.state.fitBounds).toHaveBeenCalledWith(
      [
        [10.6, 106.5],
        [10.9, 106.9]
      ],
      { padding: [28, 28] }
    );
    expect(onViewportChange).not.toHaveBeenCalled();
  });
});
