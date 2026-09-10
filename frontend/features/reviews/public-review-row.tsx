"use client";

import { Icon } from "../../components/ui/icon";
import type { PublicListingReview } from "../../types/api";
import { ReportReviewControl } from "./report-review-control";

export function RatingStars({ value }: Readonly<{ value: number }>) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${value}/5 sao`}>
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < value;
        return (
          <Icon
            key={index}
            name="star"
            filled={filled}
            className={filled ? "h-4 w-4 text-primary" : "h-4 w-4 text-border-strong"}
          />
        );
      })}
    </span>
  );
}

export function formatReviewDate(value: string): string {
  return new Date(value).toLocaleDateString("vi-VN");
}

export function PublicReviewRow({
  review,
  onRequestReport
}: Readonly<{ review: PublicListingReview; onRequestReport?: (reviewId: number) => void }>) {
  return (
    <article className="py-5 first:pt-0 last:pb-0">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 text-ui-sm font-semibold text-foreground">
          <Icon name="user" className="h-4 w-4 text-muted-foreground" />
          <span>Người thuê ẩn danh</span>
        </div>
        {review.verifiedInteraction ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success-subtle px-2.5 py-1 text-ui-xs font-bold text-success-foreground">
            <Icon name="check" className="h-3.5 w-3.5" /> Tương tác đã xác minh
          </span>
        ) : null}
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RatingStars value={review.overallRating} />
        <span className="font-display text-lg font-bold text-primary-hover">{review.overallRating}/5</span>
      </div>

      <blockquote className="mt-3 max-w-3xl whitespace-pre-wrap text-ui-sm font-medium leading-6 text-foreground">
        <span aria-hidden="true">“</span>
        {review.comment}
        <span aria-hidden="true">”</span>
      </blockquote>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <time
          dateTime={review.createdAt}
          aria-label={`Đăng ngày ${formatReviewDate(review.createdAt)}`}
          className="text-ui-xs font-semibold text-muted-foreground"
        >
          {formatReviewDate(review.createdAt)}
        </time>
        <ReportReviewControl reviewId={review.id} hasReported={review.hasReported} onRequestReport={onRequestReport} />
      </footer>
    </article>
  );
}
