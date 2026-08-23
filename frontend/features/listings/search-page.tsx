"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapPoint, MapViewport } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import type { Amenity, PropertyType, PublicListingSummary, PublicListingSort } from "../../types/api";
import { ListingCard } from "./listing-card";
import { RadiusControls } from "./radius-controls";
import { SearchFilters, type LookupResource } from "./search-filters";
import { SearchMap } from "./search-map";
import {
  applySearchFilters,
  activeFilterCount,
  parseSearchQuery,
  searchFilterValues,
  serializeSearchState,
  toPublicListingSearchQuery,
  withBounds,
  withPage,
  withRadius,
  type SearchFilterValues,
  type SearchQueryState
} from "./search-query";
import styles from "./search-page.module.css";
import { SaveSearchControl } from "../saved-searches/save-search-control";

type SearchStatus = "idle" | "loading" | "success" | "error";

function searchErrorMessage(error: ApiError | null): string {
  if (error?.status === 422) return "Bộ lọc hoặc khu vực tìm kiếm chưa hợp lệ. Hãy điều chỉnh và thử lại.";
  if (error?.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  return "Không thể tải kết quả lúc này. Vui lòng thử lại.";
}

function initialLookup<T>(): LookupResource<T> {
  return { status: "loading", data: [] };
}

export function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsed = useMemo(() => parseSearchQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const committedIdentity = parsed.ok ? serializeSearchState(parsed.state).toString() : `invalid:${rawQuery}`;
  const [items, setItems] = useState<readonly PublicListingSummary[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchError, setSearchError] = useState<ApiError | null>(null);
  const [searchRetryKey, setSearchRetryKey] = useState(0);
  const [propertyTypes, setPropertyTypes] = useState<LookupResource<PropertyType>>(initialLookup);
  const [amenities, setAmenities] = useState<LookupResource<Amenity>>(initialLookup);
  const [propertyRetryKey, setPropertyRetryKey] = useState(0);
  const [amenityRetryKey, setAmenityRetryKey] = useState(0);
  const [pendingViewport, setPendingViewport] = useState<MapViewport | null>(null);
  const [proposedRadiusCenter, setProposedRadiusCenter] = useState<MapPoint | null>(null);
  const [selectingRadiusCenter, setSelectingRadiusCenter] = useState(false);
  const [radiusResetKey, setRadiusResetKey] = useState(0);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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
    setPendingViewport(null);
    setSelectingRadiusCenter(false);
    if (parsed.ok && parsed.state.mode === "radius") {
      setProposedRadiusCenter({ latitude: parsed.state.centerLat, longitude: parsed.state.centerLng });
    } else {
      setProposedRadiusCenter(null);
    }
  }, [committedIdentity, parsed]);

  useEffect(() => {
    if (!parsed.ok) {
      ++searchRequestIdentity.current;
      setItems([]);
      setCurrentPage(1);
      setHasNextPage(false);
      setSearchError(null);
      setSearchStatus("idle");
      return;
    }

    const controller = new AbortController();
    const identity = ++searchRequestIdentity.current;
    let active = true;
    setItems([]);
    setCurrentPage(parsed.state.page);
    setHasNextPage(false);
    setSearchError(null);
    setSearchStatus("loading");

    void api.listings
      .searchPublic({ ...toPublicListingSearchQuery(parsed.state), pageSize: 20 }, controller.signal)
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
    router.push(query ? `/search?${query}` : "/search");
  };

  const clearSearch = () => {
    setPendingViewport(null);
    setProposedRadiusCenter(null);
    setSelectingRadiusCenter(false);
    setMobileMapOpen(false);
    setMobileFiltersOpen(false);
    setRadiusResetKey((key) => key + 1);
    router.push("/search");
  };

  if (!parsed.ok) {
    return (
      <section aria-labelledby="search-heading" className="min-h-screen">
        <div className="border-b-2 border-heroDark-950 bg-rent-coral py-10">
          <div className="rm-page-container">
            <span className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.16em]">
              <Icon name="sparkles" className="h-4 w-4" />
              Search mode
            </span>
            <h1 id="search-heading" className="mt-3 font-display text-5xl font-bold tracking-[-0.06em] sm:text-7xl">
              Bộ lọc chưa hợp lệ.
            </h1>
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
  const applyFilters = (values: SearchFilterValues, sort: PublicListingSort) => {
    navigate(applySearchFilters(committed, values, sort));
  };

  return (
    <div className={styles.page}>
      <div className={`rm-page-container ${styles.content}`}>
        <header className={styles.searchIntro}>
          <div className={styles.introCopy}>
            <span className={styles.introLabel}>
              <Icon name="sparkles" className="h-3.5 w-3.5" />
              Room finder · TP.HCM
            </span>
            <h1 id="search-heading">
              Lọc nhanh. <span>Chọn đúng phòng.</span>
            </h1>
          </div>
          <p>
            Tập trung vào phòng phù hợp, ngân sách vừa tầm và khu vực bạn muốn sống. Bản đồ chỉ mở khi bạn cần kiểm tra
            vị trí.
          </p>
        </header>

        <div className={styles.layout}>
          <aside
            id="search-filter-sidebar"
            className={styles.filterSidebar}
            data-open={mobileFiltersOpen ? "true" : "false"}
          >
            <SearchFilters
              committed={committed}
              propertyTypes={propertyTypes}
              amenities={amenities}
              onRetryPropertyTypes={() => setPropertyRetryKey((key) => key + 1)}
              onRetryAmenities={() => setAmenityRetryKey((key) => key + 1)}
              onApply={(values, sort) => {
                setMobileFiltersOpen(false);
                applyFilters(values, sort);
              }}
              onClear={clearSearch}
            />
          </aside>

          <main className={styles.results} aria-label="Kết quả tìm phòng">
            <div className={styles.resultsToolbar}>
              <div className={styles.resultSummary}>
                <span className={styles.resultIcon}>
                  <Icon name="home" className="h-5 w-5" />
                </span>
                <div>
                  <h2>
                    Tìm thấy <strong>{items.length}</strong> phòng trên trang này
                  </h2>
                  <p>Các tin công khai phù hợp với điều kiện của bạn</p>
                </div>
              </div>

              <div className={styles.toolbarActions}>
                <SaveSearchControl search={committed} />
                <button
                  type="button"
                  aria-expanded={mobileFiltersOpen}
                  aria-controls="search-filter-sidebar"
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
                <button
                  type="button"
                  aria-expanded={mobileMapOpen}
                  aria-controls="search-map-panel"
                  onClick={() => setMobileMapOpen((open) => !open)}
                  className={styles.mapButton}
                >
                  <Icon name="map" className="h-4 w-4" />
                  <span>{mobileMapOpen ? "Đóng bản đồ" : "Xem bản đồ"}</span>
                </button>
              </div>
            </div>

            {mobileMapOpen ? (
              <div id="search-map-panel" className={styles.mapPanel}>
                <RadiusControls
                  proposedCenter={proposedRadiusCenter}
                  selectingCenter={selectingRadiusCenter}
                  initialRadiusKm={committed.mode === "radius" ? committed.radiusKm : undefined}
                  resetKey={radiusResetKey}
                  onProposedCenterChange={setProposedRadiusCenter}
                  onSelectingCenterChange={setSelectingRadiusCenter}
                  onCommit={(center, radiusKm) => navigate(withRadius(committed, center, radiusKm))}
                />
                <div className={styles.mapCanvas}>
                  <SearchMap
                    listings={items}
                    pendingViewport={pendingViewport}
                    proposedRadiusCenter={proposedRadiusCenter}
                    selectingRadiusCenter={selectingRadiusCenter}
                    onViewportChange={setPendingViewport}
                    onSearchBounds={(viewport) => navigate(withBounds(committed, viewport.bounds))}
                    onRadiusCenterSelected={(point) => {
                      if (!selectingRadiusCenter) return;
                      setProposedRadiusCenter(point);
                      setSelectingRadiusCenter(false);
                    }}
                  />
                </div>
              </div>
            ) : null}

            {/* Feedback States */}
            {searchStatus === "loading" && <LoadingState message="Đang tìm tin đăng…" />}

            {searchStatus === "error" && (
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
            )}

            {searchStatus === "success" && items.length === 0 && (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>
                  <Icon name="search" className="h-7 w-7" />
                </span>
                <h3 className="font-display text-xl font-bold">Chưa tìm thấy tin đăng phù hợp</h3>
                <p className="text-sm font-semibold text-rent-secondary">
                  Vui lòng thử thay đổi từ khóa hoặc nới lỏng một vài điều kiện lọc.
                </p>
                <button type="button" onClick={clearSearch} className={styles.emptyAction}>
                  Xóa bộ lọc và xem tất cả
                </button>
              </div>
            )}

            {items.length > 0 && (
              <div className="space-y-6">
                <div className={styles.listingGrid}>
                  {items.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} showFavorite variant="search" />
                  ))}
                </div>

                <Pagination
                  ariaLabel="Phân trang kết quả tìm kiếm"
                  page={currentPage}
                  hasNextPage={hasNextPage}
                  onPrevious={() => navigate(withPage(committed, currentPage - 1))}
                  onNext={() => navigate(withPage(committed, currentPage + 1))}
                />
                {/* End of Results Indicator */}
                {!hasNextPage && items.length > 0 && (
                  <div className={styles.endState}>
                    <span>Bạn đã xem hết {items.length} phòng trọ phù hợp.</span>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
