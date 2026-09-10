"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import type { ListingReview, ReviewEligibility } from "../../types/api";

const ratingOptions = [5, 4, 3, 2, 1] as const;
const statusLabels: Record<ListingReview["status"], string> = {
  PENDING: "Đang chờ duyệt",
  APPROVED: "Đã công khai",
  REJECTED: "Không được duyệt"
};

function ExistingReview({ review }: Readonly<{ review: ListingReview }>) {
  return (
    <article className="space-y-3 border-2 border-heroDark-950 bg-white p-5 shadow-glass-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong className="font-display text-xl">Đánh giá của bạn</strong>
        <span className="border-2 border-heroDark-950 bg-rent-accent px-3 py-1 text-xs font-extrabold uppercase">
          {statusLabels[review.status]}
        </span>
      </div>
      <p className="font-display text-3xl font-bold">{review.overallRating}/5</p>
      <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-slate-700">{review.comment}</p>
      {review.moderationNote ? (
        <p className="border-l-4 border-heroDark-950 pl-3 text-sm font-bold">
          Phản hồi kiểm duyệt: {review.moderationNote}
        </p>
      ) : null}
    </article>
  );
}

export interface TenantReviewPanelProps {
  readonly inquiryId: number;
  readonly variant?: "page" | "dialog";
  readonly onCancel?: () => void;
  readonly onSubmitted?: (review: ListingReview) => void;
}

export function TenantReviewPanel({ inquiryId, variant = "page", onCancel, onSubmitted }: TenantReviewPanelProps) {
  const isDialog = variant === "dialog";
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overallRating, setOverallRating] = useState(5);
  const [accuracyRating, setAccuracyRating] = useState(5);
  const [responsivenessRating, setResponsivenessRating] = useState(5);
  const [comment, setComment] = useState("");

  const load = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void api.contact
      .getReviewEligibility(inquiryId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setEligibility(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Không thể kiểm tra quyền đánh giá lúc này.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [inquiryId]);

  useEffect(() => load(), [load]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const review = await api.contact.createReview(inquiryId, {
        overallRating,
        accuracyRating,
        responsivenessRating,
        comment: comment.trim()
      });
      setEligibility({ eligible: false, reason: "ALREADY_REVIEWED", review });
      onSubmitted?.(review);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(
        apiError?.status === 409
          ? "Điều kiện đánh giá vừa thay đổi hoặc đánh giá đã được gửi."
          : "Chưa thể gửi đánh giá. Vui lòng kiểm tra nội dung và thử lại."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      className={isDialog ? "space-y-4" : "space-y-4 border-2 border-heroDark-950 bg-[#e5eefc] p-5 shadow-glass"}
      aria-labelledby={isDialog ? undefined : "review-heading"}
      aria-label={isDialog ? "Biểu mẫu đánh giá" : undefined}
    >
      {!isDialog ? (
        <header>
          <span className="rm-eyebrow inline-flex items-center gap-2">
            <Icon name="star" className="h-4 w-4" /> TƯƠNG TÁC ĐÃ XÁC MINH
          </span>
          <h2 id="review-heading" className="mt-3 font-display text-3xl font-bold tracking-tight">
            Chia sẻ trải nghiệm
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-700">
            Đánh giá sẽ được kiểm duyệt trước khi xuất hiện công khai và không hiển thị danh tính của bạn.
          </p>
        </header>
      ) : null}
      {loading ? <p className="text-sm font-bold">Đang kiểm tra điều kiện đánh giá…</p> : null}
      {error ? (
        <p role="alert" className="border-l-4 border-red-700 pl-3 text-sm font-bold text-red-800">
          {error}
        </p>
      ) : null}
      {!loading && eligibility?.review ? <ExistingReview review={eligibility.review} /> : null}
      {!loading && eligibility && !eligibility.eligible && !eligibility.review ? (
        <p className="border-2 border-heroDark-950 bg-white p-4 text-sm font-bold">
          {eligibility.reason === "NO_LANDLORD_REPLY"
            ? "Yêu cầu này chưa có phản hồi từ chủ trọ nên chưa đủ điều kiện đánh giá."
            : "Yêu cầu cần được đóng trước khi bạn có thể gửi đánh giá."}
        </p>
      ) : null}
      {!loading && eligibility?.eligible ? (
        <form
          onSubmit={(event) => void submit(event)}
          className={isDialog ? "grid gap-4" : "grid gap-4 border-2 border-heroDark-950 bg-white p-5 shadow-glass-sm"}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["overall-rating", "Trải nghiệm chung", overallRating, setOverallRating],
              ["accuracy-rating", "Độ chính xác", accuracyRating, setAccuracyRating],
              ["responsiveness-rating", "Phản hồi", responsivenessRating, setResponsivenessRating]
            ].map(([id, label, value, setter]) => (
              <label key={String(id)} htmlFor={String(id)} className="grid gap-2 text-sm font-extrabold">
                {String(label)}
                <select
                  id={String(id)}
                  value={Number(value)}
                  onChange={(event) =>
                    (setter as React.Dispatch<React.SetStateAction<number>>)(Number(event.target.value))
                  }
                  className="min-h-12 border-2 border-heroDark-950 bg-rent-accent px-3 font-bold outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
                >
                  {ratingOptions.map((rating) => (
                    <option key={rating} value={rating}>
                      {rating}/5
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label htmlFor="review-comment" className="grid gap-2 text-sm font-extrabold">
            Nhận xét
            <textarea
              id="review-comment"
              required
              minLength={20}
              maxLength={2000}
              rows={5}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="resize-y border-2 border-heroDark-950 bg-white p-3 font-medium outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
              placeholder="Mô tả mức độ chính xác của tin đăng và trải nghiệm trao đổi…"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-600">
              Tối thiểu 20 ký tự · không chia sẻ thông tin cá nhân
            </span>
            <div className="flex flex-wrap justify-end gap-3">
              {onCancel ? (
                <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
                  Hủy
                </Button>
              ) : null}
              <Button type="submit" pending={pending} pendingLabel="Đang gửi…">
                {isDialog ? "Gửi đánh giá" : "Gửi để kiểm duyệt"}
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </section>
  );
}
