"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import type { PublicListingSummary } from "../../types/api";
import { ListingCard } from "./listing-card";

export interface SimilarListingsProps {
  readonly listingId: number;
}

export function SimilarListings({ listingId }: SimilarListingsProps) {
  const [items, setItems] = useState<readonly PublicListingSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setStatus("loading");
    setError(null);

    if (typeof api.listings?.listSimilar !== "function") {
      setStatus("success");
      setItems([]);
      return;
    }

    void api.listings
      .listSimilar(listingId, controller.signal)
      .then((page) => {
        if (!active || controller.signal.aborted) return;
        setItems(page.data);
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
  }, [listingId, retryKey]);

  if (status === "loading") {
    return <LoadingState className="mt-10" message="Đang tìm phòng tương tự…" />;
  }

  if (status === "error") {
    return (
      <ErrorState
        className="mt-10"
        message="Không thể tải các phòng tương tự lúc này. Bạn vẫn có thể xem tin đăng hiện tại."
        requestId={error?.requestId}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="similar-listings-heading">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-rent-secondary">
            GỢI Ý GẦN ĐÂY
          </p>
          <h2 id="similar-listings-heading" className="mt-1 font-display text-2xl font-bold tracking-[-0.04em]">
            Phòng tương tự trong khu vực
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-rent-secondary">
            Tham khảo thêm ba lựa chọn cùng khu vực, được sắp xếp theo loại phòng và mức giá gần nhất.
          </p>
        </div>
        <Icon name="sparkles" className="hidden h-8 w-8 shrink-0 text-rent-coral sm:block" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </section>
  );
}
