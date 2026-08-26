"use client";

import { Icon, latLng, type Marker as LeafletMarker } from "leaflet";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { useEffect } from "react";
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
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
  onViewportChange,
  onMapClick
}: Pick<MapBaseProps, "center" | "zoom" | "radiusCircle" | "onViewportChange" | "onMapClick">) {
  const map = useMap();

  useEffect(() => {
    if (radiusCircle) {
      const bounds = latLng(radiusCircle.center.latitude, radiusCircle.center.longitude).toBounds(
        radiusCircle.radiusMeters * 2
      );
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
      return;
    }
    const currentCenter = map.getCenter();
    if (currentCenter.lat !== center.latitude || currentCenter.lng !== center.longitude || map.getZoom() !== zoom) {
      map.setView([center.latitude, center.longitude], zoom);
    }
  }, [center.latitude, center.longitude, map, radiusCircle, zoom]);

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
  radiusCircle,
  onViewportChange,
  onMapClick,
  onMarkerSelect,
  onMarkerMove,
  className
}: MapBaseProps) {
  const containerClass =
    className ?? "h-80 w-full min-w-0 overflow-hidden rounded-xl border border-stone-300 sm:h-96 lg:h-[28rem]";
  return (
    <div role="region" aria-label={ariaLabel} className={containerClass}>
      <MapContainer center={[center.latitude, center.longitude]} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ViewportBridge
          center={center}
          zoom={zoom}
          radiusCircle={radiusCircle}
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
        {markers.map((marker) => (
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
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
