"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api } from "../../lib/api/client";
import type { ApiPage, PublicListingReview } from "../../types/api";
import { PublicReviewRow } from "./public-review-row";
import { ReviewReportDialog } from "./report-review-control";

export const reviewPreviewPageSize = 3;

export function ListingReviews({ listingId }: Readonly<{ listingId: number }>) {
  const [result, setResult] = useState<ApiPage<PublicListingReview> | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [reportReviewId, setReportReviewId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    void api.listings
      .listReviews(listingId, { page: 1, pageSize: reviewPreviewPageSize }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          setStatus("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [listingId, retryKey]);

  const previewReviews = result?.data.slice(0, reviewPreviewPageSize) ?? [];
  const showAllReviewsLink =
    status === "success" && (previewReviews.length > 0 || result?.pagination.hasNextPage === true);
  const markReported = (reviewId: number) => {
    setResult(
      (current) =>
        current && {
          ...current,
          data: current.data.map((review) => (review.id === reviewId ? { ...review, hasReported: true } : review))
        }
    );
    setReportReviewId(null);
  };

  return (
    <section className="space-y-5 border-t border-border pt-8" aria-labelledby="listing-reviews-heading">
      <header className="max-w-3xl">
        <span className="rm-eyebrow inline-flex items-center gap-2">
          <Icon name="star" className="h-4 w-4" /> ĐÁNH GIÁ ĐÃ DUYỆT
        </span>
        <h2 id="listing-reviews-heading" className="mt-3 font-display text-3xl font-bold tracking-tight">
          Đánh giá tin đăng
        </h2>
        <p className="mt-2 max-w-2xl text-ui-sm leading-6 text-muted-foreground">
          Các đánh giá đã được duyệt từ người thuê có tương tác hợp lệ với tin đăng.
        </p>
      </header>

      {status === "loading" ? (
        <LoadingState className="min-h-28 max-w-4xl gap-3 p-4" message="Đang tải đánh giá…" />
      ) : null}

      {status === "error" ? (
        <ErrorState
          className="max-w-4xl"
          message="Không thể tải đánh giá lúc này."
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}

      {status === "success" && previewReviews.length === 0 ? (
        <EmptyState
          className="max-w-4xl !items-start !text-left"
          visual={<Icon name="star" className="h-8 w-8" />}
          title="Chưa có đánh giá được duyệt cho tin đăng này."
          description="Các đánh giá hợp lệ sẽ xuất hiện tại đây."
        />
      ) : null}

      {status === "success" && previewReviews.length > 0 ? (
        <div className="max-w-4xl divide-y divide-border rounded-card border border-border bg-surface px-5 sm:px-6">
          {previewReviews.map((review) => (
            <PublicReviewRow key={review.id} review={review} onRequestReport={setReportReviewId} />
          ))}
        </div>
      ) : null}

      {showAllReviewsLink ? (
        <Link
          href={`/listings/${listingId}/reviews`}
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-strong bg-surface px-4 text-ui-sm font-bold text-primary-hover transition-[background-color,border-color,color,transform] duration-fast hover:-translate-y-0.5 hover:border-primary hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus motion-reduce:transform-none"
        >
          Xem tất cả đánh giá
          <Icon name="arrowUpRight" className="h-4 w-4" />
        </Link>
      ) : null}
      <ReviewReportDialog
        reviewId={reportReviewId}
        open={reportReviewId !== null}
        onClose={() => setReportReviewId(null)}
        onReported={markReported}
      />
    </section>
  );
}
