"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MapPoint, MapViewport } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { api, ApiError } from "../../lib/api/client";
import type { Amenity, ApiPage, PropertyType, PublicListingSummary, PublicListingSort } from "../../types/api";
import { ListingCard } from "./listing-card";
import { RadiusControls } from "./radius-controls";
import { SearchFilters, type LookupResource } from "./search-filters";
import { SearchMap } from "./search-map";
import {
  applySearchFilters,
  parseSearchQuery,
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
      setSearchError(null);
      setSearchStatus("idle");
      return;
    }

    const controller = new AbortController();
    const identity = ++searchRequestIdentity.current;
    let active = true;
    setResult(null);
    setSearchError(null);
    setSearchStatus("loading");

    void api.listings
      .searchPublic(toPublicListingSearchQuery(parsed.state), controller.signal)
      .then((page) => {
        if (!active || controller.signal.aborted || identity !== searchRequestIdentity.current) return;
        setResult(page);
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
      <section aria-labelledby="search-heading" className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Khám phá chỗ ở</p>
          <h1 id="search-heading" className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Tìm phòng phù hợp tại Thành phố Hồ Chí Minh
          </h1>
        </header>
        <ErrorState
          message={parsed.message}
          action={<Button onClick={clearSearch}>Xóa bộ lọc và bắt đầu lại</Button>}
        />
      </section>
    );
  }

  const committed = parsed.state;
  const listings = result?.data ?? [];

  const applyFilters = (values: SearchFilterValues, sort: PublicListingSort) => {
    navigate(applySearchFilters(committed, values, sort));
  };

  return (
    <section aria-labelledby="search-heading" className="space-y-6">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Khám phá chỗ ở</p>
        <h1 id="search-heading" className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Tìm phòng phù hợp tại Thành phố Hồ Chí Minh
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          Tìm theo tên phòng, khu vực, tiện ích hoặc vị trí xấp xỉ trên bản đồ.
        </p>
      </header>

      <SearchFilters
        committed={committed}
        propertyTypes={propertyTypes}
        amenities={amenities}
        onRetryPropertyTypes={() => setPropertyRetryKey((key) => key + 1)}
        onRetryAmenities={() => setAmenityRetryKey((key) => key + 1)}
        onApply={applyFilters}
        onClear={clearSearch}
      />

      <RadiusControls
        proposedCenter={proposedRadiusCenter}
        selectingCenter={selectingRadiusCenter}
        initialRadiusKm={committed.mode === "radius" ? committed.radiusKm : undefined}
        resetKey={radiusResetKey}
        onProposedCenterChange={setProposedRadiusCenter}
        onSelectingCenterChange={setSelectingRadiusCenter}
        onCommit={(center, radiusKm) => navigate(withRadius(committed, center, radiusKm))}
      />

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Kết quả tìm kiếm</h2>
          <p className="mt-1 text-sm text-slate-600" aria-live="polite">
            {result ? `Trang ${result.pagination.page}` : "Danh sách và bản đồ dùng chung một trang kết quả."}
          </p>
        </div>
        <Button
          variant="secondary"
          className="lg:hidden"
          aria-expanded={mobileMapOpen}
          aria-controls="public-search-map-panel"
          onClick={() => setMobileMapOpen((open) => !open)}
        >
          {mobileMapOpen ? "Ẩn bản đồ" : "Xem bản đồ"}
        </Button>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          {searchStatus === "loading" ? <LoadingState message="Đang tìm tin đăng…" /> : null}
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
          {searchStatus === "success" && result && listings.length === 0 ? (
            <EmptyState
              title="Chưa tìm thấy tin đăng phù hợp"
              description="Hãy thử nới khoảng giá, diện tích, khu vực hoặc bán kính tìm kiếm."
              action={
                <Button variant="secondary" onClick={clearSearch}>
                  Xóa bộ lọc
                </Button>
              }
            />
          ) : null}
          {searchStatus === "success" && listings.length > 0 ? (
            <div className="space-y-4">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : null}

          {searchStatus === "success" && result ? (
            <nav
              aria-label="Phân trang kết quả"
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white p-3"
            >
              <Button
                variant="secondary"
                disabled={result.pagination.page <= 1}
                onClick={() => navigate(withPage(committed, result.pagination.page - 1))}
              >
                Trang trước
              </Button>
              <span className="text-sm font-semibold text-slate-700">Trang {result.pagination.page}</span>
              <Button
                variant="secondary"
                disabled={!result.pagination.hasNextPage}
                onClick={() => navigate(withPage(committed, result.pagination.page + 1))}
              >
                Trang sau
              </Button>
            </nav>
          ) : null}
        </div>

        <div
          id="public-search-map-panel"
          className={`${mobileMapOpen ? "block" : "hidden"} min-w-0 lg:block lg:sticky lg:top-6`}
        >
          <SearchMap
            listings={listings}
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
    </section>
  );
}
