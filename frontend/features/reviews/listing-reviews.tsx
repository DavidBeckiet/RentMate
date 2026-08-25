"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api } from "../../lib/api/client";
import type { ApiPage, PublicListingReview } from "../../types/api";

export function ListingReviews({ listingId }: Readonly<{ listingId: number }>) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<PublicListingReview> | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    void api.listings
      .listReviews(listingId, { page, pageSize: 10 }, controller.signal)
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
  }, [listingId, page, retryKey]);

  return (
    <section className="space-y-5 border-t-2 border-heroDark-950 pt-8" aria-labelledby="listing-reviews-heading">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="rm-eyebrow inline-flex items-center gap-2">
            <Icon name="star" className="h-4 w-4" /> ĐÁNH GIÁ ĐÃ DUYỆT
          </span>
          <h2 id="listing-reviews-heading" className="mt-3 font-display text-3xl font-bold tracking-tight">
            Trải nghiệm từ người thuê
          </h2>
        </div>
        <p className="max-w-sm text-xs font-bold leading-5 text-slate-600">
          Chỉ hiển thị đánh giá từ cuộc trao đổi thực tế đã được RentMate kiểm duyệt.
        </p>
      </header>
      {status === "loading" ? <LoadingState message="Đang tải đánh giá…" /> : null}
      {status === "error" ? (
        <ErrorState
          message="Không thể tải đánh giá lúc này."
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}
      {status === "success" && result?.data.length === 0 ? (
        <EmptyState
          visual={<Icon name="star" className="h-8 w-8" />}
          title="Chưa có đánh giá đã duyệt"
          description="Các đánh giá hợp lệ sẽ xuất hiện tại đây."
        />
      ) : null}
      {status === "success" && result && result.data.length > 0 ? (
        <div className="space-y-4">
          {result.data.map((review) => (
            <article key={review.id} className="border-2 border-heroDark-950 bg-white p-5 shadow-glass-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong className="font-display text-3xl">{review.overallRating}/5</strong>
                <span className="inline-flex items-center gap-2 border-2 border-heroDark-950 bg-[#c9f269] px-3 py-1 text-xs font-extrabold uppercase">
                  <Icon name="check" className="h-4 w-4" /> Tương tác đã xác minh
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-xs font-bold sm:grid-cols-2">
                <div className="flex justify-between border-b border-slate-300 pb-2">
                  <dt>Độ chính xác</dt>
                  <dd>{review.accuracyRating}/5</dd>
                </div>
                <div className="flex justify-between border-b border-slate-300 pb-2">
                  <dt>Phản hồi</dt>
                  <dd>{review.responsivenessRating}/5</dd>
                </div>
              </dl>
              <p className="mt-4 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-700">{review.comment}</p>
              <time className="mt-4 block text-xs font-bold text-slate-500">
                {new Date(review.createdAt).toLocaleDateString("vi-VN")}
              </time>
            </article>
          ))}
          <Pagination
            ariaLabel="Phân trang đánh giá"
            page={result.pagination.page}
            hasNextPage={result.pagination.hasNextPage}
            onPrevious={() => setPage((value) => value - 1)}
            onNext={() => setPage((value) => value + 1)}
          />
        </div>
      ) : null}
    </section>
  );
}
