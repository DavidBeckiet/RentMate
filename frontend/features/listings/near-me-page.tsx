"use client";

import { useEffect, useRef, useState } from "react";
import { MapBase, type MapPoint } from "../../components/map/map-base";
import { LoadingState } from "../../components/ui/feedback-states";
import { api } from "../../lib/api/client";
import type { PublicListingSummary } from "../../types/api";
import { formatDistanceKm } from "./format";
import { ListingCard } from "./listing-card";

interface Landmark {
  readonly name: string;
  readonly shortName: string;
  readonly icon: string;
  readonly latitude: number;
  readonly longitude: number;
}

const popularLandmarks: readonly Landmark[] = [
  {
    name: "Đại học Công nghệ Thông tin - ĐHQG TP.HCM",
    shortName: "ĐH CNTT",
    icon: "🎓",
    latitude: 10.87,
    longitude: 106.8031
  },
  {
    name: "Đại học Bách Khoa TP.HCM (Quận 10)",
    shortName: "ĐH Bách Khoa",
    icon: "🎓",
    latitude: 10.7721,
    longitude: 106.6579
  },
  {
    name: "Bệnh viện Chợ Rẫy (Quận 5)",
    shortName: "BV Chợ Rẫy",
    icon: "🏥",
    latitude: 10.7578,
    longitude: 106.6595
  },
  {
    name: "Đại học Quốc Gia Hà Nội (Cầu Giấy)",
    shortName: "ĐH Quốc Gia HN",
    icon: "🎓",
    latitude: 21.0381,
    longitude: 105.7828
  },
  {
    name: "Khu Công Nghệ Cao Hòa Lạc",
    shortName: "KCN Hòa Lạc",
    icon: "🏭",
    latitude: 21.0028,
    longitude: 105.5342
  }
];

const radiusOptions = [1, 3, 5, 10, 15] as const;

interface SearchSuggestion {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly isCurrentLocation?: boolean;
}

const defaultSuggestions: readonly SearchSuggestion[] = [
  {
    id: "current-loc",
    name: "Vị trí hiện tại của bạn",
    icon: "📍",
    isCurrentLocation: true
  },
  {
    id: "uit",
    name: "Đại học Công nghệ Thông tin UIT",
    icon: "🎓",
    latitude: 10.87,
    longitude: 106.8031
  },
  {
    id: "bk",
    name: "Đại học Bách Khoa TP.HCM",
    icon: "🎓",
    latitude: 10.7721,
    longitude: 106.6579
  },
  {
    id: "choray",
    name: "Bệnh viện Chợ Rẫy",
    icon: "🏥",
    latitude: 10.7578,
    longitude: 106.6595
  },
  {
    id: "landmark81",
    name: "Landmark 81 Bình Thạnh",
    icon: "🏢",
    latitude: 10.795,
    longitude: 106.7219
  },
  {
    id: "ueh",
    name: "Đại học Kinh Tế TP.HCM (UEH)",
    icon: "🎓",
    latitude: 10.7828,
    longitude: 106.6958
  }
];

export function NearMePage() {
  const [selectedCenter, setSelectedCenter] = useState<MapPoint>({
    latitude: 10.7721,
    longitude: 106.6579
  });
  const [locationName, setLocationName] = useState<string>("");
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [listings, setListings] = useState<readonly PublicListingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resultsSectionRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const searchNearCenter = (point: MapPoint, radius: number) => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    api.listings
      .searchPublic({
        centerLat: point.latitude,
        centerLng: point.longitude,
        radiusKm: radius,
        sort: "distance_asc",
        page: 1,
        pageSize: 30
      })
      .then((page) => {
        setListings(page.data);
      })
      .catch(() => {
        setError("Không thể tải phòng trong bán kính này. Vui lòng thử lại sau.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Trình duyệt của bạn không hỗ trợ định vị GPS.");
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
        setSelectedCenter(point);
        setLocationName("📍 Vị trí GPS hiện tại của bạn");
        setGettingLocation(false);
        searchNearCenter(point, radiusKm);
        resultsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
      },
      () => {
        alert("Không thể lấy vị trí hiện tại. Vui lòng cho phép quyền truy cập vị trí trên trình duyệt.");
        setGettingLocation(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSelectLandmark = (landmark: Landmark) => {
    const point = { latitude: landmark.latitude, longitude: landmark.longitude };
    setSelectedCenter(point);
    setLocationName(landmark.name);
    setDropdownOpen(false);
    searchNearCenter(point, radiusKm);
    resultsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    if (suggestion.isCurrentLocation) {
      handleGetCurrentLocation();
      return;
    }
    if (suggestion.latitude && suggestion.longitude) {
      const point = { latitude: suggestion.latitude, longitude: suggestion.longitude };
      setSelectedCenter(point);
      setLocationName(suggestion.name);
      setDropdownOpen(false);
      searchNearCenter(point, radiusKm);
      resultsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleSearchClick = () => {
    setDropdownOpen(false);
    searchNearCenter(selectedCenter, radiusKm);
    resultsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const mapMarkers = [
    {
      id: "center-point",
      position: selectedCenter,
      label: `🎯 Vị trí tìm kiếm: ${locationName || "Vị trí đã chọn"}`
    },
    ...listings.map((item) => ({
      id: item.id,
      position: { latitude: item.latitude, longitude: item.longitude },
      label: `${item.title} — ${item.distanceKm !== undefined ? formatDistanceKm(item.distanceKm) : ""}`
    }))
  ];

  const filteredSuggestions = locationName.trim()
    ? defaultSuggestions.filter((s) => s.name.toLowerCase().includes(locationName.toLowerCase()))
    : defaultSuggestions;

  const [layoutMode, setLayoutMode] = useState<"split" | "map-top">("split");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col w-full">
      {/* 1. HERO DARK SEARCH SECTION (FULL-WIDTH EXPANDED) */}
      <section className="w-full bg-heroDark-950 text-white relative py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-grid-pattern border-b border-slate-800 overflow-hidden">
        {/* Ambient Glowing Spotlights */}
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] sm:w-[900px] h-[350px] bg-brandBlue-500/20 blur-[140px] rounded-full" />

        <div className="relative z-10 max-w-5xl mx-auto text-center space-y-5">
          {/* Header Title */}
          <div className="flex items-center justify-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brandBlue-500/20 text-brandBlue-400 border border-brandBlue-500/30 text-2xl shadow-lg shadow-brandBlue-500/20">
              📍
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white">
              Tìm phòng trọ <span className="text-brandBlue-500">gần bạn</span>
            </h1>
          </div>

          <p className="text-slate-400 text-sm sm:text-base md:text-lg max-w-2xl mx-auto font-normal">
            Nhập tên trường học, bệnh viện, công ty... để tìm phòng trong bán kính gần nhất
          </p>

          {/* Expanded Search Box Card */}
          <div
            ref={searchContainerRef}
            className="mt-8 rounded-3xl bg-slate-900/90 border border-slate-700/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6 text-left max-w-3xl mx-auto relative"
          >
            {/* Input with GPS Button & Suggestions Dropdown */}
            <div className="relative">
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute left-4 text-slate-400">
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                </div>

                <input
                  type="text"
                  value={locationName}
                  onFocus={() => setDropdownOpen(true)}
                  onChange={(e) => {
                    setLocationName(e.target.value);
                    setDropdownOpen(true);
                  }}
                  placeholder="VD: Đại học Công nghệ Thông tin, Bệnh viện Chợ Rẫy..."
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 py-4 pl-12 pr-36 text-sm sm:text-base font-semibold text-white placeholder-slate-500 focus:border-brandBlue-500 focus:bg-slate-950 focus:outline-none transition-all shadow-inner"
                />

                <button
                  type="button"
                  onClick={handleGetCurrentLocation}
                  disabled={gettingLocation}
                  className="absolute right-2.5 inline-flex items-center gap-1.5 rounded-xl bg-brandBlue-500/15 border border-brandBlue-500/35 px-3.5 py-2.5 text-xs font-bold text-sky-400 hover:bg-brandBlue-500/25 transition hover:scale-105 active:scale-95 disabled:opacity-50"
                  title="Lấy vị trí GPS của bạn"
                >
                  <span className={`h-2 w-2 rounded-full bg-sky-400 ${gettingLocation ? "animate-ping" : ""}`} />
                  <span>{gettingLocation ? "Đang lấy GPS…" : "Vị trí của bạn"}</span>
                </button>
              </div>

              {/* Suggestions Dropdown Popup (MATCHING SCREENSHOT) */}
              {dropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-white text-slate-800 shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    <span>🔥</span>
                    <span>Mọi người đang tìm</span>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {filteredSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectSuggestion(item)}
                        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-brandBlue-50/70 transition text-left group"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{item.icon}</span>
                          <span className="text-sm font-bold text-slate-800 group-hover:text-brandBlue-600 transition">
                            {item.name}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 group-hover:text-brandBlue-600 group-hover:translate-x-0.5 transition-all">
                          →
                        </span>
                      </button>
                    ))}
                    {filteredSuggestions.length === 0 && (
                      <div className="p-4 text-center text-xs text-slate-400">
                        Không tìm thấy gợi ý phù hợp cho "{locationName}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Radius Selector Pills */}
            <div className="flex flex-wrap items-center gap-3.5 border-t border-slate-800/80 pt-4">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-300">
                <span>📐</span> Bán kính:
              </span>

              <div className="flex items-center gap-2 flex-wrap">
                {radiusOptions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRadiusKm(r)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-all ${
                      radiusKm === r
                        ? "bg-brandBlue-500 text-white shadow-lg shadow-brandBlue-500/35 scale-105"
                        : "bg-slate-800/80 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>

            {/* Big Action Button */}
            <button
              type="button"
              onClick={handleSearchClick}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brandBlue-500 to-sky-500 py-4 text-sm sm:text-base font-black text-white shadow-xl shadow-brandBlue-500/30 transition hover:from-brandBlue-600 hover:to-sky-600 hover:scale-[1.01] active:scale-98"
            >
              <span>🧭</span>
              <span>Tìm phòng gần đây</span>
            </button>
          </div>

          {/* Quick Landmark Suggestions */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-slate-400">
            <span className="text-slate-500 mr-1">Tìm nhanh:</span>
            {popularLandmarks.map((landmark) => (
              <button
                key={landmark.name}
                type="button"
                onClick={() => handleSelectLandmark(landmark)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:border-brandBlue-500/50 hover:bg-slate-800 hover:text-white hover:scale-105 transition"
              >
                <span>{landmark.icon}</span>
                <span>{landmark.shortName}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. INITIAL OR MAP & RESULTS SECTION */}
      <div ref={resultsSectionRef} className="max-w-[1700px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {!hasSearched ? (
          /* Trạng thái chưa tìm kiếm (Ô trắng hướng dẫn người dùng) */
          <div className="py-12 sm:py-16 text-center">
            <div className="max-w-md mx-auto rounded-3xl border border-slate-200/80 bg-white p-8 sm:p-10 shadow-sm space-y-4">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brandBlue-50 text-brandBlue-500 text-3xl">
                🧭
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-extrabold text-slate-800">
                  Chưa có tìm kiếm nào
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Nhập địa chỉ, bấm <strong>"Vị trí của bạn"</strong> hoặc chọn một địa điểm gợi ý ở trên, sau đó bấm <strong>"Tìm phòng gần đây"</strong> để mở bản đồ và xem danh sách phòng trọ xung quanh.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Khi đã bấm tìm kiếm -> Mở bản đồ và danh sách phòng trọ */
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Results Summary & View Switcher Bar */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-slate-800 text-sm sm:text-base">
                <span className="text-2xl">🎯</span>
                <div>
                  <span>
                    Tìm thấy{" "}
                    <strong className="text-slate-950 font-black text-lg text-brandBlue-600">
                      {listings.length}
                    </strong>{" "}
                    phòng trọ trong bán kính{" "}
                    <strong className="font-extrabold text-slate-950">{radiusKm} km</strong>
                  </span>
                  <span className="block text-xs text-slate-500 font-medium">
                    Vị trí: <strong className="text-slate-700">{locationName}</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Distance sort pill */}
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-bold border border-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  Sắp xếp theo khoảng cách gần nhất
                </span>

                {/* Layout View Switcher */}
                <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1 border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setLayoutMode("split")}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      layoutMode === "split"
                        ? "bg-white text-brandBlue-600 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>🪟</span>
                    <span>Chia đôi 50/50</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode("map-top")}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      layoutMode === "map-top"
                        ? "bg-white text-brandBlue-600 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>🗺️</span>
                    <span>Bản đồ lớn phía trên</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Layout Mode 1: Split 50/50 View */}
            {layoutMode === "split" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Interactive Leaflet Map (Fixed & Snug Fit) */}
                <div className="lg:col-span-6 rounded-3xl border border-slate-200/80 bg-white p-3 shadow-sm overflow-hidden sticky top-20 flex flex-col">
                  <div className="mb-2.5 px-2 pt-1 flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <span>🗺️</span> Bản đồ trực quan & Bán kính {radiusKm} km
                    </span>
                    <span className="text-xs font-bold text-brandBlue-600 bg-brandBlue-50 px-2.5 py-0.5 rounded-full border border-brandBlue-100">
                      {listings.length} điểm xung quanh
                    </span>
                  </div>

                  <div className="h-[26rem] sm:h-[32rem] lg:h-[37.5rem] rounded-2xl overflow-hidden shadow-inner">
                    <MapBase
                      ariaLabel="Bản đồ tìm phòng gần bạn"
                      center={selectedCenter}
                      zoom={radiusKm <= 3 ? 14 : radiusKm <= 5 ? 13 : 12}
                      markers={mapMarkers}
                      className="h-full w-full rounded-2xl border-0"
                    />
                  </div>
                </div>

                {/* Right Column: Listings Results List (Internal Scrollable Column) */}
                <div className="lg:col-span-6 lg:h-[41rem] lg:overflow-y-auto lg:pr-2 space-y-4">
                  {loading && <LoadingState message="Đang quét tìm phòng trọ trong bán kính…" />}

                  {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm font-semibold text-rose-700">
                      <p>{error}</p>
                      <button
                        type="button"
                        onClick={() => searchNearCenter(selectedCenter, radiusKm)}
                        className="mt-3 inline-flex rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
                      >
                        Thử lại
                      </button>
                    </div>
                  )}

                  {!loading && !error && listings.length === 0 && (
                    <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm space-y-3">
                      <span className="text-4xl">🔎</span>
                      <h3 className="text-lg font-bold text-slate-800">Chưa có phòng trong bán kính {radiusKm} km</h3>
                      <p className="text-sm text-slate-500 max-w-sm mx-auto">
                        Hãy thử tăng bán kính tìm kiếm lên 10 km hoặc 15 km để tìm thấy nhiều lựa chọn hơn quanh khu vực này.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setRadiusKm(10);
                          searchNearCenter(selectedCenter, 10);
                        }}
                        className="mt-2 inline-flex items-center gap-1 rounded-xl bg-brandBlue-500 px-5 py-2.5 text-xs font-black text-white hover:bg-brandBlue-600 transition shadow-md shadow-brandBlue-500/20"
                      >
                        Tăng bán kính lên 10 km
                      </button>
                    </div>
                  )}

                  {!loading && !error && listings.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {listings.map((listing) => (
                        <ListingCard key={listing.id} listing={listing} showFavorite />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Layout Mode 2: Map on Top (100% Full-Width Map) + 3-Column Listings Grid */}
            {layoutMode === "map-top" && (
              <div className="space-y-8">
                {/* Full Width Top Map */}
                <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm overflow-hidden">
                  <div className="mb-3 px-2 pt-1 flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <span>🗺️</span> Bản đồ toàn cảnh trong bán kính {radiusKm} km
                    </span>
                    <span className="text-xs font-bold text-brandBlue-600 bg-brandBlue-50 px-3 py-1 rounded-full border border-brandBlue-100">
                      {listings.length} phòng trọ xung quanh
                    </span>
                  </div>

                  <div className="h-[30rem] sm:h-[38rem] lg:h-[46rem] rounded-2xl overflow-hidden shadow-inner">
                    <MapBase
                      ariaLabel="Bản đồ tìm phòng gần bạn toàn cảnh"
                      center={selectedCenter}
                      zoom={radiusKm <= 3 ? 14 : radiusKm <= 5 ? 13 : 12}
                      markers={mapMarkers}
                      className="h-full w-full"
                    />
                  </div>
                </div>

                {/* 3-Column Listings Grid Below */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏠</span>
                    <h3 className="text-lg font-black text-slate-900">Danh sách phòng trọ lân cận</h3>
                  </div>

                  {loading && <LoadingState message="Đang quét tìm phòng trọ trong bán kính…" />}

                  {!loading && !error && listings.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {listings.map((listing) => (
                        <ListingCard key={listing.id} listing={listing} showFavorite />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
