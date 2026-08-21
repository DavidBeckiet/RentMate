"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapPoint, MapViewport } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { api, ApiError } from "../../lib/api/client";
import type { Amenity, ApiPage, PropertyType, PublicListingSummary, PublicListingSort } from "../../types/api";
import { ListingCard } from "./listing-card";
import { MarketplaceHome } from "./marketplace-home";
import { RadiusControls } from "./radius-controls";
import { SearchFilters, type LookupResource } from "./search-filters";
import { SearchMap } from "./search-map";
import styles from "./search-page.module.css";
import {
  applySearchFilters,
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
  const [result, setResult] = useState<ApiPage<PublicListingSummary> | null>(null);
  const [items, setItems] = useState<readonly PublicListingSummary[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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
  const searchRequestIdentity = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

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
      setResult(null);
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
    setResult(null);
    setItems([]);
    setCurrentPage(1);
    setHasNextPage(false);
    setSearchError(null);
    setSearchStatus("loading");

    void api.listings
      .searchPublic({ ...toPublicListingSearchQuery(parsed.state), page: 1, pageSize: 15 }, controller.signal)
      .then((page) => {
        if (!active || controller.signal.aborted || identity !== searchRequestIdentity.current) return;
        setResult(page);
        setItems(page.data);
        setCurrentPage(1);
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

  const loadMore = () => {
    if (!hasNextPage || loadingMore || searchStatus === "loading" || !parsed.ok) return;
    setLoadingMore(true);
    const nextPage = currentPage + 1;
    const query = {
      ...toPublicListingSearchQuery(parsed.state),
      page: nextPage,
      pageSize: 15
    };
    void api.listings
      .searchPublic(query)
      .then((page) => {
        setItems((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const newItems = page.data.filter((i) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
        setCurrentPage(page.pagination.page);
        setHasNextPage(page.pagination.hasNextPage);
      })
      .catch(() => {
        // keep current items on error
      })
      .finally(() => {
        setLoadingMore(false);
      });
  };

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || loadingMore || searchStatus !== "success") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "350px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, loadingMore, searchStatus, currentPage, committedIdentity]);

  const navigate = (state: SearchQueryState) => {
    const query = serializeSearchState(state).toString();
    router.push(query ? `/?${query}` : "/");
  };

  const clearSearch = () => {
    setPendingViewport(null);
    setProposedRadiusCenter(null);
    setSelectingRadiusCenter(false);
    setMobileMapOpen(false);
    setRadiusResetKey((key) => key + 1);
    router.push("/");
  };

  if (!parsed.ok) {
    return (
      <section aria-labelledby="search-heading" className="min-h-screen bg-slate-50">
        <div className="bg-heroDark-950 text-white py-10 px-4 sm:px-6 lg:px-8 bg-grid-pattern border-b border-slate-800">
          <div className="rm-page-container">
            <span className="text-xs font-bold text-sky-400 uppercase tracking-widest">
              ✦ Khám phá chỗ ở
            </span>
            <h1 id="search-heading" className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight">
              Tìm <span className="text-brandBlue-500">Phòng Trọ</span>
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
  const listings = result?.data ?? [];

  const applyFilters = (values: SearchFilterValues, sort: PublicListingSort) => {
    navigate(applySearchFilters(committed, values, sort));
  };

  if (rawQuery.length === 0) {
    return (
      <MarketplaceHome
        propertyTypes={propertyTypes.data}
        propertyTypesLoading={propertyTypes.status === "loading"}
        listings={result}
        listingsStatus={searchStatus}
        listingsError={searchStatus === "error" ? searchErrorMessage(searchError) : null}
        onSearch={(values) => applyFilters(values, "newest")}
        onRetryListings={() => setSearchRetryKey((key) => key + 1)}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Hero Dark Banner */}
      <section className="bg-heroDark-950 text-white relative py-10 px-4 sm:px-6 lg:px-8 bg-grid-pattern border-b border-slate-800">
        <div className="rm-page-container">
          <span className="text-xs font-bold text-sky-400 uppercase tracking-widest">
            ✦ Khám phá chỗ ở
          </span>
          <h1 id="search-heading" className="mt-2 text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
            Tìm <span className="text-brandBlue-500">Phòng Trọ</span>
          </h1>
          <p className="mt-2 text-slate-400 text-sm sm:text-base max-w-2xl font-normal">
            Lựa chọn phòng trọ phù hợp với nhu cầu và ngân sách của bạn
          </p>
        </div>
      </section>

      {/* Main 2-Column Search Layout */}
      <div className="rm-page-container py-8 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Sidebar Filter Column */}
          <div className="lg:col-span-4 xl:col-span-3">
            <SearchFilters
              committed={committed}
              propertyTypes={propertyTypes}
              amenities={amenities}
              onRetryPropertyTypes={() => setPropertyRetryKey((key) => key + 1)}
              onRetryAmenities={() => setAmenityRetryKey((key) => key + 1)}
              onApply={applyFilters}
              onClear={clearSearch}
            />
          </div>

          {/* Right Results Column */}
          <main className="lg:col-span-8 xl:col-span-9 space-y-6">
            {/* Results Summary & Sorting Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-slate-700 text-sm sm:text-base">
                <span className="text-xl">🏠</span>
                <span>
                  Đang hiển thị{" "}
                  <strong className="text-slate-900 font-extrabold text-lg">
                    {items.length}
                  </strong>{" "}
                  phòng trọ
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
                {/* Map Toggle Button */}
                <button
                  type="button"
                  onClick={() => setMobileMapOpen(!mobileMapOpen)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-brandBlue-50 hover:text-brandBlue-600 transition"
                >
                  <span>🗺️</span>
                  <span>{mobileMapOpen ? "Ẩn bản đồ" : "Xem bản đồ"}</span>
                </button>

                {/* Sort Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Sắp xếp:</span>
                  <select
                    value={committed.mode === "radius" ? "distance_asc" : committed.sort}
                    disabled={committed.mode === "radius"}
                    onChange={(e) =>
                      applyFilters(searchFilterValues(committed), e.target.value as PublicListingSort)
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-brandBlue-500 focus:outline-none"
                  >
                    {committed.mode === "radius" ? (
                      <option value="distance_asc">Khoảng cách gần nhất</option>
                    ) : (
                      <>
                        <option value="newest">Mới nhất</option>
                        <option value="rent_asc">Giá thấp đến cao</option>
                        <option value="rent_desc">Giá cao đến thấp</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Optional Interactive Map Panel */}
            {mobileMapOpen && (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <RadiusControls
                  proposedCenter={proposedRadiusCenter}
                  selectingCenter={selectingRadiusCenter}
                  initialRadiusKm={committed.mode === "radius" ? committed.radiusKm : undefined}
                  resetKey={radiusResetKey}
                  onProposedCenterChange={setProposedRadiusCenter}
                  onSelectingCenterChange={setSelectingRadiusCenter}
                  onCommit={(center, radiusKm) => navigate(withRadius(committed, center, radiusKm))}
                />
                <div className="h-[24rem] overflow-hidden rounded-xl border border-slate-100">
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
            )}

            {/* Feedback States */}
            {searchStatus === "loading" && <LoadingState message="Đang tìm phòng trọ phù hợp…" />}

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
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-3">
                <span className="text-4xl">📂</span>
                <h3 className="text-lg font-bold text-slate-800">Không tìm thấy phòng phù hợp</h3>
                <p className="text-sm text-slate-500">
                  Vui lòng thử thay đổi từ khóa hoặc điều chỉnh lại bộ lọc bên trái
                </p>
                <button
                  type="button"
                  onClick={clearSearch}
                  className="mt-2 inline-flex items-center gap-1 rounded-xl bg-brandBlue-500 px-4 py-2 text-xs font-bold text-white hover:bg-brandBlue-600 transition"
                >
                  Xóa bộ lọc và xem tất cả
                </button>
              </div>
            )}

            {/* 3-Column Listing Grid (3 cards per row, 5 rows = 15 per batch) */}
            {items.length > 0 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {items.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} showFavorite />
                  ))}
                </div>

                {/* Infinite Scroll Sentinel Element */}
                <div ref={sentinelRef} className="h-4 w-full" aria-hidden="true" />

                {/* Loading More Indicator */}
                {loadingMore && (
                  <div className="flex items-center justify-center gap-3 py-6 text-sm font-bold text-slate-600">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-brandBlue-500 border-t-transparent" />
                    <span>Đang tải thêm 15 phòng trọ tiếp theo...</span>
                  </div>
                )}

                {/* Manual Load More Button as Fallback */}
                {hasNextPage && !loadingMore && (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={loadMore}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-xs font-bold text-slate-700 shadow-sm transition hover:border-brandBlue-500 hover:text-brandBlue-600 hover:scale-[1.02] active:scale-95"
                    >
                      <span>Tải thêm phòng trọ</span>
                      <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* End of Results Indicator */}
                {!hasNextPage && items.length > 0 && (
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 text-center text-xs font-bold text-slate-500 shadow-sm">
                    <span>🎉 Bạn đã xem hết tất cả {items.length} phòng trọ phù hợp</span>
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

