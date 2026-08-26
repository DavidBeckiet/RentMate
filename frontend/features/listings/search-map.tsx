"use client";

import { MapBase, type MapPoint, type MapViewport } from "../../components/map/map-base";
import { MapSearchControl } from "../../components/map/map-search-control";
import type { PublicListingSummary } from "../../types/api";
import { SearchMapListingPopup } from "./search-map-listing-popup";

const defaultMapCenter: MapPoint = Object.freeze({ latitude: 10.776, longitude: 106.7 });

export interface SearchMapProps {
  readonly listings: readonly PublicListingSummary[];
  readonly activeListingId: number | null;
  readonly pendingViewport: MapViewport | null;
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
  proposedRadiusCenter,
  selectingRadiusCenter,
  onViewportChange,
  onSearchBounds,
  onRadiusCenterSelected,
  onListingSelect
}: SearchMapProps) {
  const firstListing = listings[0];
  const center =
    proposedRadiusCenter ??
    (firstListing ? { latitude: firstListing.latitude, longitude: firstListing.longitude } : defaultMapCenter);
  const markers = [
    ...listings.map((listing) => ({
      id: listing.id,
      position: { latitude: listing.latitude, longitude: listing.longitude },
      label: `${listing.title} — ${listing.areaName}`,
      selected: activeListingId === listing.id,
      popup: <SearchMapListingPopup listing={listing} />
    })),
    ...(proposedRadiusCenter
      ? [{ id: "radius-search-center", position: proposedRadiusCenter, label: "Tâm tìm kiếm theo bán kính" }]
      : [])
  ];

  return (
    <section
      aria-labelledby="search-map-heading"
      className="min-w-0 border-2 border-heroDark-950 bg-rent-surface p-4 shadow-glass-sm"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="search-map-heading" className="font-display text-xl font-bold text-rent-ink">
            Bản đồ kết quả
          </h2>
          <p className="mt-1 text-sm text-rent-secondary">Vị trí xấp xỉ, dựa trên tọa độ công khai đã làm tròn.</p>
        </div>
        {pendingViewport ? (
          <MapSearchControl viewport={pendingViewport} onSearchRequested={onSearchBounds} />
        ) : (
          <span className="text-xs text-rent-subtle">Di chuyển bản đồ để tìm trong vùng mới.</span>
        )}
      </div>
      {selectingRadiusCenter ? (
        <p
          role="status"
          className="mb-3 border-2 border-heroDark-950 bg-rent-yellow px-3 py-2 text-sm font-bold text-rent-ink"
        >
          Chọn một điểm trên bản đồ làm tâm tìm kiếm.
        </p>
      ) : null}
      <MapBase
        ariaLabel="Bản đồ vị trí xấp xỉ của các tin đăng"
        center={center}
        zoom={listings.length > 0 || proposedRadiusCenter ? 13 : 11}
        markers={markers}
        onViewportChange={onViewportChange}
        onMapClick={selectingRadiusCenter ? onRadiusCenterSelected : undefined}
        onMarkerSelect={(id) => {
          if (typeof id === "number" && Number.isSafeInteger(id)) onListingSelect(id);
        }}
        className="lg:h-[36rem]"
      />
    </section>
  );
}
