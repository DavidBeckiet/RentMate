"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import type { PublicListingDetail, PublicListingSummary } from "../../types/api";
import { ListingCard } from "./listing-card";
import { RoommateListingCta } from "../roommate/roommate-listing-cta";
import { isRoommateListingEligible } from "../roommate/roommate-listing-selection";
import { clearRecentListings, readRecentListingIds, removeRecentListing } from "./recently-viewed-storage";

type LoadStatus = "loading" | "success" | "error";

function summaryFromDetail(detail: PublicListingDetail): PublicListingSummary | null {
  const coverImage = detail.images[0];
  if (!coverImage) return null;
  return {
    id: detail.id,
    businessStatus: detail.businessStatus,
    title: detail.title,
    monthlyRent: detail.monthlyRent,
    roomAreaSqm: detail.roomAreaSqm,
    maxOccupants: detail.maxOccupants,
    areaName: detail.areaName,
    latitude: detail.latitude,
    longitude: detail.longitude,
    propertyType: detail.propertyType,
    amenities: detail.amenities,
    coverImage,
    landlordVerified: detail.landlordVerified,
    updatedAt: detail.updatedAt
  };
}

export function RecentlyViewed() {
  const [listingIds, setListingIds] = useState<readonly number[]>([]);
  const [items, setItems] = useState<readonly PublicListingSummary[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const ids = readRecentListingIds();
    setListingIds(ids);
    setItems([]);
    setError(null);

    if (ids.length === 0) {
      setStatus("success");
      return;
    }

    const controller = new AbortController();
    let active = true;

    void Promise.all(
      ids.map(async (listingId) => {
        try {
          const detail = await api.listings.getPublicDetail(listingId, controller.signal);
          return summaryFromDetail(detail);
        } catch (caught: unknown) {
          if (caught instanceof ApiError && caught.status === 404) {
            removeRecentListing(listingId);
            return null;
          }
          throw caught;
        }
      })
    )
      .then((summaries) => {
        if (!active || controller.signal.aborted) return;
        setItems(summaries.filter((summary): summary is PublicListingSummary => summary !== null));
        setListingIds(readRecentListingIds());
        setStatus("success");
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught : null);
        setStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [retryKey]);

  const clearHistory = () => {
    clearRecentListings();
    setListingIds([]);
    setItems([]);
  };

  return (
    <section className="space-y-8" aria-labelledby="recently-viewed-heading">
      <header className="flex flex-col justify-between gap-5 border-b-2 border-heroDark-950 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="rm-eyebrow">
            <Icon name="eye" className="h-4 w-4" /> Lịch sử khám phá
          </p>
          <h1 id="recently-viewed-heading" className="mt-3 font-display text-3xl font-bold tracking-[-0.05em]">
            Phòng đã xem gần đây
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-rent-secondary">
            Những tin bạn vừa xem được lưu trên thiết bị này để bạn quay lại nhanh hơn.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 border-2 border-heroDark-950 bg-rent-surface px-4 font-display text-sm font-bold shadow-glass-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={clearHistory}
          disabled={listingIds.length === 0}
        >
          <Icon name="refresh" className="h-4 w-4" />
          Xóa lịch sử
        </button>
      </header>

      {status === "loading" ? <LoadingState message="Đang tải các phòng bạn đã xem…" /> : null}

      {status === "error" ? (
        <ErrorState
          message="Không thể tải lịch sử xem lúc này. Vui lòng thử lại."
          requestId={error?.requestId}
          onRetry={() => setRetryKey((value) => value + 1)}
        />
      ) : null}

      {status === "success" && items.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((listing) => (
            <div key={listing.id} className="space-y-2">
              <ListingCard listing={listing} />
              <RoommateListingCta
                listingId={listing.id}
                eligible={isRoommateListingEligible(listing)}
                compact
                label="Cân nhắc cùng người ở ghép"
              />
            </div>
          ))}
        </div>
      ) : null}

      {status === "success" && items.length === 0 ? (
        <EmptyState
          title="Bạn chưa xem phòng nào"
          description="Bắt đầu khám phá các tin đăng công khai, những phòng bạn mở sẽ xuất hiện ở đây."
          visual={<Icon name="eye" className="h-10 w-10" />}
          action={
            <Link
              href="/search"
              className="inline-flex min-h-11 items-center gap-2 border-2 border-heroDark-950 bg-rent-accent px-4 font-display text-sm font-bold shadow-glass-sm"
            >
              Tìm phòng
              <Icon name="arrowUpRight" className="h-4 w-4" />
            </Link>
          }
        />
      ) : null}
    </section>
  );
}
