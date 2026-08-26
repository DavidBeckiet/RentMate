"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { LoadingState } from "../ui/feedback-states";

export interface MapPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface MapBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

export interface MapViewport {
  readonly center: MapPoint;
  readonly zoom: number;
  readonly bounds: MapBounds;
}

export interface MapMarker {
  readonly id: string | number;
  readonly position: MapPoint;
  readonly label: string;
  readonly draggable?: boolean;
  readonly selected?: boolean;
  readonly popup?: ReactNode;
  readonly clusterable?: boolean;
}

export interface MapRadiusCircle {
  readonly center: MapPoint;
  readonly radiusMeters: number;
  readonly label?: string;
}

export interface MapBaseProps {
  readonly ariaLabel: string;
  readonly center: MapPoint;
  readonly zoom: number;
  readonly markers?: readonly MapMarker[];
  readonly clusterMarkers?: boolean;
  readonly radiusCircle?: MapRadiusCircle;
  readonly onViewportChange?: (viewport: MapViewport) => void;
  readonly onMapClick?: (point: MapPoint) => void;
  readonly onMarkerSelect?: (id: MapMarker["id"]) => void;
  readonly onMarkerMove?: (id: MapMarker["id"], point: MapPoint) => void;
  readonly className?: string;
}

const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <LoadingState message="Đang tải bản đồ…" />
});

export function MapBase(props: MapBaseProps) {
  return <LeafletMap {...props} />;
}
