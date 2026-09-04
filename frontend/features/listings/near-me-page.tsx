"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapBase, type MapMarker, type MapPoint } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { LoadingState } from "../../components/ui/feedback-states";
import { Icon, type IconName } from "../../components/ui/icon";
import { api } from "../../lib/api/client";
import type { PublicListingSummary } from "../../types/api";
import { formatVnd } from "./format";
import {
  formatNearMeDistance,
  formatNearMeRadius,
  formatNearMeRent,
  formatNearMeResultSummary
} from "./near-me-format";
import { NearMeMapListingPopup } from "./near-me-map-listing-popup";
import { NearMeResultCard } from "./near-me-result-card";
import styles from "./near-me-page.module.css";

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
  const [activeListingId, setActiveListingId] = useState<number | null>(null);
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
    setActiveListingId(null);
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

  const handleMarkerSelect = (listingId: string | number) => {
    if (typeof listingId !== "number" || !Number.isSafeInteger(listingId)) return;
    setActiveListingId(listingId);
    document.getElementById(`near-me-listing-${listingId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const activeSearch = committedSearch;
  const mapMarkers: readonly MapMarker[] = [
    ...(activeSearch
      ? [
          {
            id: "search-center",
            position: activeSearch.center,
            label: `Tâm tìm kiếm tại ${activeSearch.locationName}`,
            variant: "center" as const
          }
        ]
      : []),
    ...listings.map((listing) => ({
      id: listing.id,
      position: { latitude: listing.latitude, longitude: listing.longitude },
      label: `${listing.title} — ${formatVnd(listing.monthlyRent)}${
        listing.distanceKm !== undefined ? ` — ${formatNearMeDistance(listing.distanceKm)}` : ""
      }`,
      displayLabel: formatNearMeRent(listing.monthlyRent),
      variant: "price" as const,
      selected: activeListingId === listing.id,
      openPopup: activeListingId === listing.id,
      popup: <NearMeMapListingPopup listing={listing} />
    }))
  ];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={`rm-page-container ${styles.heroInner}`}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}>
                <Icon name="compass" className="h-4 w-4" />
                Khám phá quanh bạn
              </span>
              <h1 className={styles.heroTitle}>Phòng trọ gần bạn</h1>
              <p className={styles.heroDescription}>
                Chọn một điểm bắt đầu, đặt bán kính và xem những phòng trọ gần nhất trên bản đồ.
              </p>
              <p className={styles.privacyNote}>
                <Icon name="shield" className="h-4 w-4" />
                <span>Vị trí chỉ dùng để tìm phòng xung quanh và không được lưu lại.</span>
              </p>
            </div>

            <div ref={searchRef} className={styles.searchCard}>
              <label htmlFor="near-location" className={styles.formLabel}>
                Điểm bắt đầu
              </label>
              <div className={styles.locationControl}>
                <span className={styles.locationIcon} aria-hidden="true">
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
                  className={styles.locationInput}
                  placeholder="Trường học, bệnh viện, công ty..."
                />
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  disabled={gettingLocation}
                  aria-label="Dùng vị trí hiện tại"
                  aria-busy={gettingLocation}
                  className={styles.gpsButton}
                >
                  <Icon name="target" className="h-4 w-4" />
                  <span>{gettingLocation ? "Đang lấy vị trí…" : "GPS"}</span>
                </button>
              </div>

              {dropdownOpen ? (
                <div
                  id="near-location-options"
                  role="listbox"
                  aria-label="Gợi ý địa điểm"
                  className={styles.suggestionList}
                >
                  <div className={styles.suggestionHeading}>Địa điểm phổ biến</div>
                  {matchingPlaces.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      role="option"
                      aria-selected={locationName === place.name}
                      onClick={() => choosePlace(place)}
                      className={styles.suggestionOption}
                    >
                      <span className={styles.suggestionText}>
                        <Icon name={place.icon} className="h-4 w-4 shrink-0" />
                        <span>{place.name}</span>
                      </span>
                      <Icon name="arrow" className="h-4 w-4 shrink-0" />
                    </button>
                  ))}
                  {matchingPlaces.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Không có gợi ý phù hợp.</p>
                  ) : null}
                </div>
              ) : null}

              {selectionError ? (
                <p role="alert" className={styles.selectionError}>
                  {selectionError}
                </p>
              ) : null}

              <fieldset className={styles.radiusFieldset}>
                <legend className={styles.radiusLegend}>Bán kính tìm kiếm</legend>
                <div className={styles.radiusOptions}>
                  {radiusOptions.map((radius) => (
                    <button
                      key={radius}
                      type="button"
                      onClick={() => chooseRadius(radius)}
                      aria-pressed={radiusKm === radius}
                      className={`${styles.radiusOption} ${radiusKm === radius ? styles.radiusOptionSelected : ""}`}
                    >
                      {radius} km
                    </button>
                  ))}
                </div>
              </fieldset>

              <Button
                className={styles.searchButton}
                pending={loading}
                pendingLabel="Đang tìm phòng…"
                onClick={() => void searchNear()}
              >
                <Icon name="compass" className="h-5 w-5" />
                Tìm phòng trong bán kính
              </Button>
            </div>
          </div>

          <div className={styles.quickSearches} aria-label="Điểm đến nhanh">
            <span className={styles.quickLabel}>Đi nhanh</span>
            {places
              .filter((place) => !place.currentLocation)
              .slice(0, 4)
              .map((place) => (
                <button key={place.id} type="button" onClick={() => choosePlace(place)} className={styles.quickButton}>
                  <Icon name={place.icon} className="h-3.5 w-3.5" />
                  {place.shortName}
                </button>
              ))}
          </div>
        </div>
      </section>

      {searched && activeSearch ? (
        <section
          ref={resultsRef}
          className={`rm-page-container ${styles.resultsSection}`}
          aria-labelledby="near-results-heading"
        >
          <header className={styles.resultsHeader}>
            <div>
              <span className={styles.resultsEyebrow}>
                <Icon name="target" className="h-4 w-4" />
                Kết quả quanh bạn
              </span>
              <h2 id="near-results-heading" className={styles.resultsTitle}>
                {loading
                  ? "Đang tìm phòng quanh đây…"
                  : error
                    ? "Không thể tải kết quả"
                    : formatNearMeResultSummary(listings.length, activeSearch.radiusKm)}
              </h2>
              <p className={styles.resultsDescription}>
                Kết quả tính từ vị trí hiện tại đã chọn và được xếp từ gần đến xa.
              </p>
              {refreshing ? (
                <span role="status" className={styles.refreshing}>
                  <span
                    className={`${styles.refreshingDot} animate-pulse motion-reduce:animate-none`}
                    aria-hidden="true"
                  />
                  Đang cập nhật theo bán kính {formatNearMeRadius(activeSearch.radiusKm)} km
                </span>
              ) : null}
            </div>

            <div className={styles.resultsContext}>
              <span className={styles.resultsContextIcon} aria-hidden="true">
                <Icon name="map" className="h-5 w-5" />
              </span>
              <span>
                <span className={styles.resultsContextLabel}>Khu vực đang xem</span>
                <strong className={styles.resultsContextValue} title={activeSearch.locationName}>
                  {activeSearch.locationName}
                </strong>
                <span className={styles.resultsContextLabel}>
                  Bán kính {formatNearMeRadius(activeSearch.radiusKm)} km · vị trí xấp xỉ
                </span>
              </span>
            </div>
          </header>

          {error ? (
            <div role="alert" className={styles.errorState}>
              <div>
                <strong>Chưa thể hiển thị phòng quanh bạn</strong>
                <p>{error}</p>
              </div>
              <Button variant="secondary" onClick={() => void searchNear(activeSearch)}>
                Thử lại
              </Button>
            </div>
          ) : null}

          {loading ? (
            <LoadingState message="Đang quét các phòng trong bán kính…" className={styles.loadingState} />
          ) : error ? null : (
            <div className={styles.resultsStage}>
              <section className={styles.mapPanel} aria-labelledby="near-map-heading">
                <div className={styles.mapHeader}>
                  <div>
                    <span className={styles.mapEyebrow}>
                      <Icon name="map" className="h-4 w-4" />
                      Bản đồ khu vực
                    </span>
                    <h3 id="near-map-heading" className={styles.mapTitle}>
                      Phòng quanh {activeSearch.locationName}
                    </h3>
                  </div>
                  <p className={styles.mapHint}>Ghim hiển thị giá thuê · di chuyển bản đồ không tự tìm kiếm.</p>
                </div>
                <div className={styles.mapFrame}>
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
                    onMarkerSelect={handleMarkerSelect}
                    className="h-full w-full"
                  />
                  <div className={styles.mapLegend} aria-label="Chú thích bản đồ">
                    <span className={styles.mapLegendItem}>
                      <span className={styles.mapLegendSwatchCenter} aria-hidden="true" />
                      Tâm tìm kiếm
                    </span>
                    <span className={styles.mapLegendItem}>
                      <span className={styles.mapLegendSwatchPrice} aria-hidden="true" />
                      Giá thuê
                    </span>
                  </div>
                </div>
              </section>

              <section className={styles.resultsRail} aria-labelledby="near-list-heading">
                <header className={styles.railHeader}>
                  <span className={styles.railEyebrow}>
                    <Icon name="target" className="h-4 w-4" />
                    Danh sách gần nhất
                  </span>
                  <h3 id="near-list-heading" className={styles.railTitle}>
                    {listings.length} phòng trong vùng
                  </h3>
                  <p className={styles.railDescription}>Xếp theo khoảng cách từ gần đến xa.</p>
                </header>

                {listings.length > 0 ? (
                  <ol className={styles.railList} aria-label="Phòng xếp theo khoảng cách">
                    {listings.map((listing, index) => (
                      <li key={listing.id} className={styles.railItem}>
                        <NearMeResultCard
                          listing={listing}
                          position={index + 1}
                          selected={activeListingId === listing.id}
                        />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className={styles.emptyState}>
                    <span className={styles.emptyIcon} aria-hidden="true">
                      <Icon name="search" className="h-6 w-6" />
                    </span>
                    <h3>Không tìm thấy phòng trong bán kính {formatNearMeRadius(activeSearch.radiusKm)} km.</h3>
                    <p>Hãy thử tăng bán kính hoặc chọn một điểm bắt đầu khác.</p>
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
