"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { api, ApiError } from "../../lib/api/client";
import { formatAreaLabel } from "../../lib/area";
import type { PublicListingSearchQuery, PublicListingSort, PropertyType } from "../../types/api";
import { formatAreaSqm } from "../listings/format";
import { propertyTypeLabel } from "../listings/room-type-label";
import { readRecentListingIds, removeRecentListing } from "../listings/recently-viewed-storage";
import { useComparisonSelection } from "../comparison/comparison-store";
import {
  isRoommateListingEligible,
  roommateListingFromDetail,
  roommateListingFromSummary,
  type RoommateListingOption
} from "./roommate-listing-selection";
import { roommateErrorMessage } from "./roommate-content";
import styles from "./roommate-listing-picker.module.css";

type ListingSource = "saved" | "recent" | "comparison" | "search";
type LoadStatus = "idle" | "loading" | "success" | "error";

interface SearchFilters {
  readonly keyword: string;
  readonly area: string;
  readonly minRent: string;
  readonly maxRent: string;
  readonly propertyType: string;
  readonly sort: PublicListingSort;
}

const emptyFilters: SearchFilters = {
  keyword: "",
  area: "",
  minRent: "",
  maxRent: "",
  propertyType: "",
  sort: "newest"
};

const pageSize = 12;
const sourceOrder: readonly ListingSource[] = ["saved", "recent", "comparison", "search"];
const sourceLabels: Readonly<Record<ListingSource, string>> = {
  saved: "Đã lưu",
  recent: "Đã xem gần đây",
  comparison: "Đang so sánh",
  search: "Tìm phòng"
};
const sourceIcons: Readonly<Record<ListingSource, "heart" | "eye" | "compare" | "search">> = {
  saved: "heart",
  recent: "eye",
  comparison: "compare",
  search: "search"
};

function parseRent(value: string): number | undefined {
  const digits = value.replace(/\D/gu, "");
  if (!digits) return undefined;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

function listingQuery(filters: SearchFilters, page: number): PublicListingSearchQuery {
  const minMonthlyRent = parseRent(filters.minRent);
  const maxMonthlyRent = parseRent(filters.maxRent);
  return {
    ...(filters.keyword.trim() ? { q: filters.keyword.trim() } : {}),
    ...(filters.area.trim() ? { areaName: filters.area.trim() } : {}),
    ...(minMonthlyRent === undefined ? {} : { minMonthlyRent }),
    ...(maxMonthlyRent === undefined ? {} : { maxMonthlyRent }),
    ...(filters.propertyType ? { propertyType: filters.propertyType } : {}),
    minOccupants: 2,
    page,
    pageSize,
    sort: filters.sort
  };
}

function displayError(error: unknown): string {
  return error instanceof ApiError ? roommateErrorMessage(error) : "Không thể tải phòng lúc này. Vui lòng thử lại.";
}

function uniqueListings(items: readonly RoommateListingOption[]): RoommateListingOption[] {
  const unique = new Map<number, RoommateListingOption>();
  for (const item of items) {
    if (isRoommateListingEligible(item)) unique.set(item.id, item);
  }
  return [...unique.values()];
}

function RoomImage({ listing, compact = false }: Readonly<{ listing: RoommateListingOption; compact?: boolean }>) {
  const className = compact ? styles.selectedImage : styles.resultImage;
  if (!listing.coverImage) {
    return (
      <div
        role="img"
        aria-label={`Chưa có ảnh cho ${listing.title}`}
        className={`${className} ${styles.imageFallback}`}
      >
        <Icon name="home" className="h-7 w-7" />
      </div>
    );
  }
  return (
    <div className={className}>
      <MediaImage
        src={listing.coverImage.url}
        alt={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
        fill
        sizes={compact ? "88px" : "(max-width: 639px) 88px, 152px"}
        fallback={
          <div
            role="img"
            aria-label={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
            className={styles.imageFallback}
          >
            <Icon name="home" className="h-7 w-7" />
          </div>
        }
      />
    </div>
  );
}

export function RoommateListingPicker({
  selected,
  linkedListingId = null,
  disabled = false,
  onSelect
}: Readonly<{
  selected: RoommateListingOption | null;
  linkedListingId?: number | null;
  disabled?: boolean;
  onSelect: (listing: RoommateListingOption) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<ListingSource>("saved");
  const [items, setItems] = useState<readonly RoommateListingOption[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [areas, setAreas] = useState<readonly string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<readonly PropertyType[]>([]);
  const [lookupsFailed, setLookupsFailed] = useState(false);
  const requestIdentity = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const comparison = useComparisonSelection();
  const comparisonIds = comparison.listingIds.join(",");
  const panelId = `roommate-picker-panel-${useId().replace(/:/gu, "")}`;

  const showPicker = (nextSource: ListingSource) => {
    setSource(nextSource);
    setOpen(true);
  };

  const closePicker = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    requestController.current?.abort();
    const controller = new AbortController();
    const identity = ++requestIdentity.current;
    requestController.current = controller;
    setItems([]);
    setError(null);
    setLoadMoreError(null);
    setStatus(source === "search" ? "idle" : "loading");
    setPage(1);
    setHasNextPage(false);
    setLoadingMore(false);

    const isCurrent = () => !controller.signal.aborted && identity === requestIdentity.current;
    const finishWithListings = (listings: readonly RoommateListingOption[], nextPage = false) => {
      if (!isCurrent()) return;
      setItems(uniqueListings(listings));
      setHasNextPage(nextPage);
      setStatus("success");
    };

    if (source === "search") {
      setSearchExecuted(false);
      setLookupsFailed(false);
      void Promise.allSettled([
        api.lookups.listPublicAreas(controller.signal),
        api.lookups.listPropertyTypes(controller.signal)
      ]).then(([areaResult, propertyTypeResult]) => {
        if (!isCurrent()) return;
        if (areaResult.status === "fulfilled") setAreas(areaResult.value);
        if (propertyTypeResult.status === "fulfilled") setPropertyTypes(propertyTypeResult.value);
        setLookupsFailed(areaResult.status === "rejected" || propertyTypeResult.status === "rejected");
      });
      return () => controller.abort();
    }

    if (source === "saved") {
      void api.favorites
        .list({ page: 1, pageSize }, controller.signal)
        .then((result) =>
          finishWithListings(result.data.map(roommateListingFromSummary), result.pagination.hasNextPage)
        )
        .catch((caught: unknown) => {
          if (!isCurrent()) return;
          setError(displayError(caught));
          setStatus("error");
        });
    } else {
      const listingIds =
        source === "recent" ? readRecentListingIds() : comparisonIds.split(",").filter(Boolean).map(Number);
      if (listingIds.length === 0) {
        finishWithListings([]);
      } else {
        void Promise.allSettled(
          listingIds.map((listingId) => api.listings.getPublicDetail(listingId, controller.signal))
        ).then((settled) => {
          if (!isCurrent()) return;
          const available: RoommateListingOption[] = [];
          const failed = settled.filter((item) => item.status === "rejected");
          settled.forEach((item, index) => {
            if (item.status === "fulfilled") {
              available.push(roommateListingFromDetail(item.value));
            } else if (source === "recent" && item.reason instanceof ApiError && item.reason.status === 404) {
              removeRecentListing(listingIds[index]!);
            }
          });
          if (available.length === 0 && failed.length === settled.length && failed.length > 0) {
            setError(displayError(failed[0]!.reason));
            setStatus("error");
            return;
          }
          finishWithListings(available);
        });
      }
    }

    return () => {
      controller.abort();
      if (requestController.current === controller) requestController.current = null;
    };
  }, [comparisonIds, open, retryKey, source]);

  const runSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minRent = parseRent(filters.minRent);
    const maxRent = parseRent(filters.maxRent);
    if (minRent !== undefined && maxRent !== undefined && minRent > maxRent) {
      setError("Mức giá tối thiểu không thể cao hơn mức giá tối đa.");
      setStatus("error");
      return;
    }
    requestController.current?.abort();
    const controller = new AbortController();
    const identity = ++requestIdentity.current;
    requestController.current = controller;
    setSearchExecuted(true);
    setStatus("loading");
    setError(null);
    setLoadMoreError(null);
    setPage(1);
    try {
      const result = await api.listings.searchPublic(listingQuery(filters, 1), controller.signal);
      if (controller.signal.aborted || identity !== requestIdentity.current) return;
      setItems(uniqueListings(result.data.map(roommateListingFromSummary)));
      setHasNextPage(result.pagination.hasNextPage);
      setStatus("success");
    } catch (caught) {
      if (controller.signal.aborted || identity !== requestIdentity.current) return;
      setError(displayError(caught));
      setStatus("error");
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasNextPage || (source !== "saved" && source !== "search")) return;
    requestController.current?.abort();
    const controller = new AbortController();
    const identity = ++requestIdentity.current;
    requestController.current = controller;
    const nextPage = page + 1;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result =
        source === "saved"
          ? await api.favorites.list({ page: nextPage, pageSize }, controller.signal)
          : await api.listings.searchPublic(listingQuery(filters, nextPage), controller.signal);
      if (controller.signal.aborted || identity !== requestIdentity.current) return;
      const nextListings = uniqueListings(result.data.map(roommateListingFromSummary));
      setItems((current) => {
        const byId = new Map(current.map((listing) => [listing.id, listing]));
        nextListings.forEach((listing) => byId.set(listing.id, listing));
        return [...byId.values()];
      });
      setPage(nextPage);
      setHasNextPage(result.pagination.hasNextPage);
    } catch (caught) {
      if (!controller.signal.aborted && identity === requestIdentity.current) setLoadMoreError(displayError(caught));
    } finally {
      if (!controller.signal.aborted && identity === requestIdentity.current) setLoadingMore(false);
    }
  };

  const moveTabWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End"))
      return;
    event.preventDefault();
    const currentIndex = sourceOrder.indexOf(source);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? sourceOrder.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + sourceOrder.length) % sourceOrder.length;
    const nextSource = sourceOrder[nextIndex]!;
    setSource(nextSource);
    document.getElementById(`${panelId}-tab-${nextSource}`)?.focus();
  };

  const selectListing = (listing: RoommateListingOption) => {
    onSelect(listing);
    setOpen(false);
  };

  const resetSearch = () => {
    setFilters(emptyFilters);
    setError(null);
    setItems([]);
    setHasNextPage(false);
    setStatus("idle");
    setSearchExecuted(false);
  };

  const sourceEmptyCopy: Readonly<Record<Exclude<ListingSource, "search">, { title: string; description: string }>> = {
    saved: {
      title: "Bạn chưa lưu phòng nào",
      description:
        "Lưu những tin khiến bạn quan tâm để quay lại chọn nhanh tại đây. Bạn cũng có thể tìm phòng trực tiếp."
    },
    recent: {
      title: "Chưa có phòng đã xem phù hợp",
      description: "Phòng đã xem sẽ xuất hiện tại đây nếu còn công khai và có sức chứa từ hai người."
    },
    comparison: {
      title: "Chưa có phòng đang so sánh",
      description: "Thêm phòng vào danh sách so sánh để chọn nhanh tại đây, hoặc chuyển sang tìm phòng."
    }
  };

  return (
    <div className="space-y-3">
      <section className={styles.selector} aria-label="Phòng đang cân nhắc">
        {selected ? (
          <div className={styles.selectedSummary}>
            <RoomImage listing={selected} compact />
            <div className={styles.selectedContent}>
              <p className={styles.selectedTitle}>{selected.title}</p>
              <p className={styles.selectedMeta}>
                {formatAreaLabel(selected.areaName)} · {selected.monthlyRent.toLocaleString("vi-VN")} ₫/tháng
              </p>
              <p className={styles.selectedMeta}>
                {propertyTypeLabel(selected.propertyType)} · {formatAreaSqm(selected.roomAreaSqm)} · tối đa{" "}
                {selected.maxOccupants} người
              </p>
            </div>
          </div>
        ) : (
          <div className={styles.emptySummary}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <Icon name="home" className="h-5 w-5" />
            </span>
            <p>
              Bạn chưa gắn phòng nào vào yêu cầu này. <strong>Liên kết phòng là tùy chọn</strong>; yêu cầu vẫn đầy đủ
              nếu bạn muốn cùng người ở ghép tìm phòng sau.
            </p>
          </div>
        )}
        <div className={styles.selectorActions}>
          <Button disabled={disabled} onClick={() => showPicker("saved")}>
            <Icon name={selected ? "refresh" : "heart"} className="h-4 w-4" />
            {selected ? "Chọn phòng khác" : "Chọn từ phòng đã lưu"}
          </Button>
          {!selected ? (
            <Button variant="outline" disabled={disabled} onClick={() => showPicker("search")}>
              <Icon name="search" className="h-4 w-4" /> Chọn phòng
            </Button>
          ) : null}
        </div>
      </section>

      <Dialog
        open={open}
        title="Chọn phòng để cùng cân nhắc"
        description="Bắt đầu từ những phòng bạn đã quan tâm. Liên kết này chỉ tạo ngữ cảnh trao đổi, không giữ chỗ hay xác nhận thuê."
        onClose={closePicker}
        className={styles.dialog}
      >
        <div className="space-y-4">
          <div className={styles.tabs} role="tablist" aria-label="Nguồn chọn phòng" onKeyDown={moveTabWithKeyboard}>
            {sourceOrder.map((tab) => (
              <button
                key={tab}
                id={`${panelId}-tab-${tab}`}
                type="button"
                role="tab"
                aria-selected={source === tab}
                aria-label={
                  tab === "comparison" && comparison.listingIds.length > 0
                    ? `${sourceLabels[tab]}, ${comparison.listingIds.length}`
                    : sourceLabels[tab]
                }
                aria-controls={panelId}
                tabIndex={source === tab ? 0 : -1}
                className={styles.tab}
                onClick={() => setSource(tab)}
              >
                <Icon name={sourceIcons[tab]} className="h-4 w-4" />
                {sourceLabels[tab]}
                {tab === "comparison" && comparison.listingIds.length > 0 ? (
                  <span className={styles.tabCount}>{comparison.listingIds.length}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div
            className={styles.panel}
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${panelId}-tab-${source}`}
            tabIndex={0}
          >
            {source === "search" ? (
              <form className={styles.searchPanel} onSubmit={(event) => void runSearch(event)}>
                <div>
                  <p className={styles.searchTitle}>Tìm theo nhu cầu phòng</p>
                  <p className={styles.filterNote}>
                    Tìm kiếm chỉ là phương án dự phòng — bạn không cần nhớ chính xác tên tin đăng.
                  </p>
                </div>
                <div className={styles.filterGrid}>
                  <label className={styles.filterField}>
                    Từ khóa
                    <input
                      value={filters.keyword}
                      maxLength={120}
                      onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
                      placeholder="Tên phòng hoặc từ khóa"
                      className={styles.filterInput}
                    />
                  </label>
                  <label className={styles.filterField}>
                    Khu vực
                    <input
                      value={filters.area}
                      maxLength={120}
                      list={`${panelId}-areas`}
                      onChange={(event) => setFilters((current) => ({ ...current, area: event.target.value }))}
                      placeholder="Ví dụ: Quận 3"
                      className={styles.filterInput}
                    />
                    <datalist id={`${panelId}-areas`}>
                      {areas.map((area) => (
                        <option key={area} value={area} />
                      ))}
                    </datalist>
                  </label>
                  <label className={styles.filterField}>
                    Giá từ (₫/tháng)
                    <input
                      value={filters.minRent}
                      inputMode="numeric"
                      onChange={(event) => setFilters((current) => ({ ...current, minRent: event.target.value }))}
                      placeholder="Không giới hạn"
                      className={styles.filterInput}
                    />
                  </label>
                  <label className={styles.filterField}>
                    Đến (₫/tháng)
                    <input
                      value={filters.maxRent}
                      inputMode="numeric"
                      onChange={(event) => setFilters((current) => ({ ...current, maxRent: event.target.value }))}
                      placeholder="Không giới hạn"
                      className={styles.filterInput}
                    />
                  </label>
                  <label className={styles.filterField}>
                    Loại phòng
                    <select
                      value={filters.propertyType}
                      onChange={(event) => setFilters((current) => ({ ...current, propertyType: event.target.value }))}
                      className={styles.filterSelect}
                    >
                      <option value="">Tất cả loại phòng</option>
                      {propertyTypes.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.filterField}>
                    Sắp xếp
                    <select
                      value={filters.sort}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, sort: event.target.value as PublicListingSort }))
                      }
                      className={styles.filterSelect}
                    >
                      <option value="newest">Mới cập nhật</option>
                      <option value="rent_asc">Giá thấp đến cao</option>
                      <option value="rent_desc">Giá cao đến thấp</option>
                    </select>
                  </label>
                </div>
                {lookupsFailed ? (
                  <p className={styles.filterNote} role="status">
                    Gợi ý khu vực hoặc loại phòng chưa tải được; bạn vẫn có thể nhập khu vực và tìm kiếm.
                  </p>
                ) : null}
                <div className={styles.searchActions}>
                  <Button
                    type="submit"
                    aria-label="Tìm phòng theo bộ lọc"
                    pending={status === "loading"}
                    pendingLabel="Đang tìm phòng…"
                  >
                    <Icon name="search" className="h-4 w-4" /> Tìm phòng
                  </Button>
                  <Button type="button" variant="outline" onClick={resetSearch} disabled={status === "loading"}>
                    Xóa bộ lọc
                  </Button>
                </div>
              </form>
            ) : null}

            <div id={`${panelId}-results`} className="space-y-3">
              {status === "loading" ? <LoadingState message="Đang tải phòng phù hợp…" /> : null}
              {status === "error" && error ? (
                <ErrorState message={error} onRetry={() => setRetryKey((key) => key + 1)} />
              ) : null}
              {status === "success" ? (
                <>
                  {items.length > 0 ? (
                    <>
                      <div className={styles.resultHeader} aria-live="polite">
                        <span>{items.length} phòng đủ điều kiện đang hiển thị</span>
                        <span>Tối đa 12 phòng mỗi lượt</span>
                      </div>
                      <ul className={styles.resultGrid} aria-label={`Phòng từ nguồn ${sourceLabels[source]}`}>
                        {items.map((listing) => (
                          <li key={listing.id}>
                            <article
                              className={styles.resultCard}
                              data-selected={selected?.id === listing.id ? "true" : undefined}
                            >
                              <RoomImage listing={listing} />
                              <div className={styles.resultContent}>
                                <div className={styles.badgeRow}>
                                  {source !== "search" ? (
                                    <span className={styles.contextBadge}>
                                      <Icon name={sourceIcons[source]} className="h-3 w-3" /> {sourceLabels[source]}
                                    </span>
                                  ) : null}
                                  <span className={styles.availabilityBadge}>
                                    {listing.businessStatus === "AVAILABLE" ? "Còn khả dụng" : "Đang xác minh"}
                                  </span>
                                </div>
                                <h3 className={styles.resultTitle}>{listing.title}</h3>
                                <p className={styles.resultArea}>{formatAreaLabel(listing.areaName)}</p>
                                <p className={styles.resultPrice}>
                                  {listing.monthlyRent.toLocaleString("vi-VN")} ₫/tháng
                                </p>
                                <p className={styles.resultFacts}>
                                  <span>{propertyTypeLabel(listing.propertyType)}</span>
                                  <span>{formatAreaSqm(listing.roomAreaSqm)}</span>
                                  <span>Tối đa {listing.maxOccupants} người</span>
                                </p>
                              </div>
                              <Button
                                className={styles.selectButton}
                                size="sm"
                                variant={selected?.id === listing.id ? "primary" : "outline"}
                                onClick={() => selectListing(listing)}
                              >
                                <Icon name={selected?.id === listing.id ? "check" : "plus"} className="h-4 w-4" />
                                {linkedListingId === listing.id
                                  ? "Đang gắn"
                                  : selected?.id === listing.id
                                    ? "Đang chọn"
                                    : "Chọn phòng"}
                              </Button>
                            </article>
                          </li>
                        ))}
                      </ul>
                      {hasNextPage ? (
                        <div className={styles.moreRow}>
                          <Button
                            variant="secondary"
                            pending={loadingMore}
                            pendingLabel="Đang tải thêm…"
                            onClick={() => void loadMore()}
                          >
                            Tải thêm phòng
                          </Button>
                        </div>
                      ) : null}
                      {loadMoreError ? (
                        <p className="text-center text-ui-sm text-danger" role="alert">
                          {loadMoreError}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className={styles.emptyState}>
                      <h3>{source === "search" ? "Không tìm thấy phòng phù hợp" : sourceEmptyCopy[source].title}</h3>
                      <p>
                        {source === "search"
                          ? searchExecuted
                            ? "Thử nới mức giá hoặc đổi khu vực, loại phòng để xem thêm lựa chọn."
                            : "Bạn có thể lọc theo khu vực, ngân sách và loại phòng. Sức chứa từ hai người đã được áp dụng sẵn."
                          : sourceEmptyCopy[source].description}
                      </p>
                      {source !== "search" ? (
                        <Button className={styles.emptyAction} variant="outline" onClick={() => setSource("search")}>
                          <Icon name="search" className="h-4 w-4" /> Tìm phòng
                        </Button>
                      ) : searchExecuted ? (
                        <Button className={styles.emptyAction} variant="outline" onClick={resetSearch}>
                          Xóa bộ lọc
                        </Button>
                      ) : null}
                    </div>
                  )}
                  {items.length === 0 && hasNextPage ? (
                    <div className={styles.moreRow}>
                      <Button
                        variant="secondary"
                        pending={loadingMore}
                        pendingLabel="Đang tải thêm…"
                        onClick={() => void loadMore()}
                      >
                        Tải thêm phòng
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
              {status === "idle" && source === "search" ? (
                <p className={styles.filterNote} role="status">
                  Nhập một hoặc vài tiêu chí rồi chọn “Tìm phòng”.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
