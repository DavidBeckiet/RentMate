"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapBase, type MapPoint } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { LoadingState } from "../../components/ui/feedback-states";
import { Icon, type IconName } from "../../components/ui/icon";
import { api } from "../../lib/api/client";
import type { PublicListingSummary } from "../../types/api";
import { formatDistanceKm } from "./format";
import { ListingCard } from "./listing-card";

interface PlaceSuggestion {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly icon: IconName;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly currentLocation?: boolean;
}

interface NearbySearch {
  readonly center: MapPoint;
  readonly locationName: string;
  readonly radiusKm: number;
}

const places: readonly PlaceSuggestion[] = [
  { id: "gps", name: "Vị trí hiện tại của bạn", shortName: "Dùng GPS", icon: "target", currentLocation: true },
  {
    id: "uit",
    name: "Đại học Công nghệ Thông tin UIT",
    shortName: "ĐH CNTT",
    icon: "building",
    latitude: 10.87,
    longitude: 106.8031
  },
  {
    id: "bk",
    name: "Đại học Bách Khoa TP.HCM",
    shortName: "ĐH Bách Khoa",
    icon: "building",
    latitude: 10.7721,
    longitude: 106.6579
  },
  {
    id: "choray",
    name: "Bệnh viện Chợ Rẫy",
    shortName: "BV Chợ Rẫy",
    icon: "plus",
    latitude: 10.7578,
    longitude: 106.6595
  },
  {
    id: "landmark81",
    name: "Landmark 81, Bình Thạnh",
    shortName: "Landmark 81",
    icon: "building",
    latitude: 10.795,
    longitude: 106.7219
  },
  {
    id: "ueh",
    name: "Đại học Kinh tế TP.HCM",
    shortName: "ĐH Kinh tế",
    icon: "building",
    latitude: 10.7828,
    longitude: 106.6958
  }
];

const radiusOptions = [1, 3, 5, 10, 15] as const;

export function NearMePage() {
  const [center, setCenter] = useState<MapPoint | null>(null);
  const [locationName, setLocationName] = useState("");
  const [radiusKm, setRadiusKm] = useState(5);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [resultsScrollKey, setResultsScrollKey] = useState(0);
  const [committedSearch, setCommittedSearch] = useState<NearbySearch | null>(null);
  const [listings, setListings] = useState<readonly PublicListingSummary[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const radiusRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdentity = useRef(0);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (resultsScrollKey === 0) return;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [resultsScrollKey]);

  useEffect(
    () => () => {
      if (radiusRefreshTimer.current) clearTimeout(radiusRefreshTimer.current);
      searchRequestIdentity.current += 1;
    },
    []
  );

  const matchingPlaces = useMemo(() => {
    const normalized = locationName.trim().toLowerCase();
    if (!normalized) return places;
    return places.filter((place) => place.name.toLowerCase().includes(normalized));
  }, [locationName]);

  const searchNear = async (
    requestedSearch?: NearbySearch,
    options: { readonly background?: boolean; readonly scroll?: boolean } = {}
  ) => {
    const nextSearch = requestedSearch ?? (center ? { center, locationName, radiusKm } : null);
    if (!nextSearch) {
      setSelectionError("Hãy chọn một địa điểm gợi ý hoặc dùng vị trí GPS trước khi tìm.");
      return;
    }
    if (radiusRefreshTimer.current) {
      clearTimeout(radiusRefreshTimer.current);
      radiusRefreshTimer.current = null;
    }
    const identity = ++searchRequestIdentity.current;
    const background = options.background === true;
    setCommittedSearch(nextSearch);
    setLoading(!background);
    setRefreshing(background);
    setError(null);
    setSelectionError(null);
    setSearched(true);
    if (options.scroll !== false) setResultsScrollKey((key) => key + 1);
    setDropdownOpen(false);
    try {
      const page = await api.listings.searchPublic({
        centerLat: nextSearch.center.latitude,
        centerLng: nextSearch.center.longitude,
        radiusKm: nextSearch.radiusKm,
        sort: "distance_asc",
        page: 1,
        pageSize: 30
      });
      if (identity === searchRequestIdentity.current) setListings(page.data);
    } catch {
      if (identity === searchRequestIdentity.current) {
        setListings([]);
        setError("Máy chủ dữ liệu chưa phản hồi. Vui lòng thử lại sau ít phút.");
      }
    } finally {
      if (identity === searchRequestIdentity.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const choosePlace = (place: PlaceSuggestion) => {
    if (place.currentLocation) {
      getCurrentLocation();
      return;
    }
    if (place.latitude === undefined || place.longitude === undefined) return;
    const point = { latitude: place.latitude, longitude: place.longitude };
    setCenter(point);
    setLocationName(place.name);
    setSelectionError(null);
    setDropdownOpen(false);
    if (searched) {
      const nextSearch = { center: point, locationName: place.name, radiusKm };
      setCommittedSearch(nextSearch);
      void searchNear(nextSearch, { background: true, scroll: false });
    }
  };

  const chooseRadius = (radius: (typeof radiusOptions)[number]) => {
    if (radius === radiusKm) return;
    setRadiusKm(radius);
    if (!searched || !committedSearch) return;

    const nextSearch = { ...committedSearch, radiusKm: radius };
    setCommittedSearch(nextSearch);
    setError(null);
    setRefreshing(true);
    if (radiusRefreshTimer.current) clearTimeout(radiusRefreshTimer.current);
    radiusRefreshTimer.current = setTimeout(() => {
      void searchNear(nextSearch, { background: true, scroll: false });
    }, 450);
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setSelectionError("Trình duyệt hiện tại không hỗ trợ định vị GPS.");
      return;
    }
    setSelectionError(null);
    setGettingLocation(true);
    setDropdownOpen(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6))
        };
        setCenter(point);
        setLocationName("Vị trí GPS hiện tại của bạn");
        setSelectionError(null);
        setGettingLocation(false);
        if (searched) {
          const nextSearch = { center: point, locationName: "Vị trí GPS hiện tại của bạn", radiusKm };
          setCommittedSearch(nextSearch);
          void searchNear(nextSearch, { background: true, scroll: false });
        }
      },
      () => {
        setSelectionError("Không thể lấy vị trí. Hãy cấp quyền GPS hoặc chọn một địa điểm gợi ý.");
        setGettingLocation(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const activeSearch = committedSearch;
  const mapMarkers = [
    ...(activeSearch
      ? [{ id: "search-center", position: activeSearch.center, label: `Tâm tìm kiếm: ${activeSearch.locationName}` }]
      : []),
    ...listings.map((listing) => ({
      id: listing.id,
      position: { latitude: listing.latitude, longitude: listing.longitude },
      label: `${listing.title} — ${listing.distanceKm !== undefined ? formatDistanceKm(listing.distanceKm) : ""}`
    }))
  ];

  return (
    <div className="min-h-screen">
      <section className="border-b-2 border-heroDark-950 bg-[#ff8a72] py-8 sm:py-10">
        <div className="rm-page-container">
          <div className="grid gap-6 lg:grid-cols-[0.65fr_1.35fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 border-2 border-heroDark-950 bg-rent-yellow px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.16em] shadow-glass-sm">
                <Icon name="compass" className="h-4 w-4" />
                Radius explorer
              </span>
              <h1 className="mt-5 font-display text-4xl font-bold leading-[0.9] tracking-[-0.065em] uppercase sm:text-5xl lg:text-6xl">
                Quanh bạn
                <br />
                có gì?
              </h1>
              <p className="mt-4 max-w-lg text-sm font-semibold leading-6">
                Đặt một tâm điểm, chọn bán kính rồi chủ động tìm. Bản đồ không tự gửi yêu cầu khi bạn di chuyển.
              </p>
            </div>

            <div
              ref={searchRef}
              className="relative border-2 border-heroDark-950 bg-rent-surface p-4 shadow-card-elevated sm:p-5"
            >
              <label htmlFor="near-location" className="font-display text-[11px] font-bold uppercase tracking-[0.15em]">
                Điểm bắt đầu
              </label>
              <div className="mt-2 flex border-2 border-heroDark-950 bg-white">
                <span className="grid w-12 shrink-0 place-items-center border-r-2 border-heroDark-950 bg-[#e5eefc]">
                  <Icon name="search" className="h-5 w-5" />
                </span>
                <input
                  id="near-location"
                  value={locationName}
                  role="combobox"
                  aria-expanded={dropdownOpen}
                  aria-controls="near-location-options"
                  onFocus={() => setDropdownOpen(true)}
                  onChange={(event) => {
                    setLocationName(event.currentTarget.value);
                    setCenter(null);
                    setSelectionError(null);
                    setDropdownOpen(true);
                  }}
                  className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-sm font-bold outline-none"
                  placeholder="Trường học, bệnh viện, công ty..."
                />
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  disabled={gettingLocation}
                  className="inline-flex min-h-12 items-center gap-2 border-l-2 border-heroDark-950 bg-rent-accent px-3 font-display text-xs font-bold disabled:opacity-60"
                >
                  <Icon name="target" className="h-4 w-4" />
                  <span className="hidden sm:inline">{gettingLocation ? "Đang lấy…" : "GPS"}</span>
                </button>
              </div>

              {dropdownOpen ? (
                <div
                  id="near-location-options"
                  role="listbox"
                  className="absolute left-4 right-4 top-[6.6rem] z-30 max-h-72 overflow-y-auto border-2 border-heroDark-950 bg-rent-surface shadow-card-elevated sm:left-5 sm:right-5"
                >
                  <div className="border-b-2 border-heroDark-950 bg-rent-yellow px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.14em]">
                    Điểm đến phổ biến
                  </div>
                  {matchingPlaces.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      role="option"
                      aria-selected={locationName === place.name}
                      onClick={() => choosePlace(place)}
                      className="group flex min-h-12 w-full items-center justify-between gap-3 border-b border-heroDark-950/20 px-4 text-left text-sm font-bold last:border-b-0 hover:bg-rent-accent"
                    >
                      <span className="flex items-center gap-3">
                        <Icon name={place.icon} className="h-4 w-4" />
                        {place.name}
                      </span>
                      <Icon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </button>
                  ))}
                  {matchingPlaces.length === 0 ? (
                    <p className="p-4 text-sm font-semibold text-rent-secondary">Không có gợi ý phù hợp.</p>
                  ) : null}
                </div>
              ) : null}

              {selectionError ? (
                <p role="alert" className="mt-3 border-l-4 border-rose-700 pl-3 text-xs font-bold text-rose-800">
                  {selectionError}
                </p>
              ) : null}

              <fieldset className="mt-5">
                <legend className="font-display text-[11px] font-bold uppercase tracking-[0.15em]">
                  Bán kính tìm kiếm
                </legend>
                <div className="mt-2 grid grid-cols-5 border-2 border-heroDark-950">
                  {radiusOptions.map((radius) => (
                    <button
                      key={radius}
                      type="button"
                      onClick={() => chooseRadius(radius)}
                      aria-pressed={radiusKm === radius}
                      className={`min-h-11 border-r-2 border-heroDark-950 font-display text-xs font-bold last:border-r-0 ${radiusKm === radius ? "bg-rent-coral" : "bg-white hover:bg-[#e5eefc]"}`}
                    >
                      {radius} km
                    </button>
                  ))}
                </div>
              </fieldset>

              <Button className="mt-5 w-full" disabled={loading} onClick={() => void searchNear()}>
                <Icon name="compass" className="h-5 w-5" />
                Tìm phòng trong bán kính
              </Button>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="mr-2 font-display text-[10px] font-bold uppercase tracking-[0.14em]">Đi nhanh:</span>
            {places
              .filter((place) => !place.currentLocation)
              .slice(0, 4)
              .map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => choosePlace(place)}
                  className="inline-flex min-h-11 items-center gap-2 border-2 border-heroDark-950 bg-rent-surface px-3 text-xs font-bold shadow-glass-sm transition-transform hover:-translate-y-0.5"
                >
                  <Icon name={place.icon} className="h-3.5 w-3.5" />
                  {place.shortName}
                </button>
              ))}
          </div>
        </div>
      </section>

      {searched && activeSearch ? (
        <section ref={resultsRef} className="rm-page-container scroll-mt-24 py-10 sm:py-12">
          <div className="mb-7 border-b-2 border-heroDark-950 pb-5">
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.15em] text-rent-coral">
              Kết quả bán kính
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.05em] sm:text-5xl">
              {loading ? "Đang tìm phòng quanh đây" : `${listings.length} chỗ ở quanh tâm điểm`}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-rent-secondary">
                {activeSearch.locationName} · {activeSearch.radiusKm} km · sắp xếp gần nhất
              </p>
              {refreshing ? (
                <span
                  role="status"
                  className="inline-flex items-center gap-2 border border-heroDark-950 bg-rent-accent px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em]"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-heroDark-950 motion-reduce:animate-none" />
                  Đang cập nhật kết quả
                </span>
              ) : null}
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="mb-6 flex flex-col gap-3 border-2 border-heroDark-950 bg-rent-yellow p-4 shadow-glass-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm font-bold">{error}</p>
              <Button variant="secondary" onClick={() => void searchNear(activeSearch)}>
                Thử lại
              </Button>
            </div>
          ) : null}

          {loading ? (
            <LoadingState message="Đang quét các chỗ ở trong bán kính…" />
          ) : (
            <div className="grid gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
              <div className="border-2 border-heroDark-950 bg-rent-surface p-3 shadow-card-elevated lg:sticky lg:top-24">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <span className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.12em]">
                    <Icon name="map" className="h-4 w-4" />
                    Phạm vi {activeSearch.radiusKm} km
                  </span>
                  <span className="bg-rent-accent px-2 py-1 text-[10px] font-bold">{listings.length} điểm</span>
                </div>
                <div className="h-[26rem] overflow-hidden border-2 border-heroDark-950 sm:h-[30rem]">
                  <MapBase
                    ariaLabel={`Bản đồ phòng trong bán kính ${activeSearch.radiusKm} km`}
                    center={activeSearch.center}
                    zoom={13}
                    markers={mapMarkers}
                    radiusCircle={{
                      center: activeSearch.center,
                      radiusMeters: activeSearch.radiusKm * 1000,
                      label: `Bán kính ${activeSearch.radiusKm} km quanh ${activeSearch.locationName}`
                    }}
                    className="h-full w-full"
                  />
                </div>
              </div>

              {listings.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2">
                  {listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} showFavorite />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center border-2 border-dashed border-heroDark-950 bg-rent-surface p-8 text-center shadow-glass-sm">
                  <span className="grid h-12 w-12 place-items-center border-2 border-heroDark-950 bg-rent-yellow shadow-glass-sm">
                    <Icon name="search" className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-bold">Chưa có phòng trong phạm vi này</h3>
                  <p className="mt-2 max-w-sm text-sm font-semibold text-rent-secondary">
                    Hãy thử tăng bán kính hoặc chọn một tâm tìm kiếm khác.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
