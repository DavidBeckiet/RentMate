"use client";

import { Button } from "../ui/button";
import type { MapViewport } from "./map-base";

export interface MapSearchControlProps {
  readonly viewport: MapViewport;
  readonly onSearchRequested: (viewport: MapViewport) => void;
  readonly disabled?: boolean;
}

export function MapSearchControl({ viewport, onSearchRequested, disabled }: MapSearchControlProps) {
  return (
    <Button disabled={disabled} onClick={() => onSearchRequested(viewport)}>
      Tìm trong khu vực này
    </Button>
  );
}
