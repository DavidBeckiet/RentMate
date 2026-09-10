"use client";

import { useCallback, useMemo } from "react";
import { MapBase, type MapBounds, type MapPoint, type MapViewport } from "../../components/map/map-base";
import { MapSearchControl } from "../../components/map/map-search-control";
import { formatAreaLabel } from "../../lib/area";
import type { PublicListingSummary } from "../../types/api";
import { SearchMapListingPopup } from "./search-map-listing-popup";
import styles from "./search-map.module.css";
import { formatNearMeRent } from "./near-me-format";

const defaultMapCenter: MapPoint = Object.freeze({ latitude: 10.776, longitude: 106.7 });

export interface SearchMapProps {
  readonly listings: readonly PublicListingSummary[];
  readonly activeListingId: number | null;
  readonly pendingViewport: MapViewport | null;
  readonly viewportBounds: MapBounds | null;
  readonly proposedRadiusCenter: MapPoint | null;
  readonly selectingRadiusCenter: boolean;
  readonly onViewportChange: (viewport: MapViewport) => void;
  readonly onSearchBounds: (viewport: MapViewport) => void;
  readonly onRadiusCenterSelected: (point: MapPoint) => void;
  readonly onListingSelect: (listingId: number) => void;
}

export function SearchMap({
  listings,
  activeListingId,
  pendingViewport,
  viewportBounds,
  proposedRadiusCenter,
  selectingRadiusCenter,
  onViewportChange,
  onSearchBounds,
  onRadiusCenterSelected,
  onListingSelect
}: SearchMapProps) {
  const firstListing = listings[0];
  const center = useMemo(
    () =>
      proposedRadiusCenter ??
      (viewportBounds
        ? {
            latitude: (viewportBounds.north + viewportBounds.south) / 2,
            longitude: (viewportBounds.east + viewportBounds.west) / 2
          }
        : firstListing
          ? { latitude: firstListing.latitude, longitude: firstListing.longitude }
          : defaultMapCenter),
    [firstListing, proposedRadiusCenter, viewportBounds]
  );
  const markers = useMemo(
    () => [
      ...listings.map((listing) => ({
        id: listing.id,
        position: { latitude: listing.latitude, longitude: listing.longitude },
        label: `${listing.title} — ${formatAreaLabel(listing.areaName)}`,
        variant: "price" as const,
        displayLabel: formatNearMeRent(listing.monthlyRent),
        hideTooltip: true,
        selected: activeListingId === listing.id,
        popup: <SearchMapListingPopup listing={listing} />
      })),
      ...(proposedRadiusCenter
        ? [
            {
              id: "radius-search-center",
              position: proposedRadiusCenter,
              label: "Tâm tìm kiếm theo bán kính",
              clusterable: false
            }
          ]
        : [])
    ],
    [activeListingId, listings, proposedRadiusCenter]
  );
  const handleMarkerSelect = useCallback(
    (id: string | number) => {
      if (typeof id === "number" && Number.isSafeInteger(id)) onListingSelect(id);
    },
    [onListingSelect]
  );

  return (
    <section aria-labelledby="search-map-heading" className={styles.map}>
      <div className={styles.toolbar}>
        <div>
          <h2 id="search-map-heading" className="font-display text-heading-sm font-bold text-foreground">
            Bản đồ kết quả
          </h2>
          <p className="mt-1 text-ui-xs text-muted-foreground">Vị trí xấp xỉ · Chọn giá để xem phòng</p>
        </div>
        {pendingViewport ? (
          <MapSearchControl viewport={pendingViewport} onSearchRequested={onSearchBounds} />
        ) : (
          <span className="text-ui-xs text-muted-foreground">Di chuyển bản đồ để tìm trong vùng mới.</span>
        )}
      </div>
      {selectingRadiusCenter ? (
        <p
          role="status"
          className="mb-3 rounded-control border border-warning/30 bg-warning-subtle px-3 py-2 text-ui-sm font-semibold text-warning-foreground"
        >
          Chọn một điểm trên bản đồ làm tâm tìm kiếm.
        </p>
      ) : null}
      <MapBase
        ariaLabel="Bản đồ vị trí xấp xỉ của các tin đăng"
        center={center}
        zoom={listings.length > 0 || proposedRadiusCenter ? 13 : 11}
        markers={markers}
        clusterMarkers
        viewportBounds={viewportBounds ?? undefined}
        onViewportChange={onViewportChange}
        onMapClick={selectingRadiusCenter ? onRadiusCenterSelected : undefined}
        onMarkerSelect={handleMarkerSelect}
        className={styles.canvas}
      />
    </section>
  );
}
