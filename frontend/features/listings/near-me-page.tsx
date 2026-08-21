"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapBase, type MapPoint } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { LoadingState } from "../../components/ui/feedback-states";
import { Icon, type IconName } from "../../components/ui/icon";
import { api } from "../../lib/api/client";
import type { PublicListingSummary } from "../../types/api";
import { demoListings } from "./homepage-content";
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
const demoNearby = demoListings.map((listing, index) => ({
  ...listing,
  distanceKm: [0.8, 1.6, 2.4, 3.1][index]
}));

export function NearMePage() {
  const [center, setCenter] = useState<MapPoint>({ latitude: 10.7721, longitude: 106.6579 });
  const [locationName, setLocationName] = useState("Đại học Bách Khoa TP.HCM");
  const [radiusKm, setRadiusKm] = useState(5);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [listings, setListings] = useState<readonly PublicListingSummary[]>([]);
  const [layout, setLayout] = useState<"split" | "wide">("split");
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const matchingPlaces = useMemo(() => {
    const normalized = locationName.trim().toLowerCase();
    if (!normalized) return places;
    return places.filter((place) => place.name.toLowerCase().includes(normalized));
  }, [locationName]);

  const searchNear = async (point = center, radius = radiusKm) => {
    setLoading(true);
    setError(null);
    setSearched(true);
    setDropdownOpen(false);
    try {
      const page = await api.listings.searchPublic({
        centerLat: point.latitude,
        centerLng: point.longitude,
        radiusKm: radius,
        sort: "distance_asc",
        page: 1,
        pageSize: 30
      });
      setListings(page.data);
    } catch {
      setListings([]);
      setError("Máy chủ dữ liệu chưa phản hồi. RentMate đang giữ dữ liệu mẫu để bạn tiếp tục preview giao diện.");
    } finally {
      setLoading(false);
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
    void searchNear(point, radiusKm);
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Trình duyệt hiện tại không hỗ trợ định vị GPS.");
      return;
    }
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
        setGettingLocation(false);
        void searchNear(point, radiusKm);
      },
      () => {
        setError("Không thể lấy vị trí. Hãy cấp quyền GPS hoặc chọn một địa điểm gợi ý.");
        setGettingLocation(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const preview = !searched || error !== null || (!loading && listings.length === 0);
  const visibleListings = preview ? demoNearby : listings;
  const mapMarkers = [
    { id: "search-center", position: center, label: `Tâm tìm kiếm: ${locationName}` },
    ...visibleListings.map((listing) => ({
      id: listing.id,
      position: { latitude: listing.latitude, longitude: listing.longitude },
      label: `${listing.title} — ${listing.distanceKm !== undefined ? formatDistanceKm(listing.distanceKm) : ""}`
    }))
  ];

  return (
    <div className="min-h-screen">
      <section className="border-b-2 border-heroDark-950 bg-rent-coral py-12 sm:py-16">
        <div className="rm-page-container">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <span className="inline-flex items-center gap-2 border-2 border-heroDark-950 bg-rent-yellow px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.16em] shadow-glass-sm">
                <Icon name="compass" className="h-4 w-4" />
                Radius explorer
              </span>
              <h1 className="mt-6 font-display text-6xl font-bold leading-[0.84] tracking-[-0.075em] uppercase sm:text-8xl lg:text-[7.2rem]">
                Quanh bạn
                <br />
                có gì?
              </h1>
              <p className="mt-6 max-w-lg text-base font-semibold leading-7">
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
                  onFocus={() => setDropdownOpen(true)}
                  onChange={(event) => {
                    setLocationName(event.currentTarget.value);
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
                <div className="absolute left-4 right-4 top-[6.6rem] z-30 max-h-72 overflow-y-auto border-2 border-heroDark-950 bg-rent-surface shadow-card-elevated sm:left-5 sm:right-5">
                  <div className="border-b-2 border-heroDark-950 bg-rent-yellow px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.14em]">
                    Điểm đến phổ biến
                  </div>
                  {matchingPlaces.map((place) => (
                    <button
                      key={place.id}
                      type="button"
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

              <fieldset className="mt-5">
                <legend className="font-display text-[11px] font-bold uppercase tracking-[0.15em]">
                  Bán kính tìm kiếm
                </legend>
                <div className="mt-2 grid grid-cols-5 border-2 border-heroDark-950">
                  {radiusOptions.map((radius) => (
                    <button
                      key={radius}
                      type="button"
                      onClick={() => setRadiusKm(radius)}
                      className={`min-h-10 border-r-2 border-heroDark-950 font-display text-xs font-bold last:border-r-0 ${radiusKm === radius ? "bg-rent-coral" : "bg-white hover:bg-[#e5eefc]"}`}
                    >
                      {radius} km
                    </button>
                  ))}
                </div>
              </fieldset>

              <Button className="mt-5 w-full" onClick={() => void searchNear()}>
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
                  className="inline-flex min-h-9 items-center gap-2 border-2 border-heroDark-950 bg-rent-surface px-3 text-xs font-bold shadow-glass-sm transition-transform hover:-translate-y-0.5"
                >
                  <Icon name={place.icon} className="h-3.5 w-3.5" />
                  {place.shortName}
                </button>
              ))}
          </div>
        </div>
      </section>

      <section className="rm-page-container py-10 sm:py-14">
        <div className="mb-7 flex flex-col justify-between gap-4 border-b-2 border-heroDark-950 pb-5 sm:flex-row sm:items-end">
          <div>
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.15em] text-rent-coral">
              {searched ? "Kết quả bán kính" : "Preview khám phá"}
            </span>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.05em] sm:text-5xl">
              {visibleListings.length} chỗ ở quanh tâm điểm
            </h2>
            <p className="mt-2 text-sm font-semibold text-rent-secondary">
              {locationName} · {radiusKm} km · sắp xếp gần nhất
            </p>
          </div>
          <div className="flex border-2 border-heroDark-950 bg-rent-surface shadow-glass-sm">
            <button
              type="button"
              onClick={() => setLayout("split")}
              className={`min-h-10 px-3 font-display text-xs font-bold ${layout === "split" ? "bg-rent-accent" : ""}`}
            >
              Chia đôi
            </button>
            <button
              type="button"
              onClick={() => setLayout("wide")}
              className={`min-h-10 border-l-2 border-heroDark-950 px-3 font-display text-xs font-bold ${layout === "wide" ? "bg-rent-accent" : ""}`}
            >
              Bản đồ rộng
            </button>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-6 flex flex-col gap-3 border-2 border-heroDark-950 bg-rent-yellow p-4 shadow-glass-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm font-bold">{error}</p>
            <Button variant="secondary" onClick={() => void searchNear()}>
              Thử lại
            </Button>
          </div>
        ) : null}

        {preview ? (
          <div className="mb-6 w-fit border-2 border-heroDark-950 bg-[#e5eefc] px-3 py-1 font-display text-[10px] font-bold uppercase tracking-[0.12em] shadow-glass-sm">
            Dữ liệu mẫu để preview
          </div>
        ) : null}

        {loading ? (
          <LoadingState message="Đang quét các chỗ ở trong bán kính…" />
        ) : (
          <div className={layout === "split" ? "grid gap-7 lg:grid-cols-2 lg:items-start" : "space-y-8"}>
            <div
              className={`border-2 border-heroDark-950 bg-rent-surface p-3 shadow-card-elevated ${layout === "split" ? "lg:sticky lg:top-24" : ""}`}
            >
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <span className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.12em]">
                  <Icon name="map" className="h-4 w-4" />
                  Bản đồ xấp xỉ
                </span>
                <span className="bg-rent-accent px-2 py-1 text-[10px] font-bold">{visibleListings.length} điểm</span>
              </div>
              <div
                className={
                  layout === "split"
                    ? "h-[36rem] overflow-hidden border-2 border-heroDark-950"
                    : "h-[32rem] overflow-hidden border-2 border-heroDark-950 sm:h-[42rem]"
                }
              >
                <MapBase
                  ariaLabel="Bản đồ tìm phòng gần bạn"
                  center={center}
                  zoom={radiusKm <= 3 ? 14 : radiusKm <= 5 ? 13 : 12}
                  markers={mapMarkers}
                  className="h-full w-full"
                />
              </div>
            </div>

            <div
              className={layout === "split" ? "grid gap-6 sm:grid-cols-2" : "grid gap-6 sm:grid-cols-2 lg:grid-cols-4"}
            >
              {visibleListings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  showFavorite={!preview}
                  href={preview ? "/search" : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
