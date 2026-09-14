"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapPoint, MapViewport } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Drawer } from "../../components/ui/drawer";
import { ErrorState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import type { Amenity, PropertyType, PublicListingSort, PublicListingSummary } from "../../types/api";
import { SaveSearchControl } from "../saved-searches/save-search-control";
import { ListingCard, ListingCardSkeleton } from "./listing-card";
import { RadiusControls } from "./radius-controls";
import { amenityLabel, propertyTypeLabel } from "./room-type-label";
import { SearchFilters, type LookupResource } from "./search-filters";
import { SearchMap } from "./search-map";
import { SearchMapListingPopup } from "./search-map-listing-popup";
import {
  activeFilterCount,
  applySearchFilters,
  parseSearchQuery,
  searchFilterValues,
  serializeSearchState,
  toPublicListingSearchQuery,
  type SearchFilterValues,
  type SearchQueryState,
  withBounds,
  withPage,
  withRadius
} from "./search-query";
import styles from "./search-page.module.css";

type SearchStatus = "idle" | "loading" | "success" | "error";
type ActiveFilterKey =
  | "q"
  | "areaName"
  | "minMonthlyRent"
  | "maxMonthlyRent"
  | "minRoomAreaSqm"
  | "maxRoomAreaSqm"
  | "minOccupants"
  | "propertyType"
  | "amenities"
  | "mode";

interface ActiveFilterChip {
  readonly key: ActiveFilterKey;
  readonly label: string;
}

function searchErrorMessage(error: ApiError | null): string {
  if (error?.status === 422) return "Bộ lọc hoặc khu vực tìm kiếm chưa hợp lệ. Hãy điều chỉnh và thử lại.";
  if (error?.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  return "Không thể tải kết quả lúc này. Vui lòng thử lại.";
}

function initialLookup<T>(): LookupResource<T> {
  return { status: "loading", data: [] };
}

function sameViewport(left: MapViewport | null, right: MapViewport): boolean {
  return Boolean(
    left &&
      left.center.latitude === right.center.latitude &&
      left.center.longitude === right.center.longitude &&
      left.zoom === right.zoom &&
      left.bounds.north === right.bounds.north &&
      left.bounds.south === right.bounds.south &&
      left.bounds.east === right.bounds.east &&
      left.bounds.west === right.bounds.west
  );
}

function optionLabel<T extends { readonly code: string; readonly label: string }>(
  resource: LookupResource<T>,
  code: string,
  fallback: string,
  format: (option: T) => string = (option) => option.label
): string {
  const option = resource.data.find((item) => item.code === code);
  return option ? format(option) : fallback;
}

function searchContextLabel(state: SearchQueryState): string {
  if (state.areaName && state.q) return `${state.areaName} · ${state.q}`;
  if (state.areaName) return `Khu vực ${state.areaName}`;
  if (state.q) return `Từ khóa “${state.q}”`;
  return "Tất cả phòng công khai";
}

function activeFilterChips(
  state: SearchQueryState,
  propertyTypes: LookupResource<PropertyType>,
  amenities: LookupResource<Amenity>
): readonly ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (state.q) chips.push({ key: "q", label: "Từ khóa: " + state.q });
  if (state.areaName) chips.push({ key: "areaName", label: "Khu vực: " + state.areaName });
  if (state.minMonthlyRent !== undefined)
    chips.push({ key: "minMonthlyRent", label: "Từ " + formatCompactMoney(state.minMonthlyRent) });
  if (state.maxMonthlyRent !== undefined)
    chips.push({ key: "maxMonthlyRent", label: "Đến " + formatCompactMoney(state.maxMonthlyRent) });
  if (state.minRoomAreaSqm !== undefined)
    chips.push({ key: "minRoomAreaSqm", label: "Diện tích từ " + state.minRoomAreaSqm + " m²" });
  if (state.maxRoomAreaSqm !== undefined)
    chips.push({ key: "maxRoomAreaSqm", label: "Diện tích đến " + state.maxRoomAreaSqm + " m²" });
  if (state.minOccupants !== undefined)
    chips.push({ key: "minOccupants", label: "Tối thiểu " + state.minOccupants + " người" });
  if (state.propertyType) {
    chips.push({
      key: "propertyType",
      label: "Loại: " + optionLabel(propertyTypes, state.propertyType, "Loại phòng đã chọn", propertyTypeLabel)
    });
  }
  if (state.amenities.length > 0) {
    const labels = state.amenities.map((code) => optionLabel(amenities, code, "Tiện ích đã chọn", amenityLabel));
    chips.push({ key: "amenities", label: "Tiện ích: " + labels.join(", ") });
  }
  if (state.mode === "bounds") chips.push({ key: "mode", label: "Vùng bản đồ đang chọn" });
  if (state.mode === "radius") chips.push({ key: "mode", label: "Bán kính " + state.radiusKm + " km" });
  return chips;
}

function formatCompactMoney(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return (Number.isInteger(millions) ? String(millions) : millions.toFixed(1).replace(".", ",")) + " triệu/tháng";
  }
  return new Intl.NumberFormat("vi-VN").format(value) + " ₫/tháng";
}

function removeSearchFilter(values: SearchFilterValues, key: Exclude<ActiveFilterKey, "mode">): SearchFilterValues {
  switch (key) {
    case "q":
    case "areaName":
    case "minMonthlyRent":
    case "maxMonthlyRent":
    case "minRoomAreaSqm":
    case "maxRoomAreaSqm":
    case "minOccupants":
    case "propertyType":
      return Object.fromEntries(Object.entries(values).filter(([name]) => name !== key)) as SearchFilterValues;
    case "amenities":
      return { ...values, amenities: [] };
  }
}

export function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsed = useMemo(() => parseSearchQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const committedIdentity = parsed.ok ? serializeSearchState(parsed.state).toString() : "invalid:" + rawQuery;
  const savedViewportBounds = useMemo(() => {
    if (!parsed.ok || parsed.state.mode !== "bounds") return null;
    return {
      north: parsed.state.north,
      south: parsed.state.south,
      east: parsed.state.east,
      west: parsed.state.west
    };
  }, [parsed]);
  const [items, setItems] = useState<readonly PublicListingSummary[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchError, setSearchError] = useState<ApiError | null>(null);
  const [searchRetryKey, setSearchRetryKey] = useState(0);
  const [propertyTypes, setPropertyTypes] = useState<LookupResource<PropertyType>>(initialLookup);
  const [amenities, setAmenities] = useState<LookupResource<Amenity>>(initialLookup);
  const [areas, setAreas] = useState<LookupResource<string>>(initialLookup);
  const [propertyRetryKey, setPropertyRetryKey] = useState(0);
  const [amenityRetryKey, setAmenityRetryKey] = useState(0);
  const [areaRetryKey, setAreaRetryKey] = useState(0);
  const [pendingViewport, setPendingViewport] = useState<MapViewport | null>(null);
  const [proposedRadiusCenter, setProposedRadiusCenter] = useState<MapPoint | null>(null);
  const [selectingRadiusCenter, setSelectingRadiusCenter] = useState(false);
  const [radiusResetKey, setRadiusResetKey] = useState(0);
  const [mapModeActive, setMapModeActive] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [activeListingId, setActiveListingId] = useState<number | null>(null);
  const searchRequestIdentity = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setPropertyTypes({ status: "loading", data: [] });
    void api.lookups
      .listPropertyTypes(controller.signal)
      .then((data) => {
        if (active && !controller.signal.aborted) setPropertyTypes({ status: "success", data });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setPropertyTypes({ status: "error", data: [] });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [propertyRetryKey]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setAmenities({ status: "loading", data: [] });
    void api.lookups
      .listAmenities(controller.signal)
      .then((data) => {
        if (active && !controller.signal.aborted) setAmenities({ status: "success", data });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setAmenities({ status: "error", data: [] });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [amenityRetryKey]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setAreas({ status: "loading", data: [] });
    void api.lookups
      .listPublicAreas(controller.signal)
      .then((data) => {
        if (active && !controller.signal.aborted) setAreas({ status: "success", data });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setAreas({ status: "error", data: [] });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [areaRetryKey]);

  useEffect(() => {
    setPendingViewport(null);
    setSelectingRadiusCenter(false);
    if (parsed.ok && parsed.state.mode === "radius") {
      setProposedRadiusCenter({ latitude: parsed.state.centerLat, longitude: parsed.state.centerLng });
    } else {
      setProposedRadiusCenter(null);
    }
  }, [committedIdentity, parsed]);

  useEffect(() => {
    if (activeListingId !== null && !items.some((listing) => listing.id === activeListingId)) {
      setActiveListingId(null);
    }
  }, [activeListingId, items]);

  useEffect(() => {
    if (!parsed.ok) {
      ++searchRequestIdentity.current;
      setItems([]);
      setCurrentPage(1);
      setHasNextPage(false);
      setSearchError(null);
      setSearchStatus("idle");
      setActiveListingId(null);
      return;
    }

    const controller = new AbortController();
    const identity = ++searchRequestIdentity.current;
    let active = true;
    setItems([]);
    setActiveListingId(null);
    setCurrentPage(parsed.state.page);
    setHasNextPage(false);
    setSearchError(null);
    setSearchStatus("loading");

    void api.listings
      .searchPublic(toPublicListingSearchQuery(parsed.state), controller.signal)
      .then((page) => {
        if (!active || controller.signal.aborted || identity !== searchRequestIdentity.current) return;
        setItems(page.data);
        setCurrentPage(page.pagination.page);
        setHasNextPage(page.pagination.hasNextPage);
        setSearchStatus("success");
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted || identity !== searchRequestIdentity.current) return;
        setSearchError(caught instanceof ApiError ? caught : null);
        setSearchStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [committedIdentity, parsed, searchRetryKey]);

  const navigate = (state: SearchQueryState) => {
    const query = serializeSearchState(state).toString();
    router.push(query ? "/search?" + query : "/search");
  };

  const openMapMode = useCallback(() => setMapModeActive(true), []);

  const closeMapMode = useCallback(() => setMapModeActive(false), []);

  const handleListingSelect = useCallback((listingId: number) => {
    setActiveListingId(listingId);
  }, []);

  const handleViewportChange = useCallback((viewport: MapViewport) => {
    setPendingViewport((current) => (sameViewport(current, viewport) ? current : viewport));
  }, []);

  const clearSearch = () => {
    setPendingViewport(null);
    setProposedRadiusCenter(null);
    setSelectingRadiusCenter(false);
    setActiveListingId(null);
    setMapModeActive(false);
    setMobileFiltersOpen(false);
    setRadiusResetKey((key) => key + 1);
    router.push("/search");
  };

  if (!parsed.ok) {
    return (
      <section className={styles.invalidPage} aria-labelledby="search-heading">
        <div className={styles.invalidHeader}>
          <div className="rm-page-container">
            <span className={styles.introLabel}>
              <Icon name="sliders" className="h-4 w-4" /> Tìm phòng
            </span>
            <h1 id="search-heading">Bộ lọc chưa hợp lệ.</h1>
          </div>
        </div>
        <div className="rm-page-container py-8">
          <ErrorState
            message={parsed.message}
            action={<Button onClick={clearSearch}>Xóa bộ lọc và bắt đầu lại</Button>}
          />
        </div>
      </section>
    );
  }

  const committed = parsed.state;
  const filterCount = activeFilterCount(committed);
  const chips = activeFilterChips(committed, propertyTypes, amenities);
  const contextLabel = searchContextLabel(committed);
  const activeMapListing = items.find((item) => item.id === activeListingId);
  const applyFilters = (values: SearchFilterValues, sort: PublicListingSort) => {
    navigate(applySearchFilters(committed, values, sort));
  };
  const removeFilter = (key: ActiveFilterKey) => {
    if (key === "mode") {
      navigate({
        ...searchFilterValues(committed),
        mode: "ordinary",
        page: 1,
        pageSize: committed.pageSize,
        sort: "newest"
      });
      return;
    }
    applyFilters(
      removeSearchFilter(searchFilterValues(committed), key),
      committed.mode === "radius" ? "distance_asc" : committed.sort
    );
  };
  const renderFilterSurface = (idPrefix?: string) => (
    <SearchFilters
      committed={committed}
      propertyTypes={propertyTypes}
      amenities={amenities}
      areas={areas}
      idPrefix={idPrefix}
      onRetryPropertyTypes={() => setPropertyRetryKey((key) => key + 1)}
      onRetryAmenities={() => setAmenityRetryKey((key) => key + 1)}
      onRetryAreas={() => setAreaRetryKey((key) => key + 1)}
      onApply={(values, sort) => {
        setMobileFiltersOpen(false);
        applyFilters(values, sort);
      }}
      onClear={clearSearch}
      onOpenMap={() => {
        setMobileFiltersOpen(false);
        openMapMode();
      }}
    />
  );

  return (
    <div className={styles.page}>
      <div className={"rm-page-container " + styles.content}>
        <header className={styles.searchIntro}>
          <div className={styles.introCopy}>
            <span className={styles.introLabel}>
              <Icon name="search" className="h-4 w-4" /> Khám phá nơi ở
            </span>
            <h1 id="search-heading">Tìm phòng phù hợp</h1>
            <p>Điều chỉnh khu vực, ngân sách và tiện ích ngay trên trang.</p>
          </div>
          <div className={styles.searchContext}>
            <span className={styles.contextLabel}>Đang tìm</span>
            <strong title={contextLabel}>{contextLabel}</strong>
            <span className={styles.contextHint}>Vị trí trên bản đồ luôn là vị trí xấp xỉ.</span>
          </div>
        </header>

        <div className={styles.layout}>
          <aside id="search-filter-sidebar" className={styles.filterSidebar} aria-label="Bộ lọc tìm phòng">
            {renderFilterSurface()}
          </aside>

          <div className={styles.marketplaceStage}>
            <main className={styles.results} aria-label="Kết quả tìm phòng">
              <div className={styles.resultsToolbar}>
                <div className={styles.resultSummary}>
                  <span className={styles.resultIcon}>
                    <Icon name="home" className="h-5 w-5" />
                  </span>
                  <div>
                    <h2>
                      {searchStatus === "loading" ? (
                        "Đang tìm phòng…"
                      ) : items.length > 0 ? (
                        <>
                          Hiển thị <strong>{items.length}</strong> phòng trên trang này
                        </>
                      ) : (
                        "Không tìm thấy phòng phù hợp"
                      )}
                    </h2>
                    <p>{searchStatus === "loading" ? "Đang cập nhật kết quả" : contextLabel}</p>
                  </div>
                </div>

                <div className={styles.toolbarActions}>
                  <SaveSearchControl search={committed} />
                  <button
                    type="button"
                    aria-expanded={mobileFiltersOpen}
                    onClick={() => setMobileFiltersOpen((open) => !open)}
                    className={styles.mobileFilterButton}
                  >
                    <Icon name="sliders" className="h-4 w-4" />
                    Bộ lọc
                    {filterCount > 0 ? <span>{filterCount}</span> : null}
                  </button>
                  <label className={styles.sortControl}>
                    <span>Sắp xếp:</span>
                    <select
                      aria-label="Sắp xếp kết quả"
                      value={committed.mode === "radius" ? "distance_asc" : committed.sort}
                      disabled={committed.mode === "radius"}
                      onChange={(event) =>
                        applyFilters(searchFilterValues(committed), event.target.value as PublicListingSort)
                      }
                    >
                      {committed.mode === "radius" ? (
                        <option value="distance_asc">Gần nhất</option>
                      ) : (
                        <>
                          <option value="newest">Mới nhất</option>
                          <option value="rent_asc">Giá thấp đến cao</option>
                          <option value="rent_desc">Giá cao đến thấp</option>
                        </>
                      )}
                    </select>
                  </label>
                </div>
              </div>

              {chips.length > 0 ? (
                <div className={styles.activeFilters} aria-label="Bộ lọc đang áp dụng">
                  <span className={styles.activeFiltersLabel}>Đang lọc</span>
                  {chips.map((chip) => (
                    <span key={chip.key} className={styles.filterChip}>
                      {chip.label}
                      <button
                        type="button"
                        className={styles.filterChipRemove}
                        aria-label={"Bỏ bộ lọc " + chip.label}
                        onClick={() => removeFilter(chip.key)}
                      >
                        <Icon name="close" className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              {searchStatus === "loading" ? (
                <div className={styles.loadingResults} role="status" aria-live="polite">
                  <span className="sr-only">Đang tìm tin đăng…</span>
                  <div className={styles.listingGrid} aria-hidden="true">
                    {Array.from({ length: 6 }, (_, index) => (
                      <ListingCardSkeleton key={index} variant="search" />
                    ))}
                  </div>
                </div>
              ) : null}

              {searchStatus === "error" ? (
                <ErrorState
                  message={searchErrorMessage(searchError)}
                  requestId={searchError?.requestId}
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setSearchRetryKey((key) => key + 1)}>Thử lại</Button>
                      {searchError?.status === 422 ? (
                        <Button variant="secondary" onClick={clearSearch}>
                          Xóa bộ lọc
                        </Button>
                      ) : null}
                    </div>
                  }
                />
              ) : null}

              {searchStatus === "success" && items.length === 0 ? (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>
                    <Icon name="search" className="h-7 w-7" />
                  </span>
                  <h3>Không tìm thấy phòng phù hợp</h3>
                  <p>Vui lòng thử thay đổi từ khóa hoặc nới lỏng một vài điều kiện lọc.</p>
                  <button type="button" onClick={clearSearch} className={styles.emptyAction}>
                    Xóa bộ lọc và xem tất cả
                  </button>
                </div>
              ) : null}

              {items.length > 0 ? (
                <div className={styles.resultsList}>
                  <div className={styles.listingGrid}>
                    {items.map((listing) => (
                      <ListingCard
                        key={listing.id}
                        listing={listing}
                        showFavorite
                        variant="search"
                        mapSelected={activeListingId === listing.id}
                        onMapFocus={() => setActiveListingId(listing.id)}
                        onMapSelect={() => {
                          setActiveListingId(listing.id);
                          openMapMode();
                        }}
                      />
                    ))}
                  </div>

                  {currentPage > 1 || hasNextPage ? (
                    <Pagination
                      ariaLabel="Phân trang kết quả tìm kiếm"
                      page={currentPage}
                      hasNextPage={hasNextPage}
                      onPrevious={() => navigate(withPage(committed, currentPage - 1))}
                      onNext={() => navigate(withPage(committed, currentPage + 1))}
                    />
                  ) : null}
                  {!hasNextPage ? (
                    <div className={styles.endState}>
                      <span>Bạn đã xem hết {items.length} phòng trọ phù hợp.</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </main>

            <Dialog
              open={mapModeActive}
              title="Bản đồ khám phá"
              description={`Vị trí xấp xỉ · ${contextLabel}`}
              closeLabel="Đóng bản đồ"
              onClose={closeMapMode}
              className={styles.mapDialog}
            >
              <div className={styles.mapDialogContent}>
                <div className={styles.mapDialogMeta}>
                  <div>
                    <span className={styles.mapDialogKicker}>
                      <Icon name="search" className="h-4 w-4" /> Đang xem
                    </span>
                    <strong title={contextLabel}>{contextLabel}</strong>
                  </div>
                  <span className={styles.mapDialogCount}>{items.length} phòng trên trang này</span>
                </div>

                <div className={styles.mapDialogMap}>
                  <SearchMap
                    listings={items}
                    pendingViewport={pendingViewport}
                    viewportBounds={savedViewportBounds}
                    proposedRadiusCenter={proposedRadiusCenter}
                    selectingRadiusCenter={selectingRadiusCenter}
                    activeListingId={activeListingId}
                    onViewportChange={handleViewportChange}
                    onSearchBounds={(viewport) => navigate(withBounds(committed, viewport.bounds))}
                    onListingSelect={handleListingSelect}
                    onRadiusCenterSelected={(point) => {
                      if (!selectingRadiusCenter) return;
                      setProposedRadiusCenter(point);
                      setSelectingRadiusCenter(false);
                    }}
                  />
                </div>

                <div className={styles.mapDialogControls}>
                  <div className={styles.mapPreview}>
                    <p className={styles.mapDialogKicker}>
                      <Icon name="home" className="h-4 w-4" /> Phòng đang xem
                    </p>
                    {activeMapListing ? (
                      <SearchMapListingPopup listing={activeMapListing} />
                    ) : (
                      <p className="text-sm leading-6 text-muted-foreground">
                        Chọn một giá trên bản đồ để xem nhanh thông tin phòng.
                      </p>
                    )}
                  </div>
                  <RadiusControls
                    compact
                    proposedCenter={proposedRadiusCenter}
                    selectingCenter={selectingRadiusCenter}
                    initialRadiusKm={committed.mode === "radius" ? committed.radiusKm : undefined}
                    resetKey={radiusResetKey}
                    onProposedCenterChange={setProposedRadiusCenter}
                    onSelectingCenterChange={setSelectingRadiusCenter}
                    onCommit={(center, radiusKm) => navigate(withRadius(committed, center, radiusKm))}
                  />
                </div>
              </div>
            </Dialog>
          </div>
        </div>
      </div>

      <Drawer
        open={mobileFiltersOpen}
        title="Bộ lọc tìm phòng"
        description="Điều chỉnh điều kiện rồi bấm Tìm kiếm để áp dụng."
        onClose={() => setMobileFiltersOpen(false)}
        closeLabel="Đóng bộ lọc"
      >
        {renderFilterSurface("mobile")}
      </Drawer>

      <aside className={styles.floatingMapToggleWrapper} aria-label="Chuyển đổi hiển thị bản đồ hoặc danh sách">
        <button
          type="button"
          className={styles.floatingMapToggle}
          onClick={mapModeActive ? closeMapMode : openMapMode}
          aria-pressed={mapModeActive}
          aria-label={mapModeActive ? "Chuyển sang xem danh sách phòng" : "Mở bản đồ khám phá phòng"}
        >
          <Icon name={mapModeActive ? "menu" : "map"} className="h-4 w-4" />
          <span>{mapModeActive ? "Danh sách" : "Bản đồ"}</span>
        </button>
      </aside>
    </div>
  );
}
