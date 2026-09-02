"use client";

import { divIcon, Icon, latLng, type Marker as LeafletMarker } from "leaflet";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { useEffect, useState } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { MapBaseProps, MapMarker, MapViewport } from "./map-base";

function assetUrl(asset: string | { readonly src: string }) {
  return typeof asset === "string" ? asset : asset.src;
}

const markerIcon = new Icon({
  iconUrl: assetUrl(markerIconUrl),
  iconRetinaUrl: assetUrl(markerIconRetinaUrl),
  shadowUrl: assetUrl(markerShadowUrl),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

const selectedMarkerIcon = new Icon({
  iconUrl: assetUrl(markerIconUrl),
  iconRetinaUrl: assetUrl(markerIconRetinaUrl),
  shadowUrl: assetUrl(markerShadowUrl),
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  popupAnchor: [1, -42],
  tooltipAnchor: [18, -31],
  shadowSize: [41, 41],
  className: "rentmate-map-marker-selected"
});

function clusterIcon(cluster: { getChildCount: () => number }) {
  const count = cluster.getChildCount();
  return divIcon({
    html: `<button type="button" class="rentmate-map-cluster-button" aria-label="${count} phòng trong cụm">${count}</button>`,
    className: "rentmate-map-cluster",
    iconSize: [48, 48]
  });
}

function markerElement(
  marker: MapMarker,
  onMarkerSelect?: MapBaseProps["onMarkerSelect"],
  onMarkerMove?: MapBaseProps["onMarkerMove"]
) {
  return (
    <Marker
      key={marker.id}
      position={[marker.position.latitude, marker.position.longitude]}
      icon={marker.selected ? selectedMarkerIcon : markerIcon}
      draggable={marker.draggable}
      title={marker.label}
      alt={marker.label}
      eventHandlers={{
        click() {
          onMarkerSelect?.(marker.id);
        },
        dragend(event) {
          const position = (event.target as LeafletMarker).getLatLng();
          onMarkerMove?.(marker.id, { latitude: position.lat, longitude: position.lng });
        }
      }}
    >
      <Tooltip>{marker.label}</Tooltip>
      {marker.popup ? <Popup>{marker.popup}</Popup> : null}
    </Marker>
  );
}

function MarkerLayer({
  markers,
  onMarkerSelect,
  onMarkerMove
}: {
  readonly markers: readonly MapMarker[];
  readonly onMarkerSelect?: MapBaseProps["onMarkerSelect"];
  readonly onMarkerMove?: MapBaseProps["onMarkerMove"];
}) {
  return <>{markers.map((marker) => markerElement(marker, onMarkerSelect, onMarkerMove))}</>;
}

function ClusteredMarkers({
  markers,
  onMarkerSelect,
  onMarkerMove
}: {
  readonly markers: readonly MapMarker[];
  readonly onMarkerSelect?: MapBaseProps["onMarkerSelect"];
  readonly onMarkerMove?: MapBaseProps["onMarkerMove"];
}) {
  const clusterableMarkers = markers.filter((marker) => marker.clusterable !== false);
  const standaloneMarkers = markers.filter((marker) => marker.clusterable === false);

  return (
    <>
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={48}
        showCoverageOnHover={false}
        spiderfyOnMaxZoom
        zoomToBoundsOnClick
        iconCreateFunction={clusterIcon}
      >
        {clusterableMarkers.map((marker) => markerElement(marker, onMarkerSelect, onMarkerMove))}
      </MarkerClusterGroup>
      <MarkerLayer markers={standaloneMarkers} onMarkerSelect={onMarkerSelect} onMarkerMove={onMarkerMove} />
    </>
  );
}

function currentViewport(map: ReturnType<typeof useMap>): MapViewport {
  const center = map.getCenter();
  const bounds = map.getBounds();
  return {
    center: { latitude: center.lat, longitude: center.lng },
    zoom: map.getZoom(),
    bounds: {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    }
  };
}

function ViewportBridge({
  center,
  zoom,
  radiusCircle,
  viewportBounds,
  onViewportChange,
  onMapClick
}: Pick<MapBaseProps, "center" | "zoom" | "radiusCircle" | "viewportBounds" | "onViewportChange" | "onMapClick">) {
  const map = useMap();

  useEffect(() => {
    if (radiusCircle) {
      const bounds = latLng(radiusCircle.center.latitude, radiusCircle.center.longitude).toBounds(
        radiusCircle.radiusMeters * 2
      );
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
      return;
    }
    if (viewportBounds) {
      map.fitBounds(
        [
          [viewportBounds.south, viewportBounds.west],
          [viewportBounds.north, viewportBounds.east]
        ],
        { padding: [28, 28] }
      );
      return;
    }
    const currentCenter = map.getCenter();
    if (currentCenter.lat !== center.latitude || currentCenter.lng !== center.longitude || map.getZoom() !== zoom) {
      map.setView([center.latitude, center.longitude], zoom);
    }
  }, [center.latitude, center.longitude, map, radiusCircle, viewportBounds, zoom]);

  useMapEvents({
    moveend() {
      onViewportChange?.(currentViewport(map));
    },
    click(event) {
      onMapClick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    }
  });

  return null;
}

export default function LeafletMap({
  ariaLabel,
  center,
  zoom,
  markers = [],
  clusterMarkers = false,
  radiusCircle,
  viewportBounds,
  onViewportChange,
  onMapClick,
  onMarkerSelect,
  onMarkerMove,
  className
}: MapBaseProps) {
  const containerClass =
    className ?? "h-80 w-full min-w-0 overflow-hidden rounded-xl border border-stone-300 sm:h-96 lg:h-[28rem]";
  const [tileError, setTileError] = useState(false);
  return (
    <div role="region" aria-label={ariaLabel} className={containerClass + " relative"}>
      <MapContainer center={[center.latitude, center.longitude]} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          eventHandlers={{
            load: () => setTileError(false),
            tileerror: () => setTileError(true)
          }}
        />
        <ViewportBridge
          center={center}
          zoom={zoom}
          radiusCircle={radiusCircle}
          viewportBounds={viewportBounds}
          onViewportChange={onViewportChange}
          onMapClick={onMapClick}
        />
        {radiusCircle ? (
          <Circle
            center={[radiusCircle.center.latitude, radiusCircle.center.longitude]}
            radius={radiusCircle.radiusMeters}
            pathOptions={{ color: "#176b4d", fillColor: "#c9f269", fillOpacity: 0.2, opacity: 0.9, weight: 3 }}
          >
            {radiusCircle.label ? <Tooltip sticky>{radiusCircle.label}</Tooltip> : null}
          </Circle>
        ) : null}
        {clusterMarkers ? (
          <ClusteredMarkers markers={markers} onMarkerSelect={onMarkerSelect} onMarkerMove={onMarkerMove} />
        ) : (
          <MarkerLayer markers={markers} onMarkerSelect={onMarkerSelect} onMarkerMove={onMarkerMove} />
        )}
      </MapContainer>
      {tileError ? (
        <div
          role="status"
          className="pointer-events-none absolute left-3 right-3 top-3 z-[500] rounded-control border border-warning/30 bg-surface/95 p-3 text-ui-xs font-semibold text-foreground shadow-surface"
        >
          Bản đồ tạm thời chưa tải được. Danh sách tin đăng vẫn sử dụng được.
        </div>
      ) : null}
    </div>
  );
}
