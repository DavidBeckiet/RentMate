"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapPoint, MapViewport } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import type { Amenity, ApiPage, PropertyType, PublicListingSummary, PublicListingSort } from "../../types/api";
import { ListingCard } from "./listing-card";
import { MarketplaceHome } from "./marketplace-home";
import { RadiusControls } from "./radius-controls";
import { SearchFilters, type LookupResource } from "./search-filters";
import { SearchMap } from "./search-map";
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
    setCurrentPage(parsed.state.page);
    setHasNextPage(false);
    setSearchError(null);
    setSearchStatus("loading");

    void api.listings
      .searchPublic({ ...toPublicListingSearchQuery(parsed.state), pageSize: 20 }, controller.signal)
      .then((page) => {
        if (!active || controller.signal.aborted || identity !== searchRequestIdentity.current) return;
        setResult(page);
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
    <div className="flex min-h-screen flex-col">
      {/* Top Hero Dark Banner */}
      <section className="relative border-b-2 border-heroDark-950 bg-rent-coral py-10">
        <div className="rm-page-container grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <span className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.16em]">
              <Icon name="sparkles" className="h-4 w-4" />
              Search mode
            </span>
            <h1
              id="search-heading"
              className="mt-3 font-display text-5xl font-bold leading-none tracking-[-0.06em] sm:text-7xl"
            >
              Tìm đúng chỗ.
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold sm:text-base">
              Lọc theo khu vực, ngân sách, diện tích và tiện ích — dữ liệu được lấy từ các tin đang công khai.
            </p>
          </div>
          <span className="w-fit border-2 border-heroDark-950 bg-rent-yellow px-3 py-2 font-display text-xs font-bold uppercase tracking-[0.12em] shadow-glass-sm">
            Live inventory
          </span>
        </div>
      </section>

      {/* Main 2-Column Search Layout */}
      <div className="rm-page-container w-full flex-1 py-8 sm:py-12">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
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
            <div className="flex flex-col items-center justify-between gap-4 border-2 border-heroDark-950 bg-rent-surface p-4 shadow-glass-sm sm:flex-row">
              <div className="flex items-center gap-2.5 text-sm text-rent-secondary sm:text-base">
                <span className="grid h-10 w-10 place-items-center border-2 border-heroDark-950 bg-rent-accent">
                  <Icon name="home" className="h-5 w-5" />
                </span>
                <span>
                  Đang hiển thị <strong className="font-display text-lg font-bold text-rent-ink">{items.length}</strong>{" "}
                  phòng trọ
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
                {/* Map Toggle Button */}
                <button
                  type="button"
                  onClick={() => setMobileMapOpen(!mobileMapOpen)}
                  className="inline-flex min-h-10 items-center gap-2 border-2 border-heroDark-950 bg-[#e5eefc] px-3 text-xs font-bold shadow-glass-sm transition-transform hover:-translate-y-0.5"
                >
                  <Icon name="map" className="h-4 w-4" />
                  <span>{mobileMapOpen ? "Ẩn bản đồ" : "Xem bản đồ"}</span>
                </button>

                {/* Sort Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Sắp xếp:</span>
                  <select
                    value={committed.mode === "radius" ? "distance_asc" : committed.sort}
                    disabled={committed.mode === "radius"}
                    onChange={(e) => applyFilters(searchFilterValues(committed), e.target.value as PublicListingSort)}
                    className="min-h-10 border-2 border-heroDark-950 bg-white px-3 text-xs font-bold shadow-glass-sm focus:outline-none"
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
            <div
              className={`${mobileMapOpen ? "block" : "hidden lg:block"} space-y-4 border-2 border-heroDark-950 bg-rent-surface p-4 shadow-glass`}
            >
              <RadiusControls
                proposedCenter={proposedRadiusCenter}
                selectingCenter={selectingRadiusCenter}
                initialRadiusKm={committed.mode === "radius" ? committed.radiusKm : undefined}
                resetKey={radiusResetKey}
                onProposedCenterChange={setProposedRadiusCenter}
                onSelectingCenterChange={setSelectingRadiusCenter}
                onCommit={(center, radiusKm) => navigate(withRadius(committed, center, radiusKm))}
              />
              <div className="h-[24rem] overflow-hidden border-2 border-heroDark-950">
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
              <div className="space-y-4 border-2 border-dashed border-heroDark-950 bg-rent-surface p-10 text-center shadow-glass-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center border-2 border-heroDark-950 bg-rent-yellow shadow-glass-sm">
                  <Icon name="search" className="h-7 w-7" />
                </span>
                <h3 className="font-display text-xl font-bold">Chưa tìm thấy tin đăng phù hợp</h3>
                <p className="text-sm font-semibold text-rent-secondary">
                  Vui lòng thử thay đổi từ khóa hoặc điều chỉnh lại bộ lọc bên trái
                </p>
                <button
                  type="button"
                  onClick={clearSearch}
                  className="mt-2 inline-flex min-h-11 items-center gap-2 border-2 border-heroDark-950 bg-rent-accent px-4 font-display text-xs font-bold shadow-glass-sm transition-transform hover:-translate-y-0.5"
                >
                  Xóa bộ lọc và xem tất cả
                </button>
              </div>
            )}

            {/* 3-column listing grid */}
            {items.length > 0 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} showFavorite />
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
                  <div className="border-2 border-heroDark-950 bg-rent-accent p-5 text-center font-display text-xs font-bold shadow-glass-sm">
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
