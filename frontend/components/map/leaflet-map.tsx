"use client";

import { Icon, type Marker as LeafletMarker } from "leaflet";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { MapBaseProps, MapViewport } from "./map-base";

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
  onViewportChange,
  onMapClick
}: Pick<MapBaseProps, "center" | "zoom" | "onViewportChange" | "onMapClick">) {
  const map = useMap();

  useEffect(() => {
    const currentCenter = map.getCenter();
    if (currentCenter.lat !== center.latitude || currentCenter.lng !== center.longitude || map.getZoom() !== zoom) {
      map.setView([center.latitude, center.longitude], zoom);
    }
  }, [center.latitude, center.longitude, map, zoom]);

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
  onViewportChange,
  onMapClick,
  onMarkerMove,
  className = ""
}: MapBaseProps) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={`h-80 w-full min-w-0 overflow-hidden rounded-xl border border-stone-300 sm:h-96 lg:h-[28rem] ${className}`}
    >
      <MapContainer center={[center.latitude, center.longitude]} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ViewportBridge center={center} zoom={zoom} onViewportChange={onViewportChange} onMapClick={onMapClick} />
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.position.latitude, marker.position.longitude]}
            icon={markerIcon}
            draggable={marker.draggable}
            title={marker.label}
            alt={marker.label}
            eventHandlers={{
              dragend(event) {
                const position = (event.target as LeafletMarker).getLatLng();
                onMarkerMove?.(marker.id, { latitude: position.lat, longitude: position.lng });
              }
            }}
          >
            <Tooltip>{marker.label}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
