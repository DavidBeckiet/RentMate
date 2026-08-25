"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ReviewReportCategory } from "../../types/api";

const categories: readonly { readonly value: ReviewReportCategory; readonly label: string }[] = [
  { value: "INACCURATE", label: "Thông tin không chính xác" },
  { value: "OFFENSIVE", label: "Nội dung xúc phạm" },
  { value: "HARASSMENT", label: "Quấy rối" },
  { value: "SPAM", label: "Spam" },
  { value: "OTHER", label: "Lý do khác" }
];

export function ReportReviewControl({ reviewId }: Readonly<{ reviewId: number }>) {
  const { status, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReviewReportCategory>("INACCURATE");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "authenticated" && user?.role === "ADMIN") return null;
  if (status === "anonymous") {
    return (
      <p className="text-xs font-semibold text-rent-secondary">
        Thấy review có vấn đề?{" "}
        <Link className="font-extrabold underline decoration-2 underline-offset-4" href="/login">
          Đăng nhập để báo cáo
        </Link>
        .
      </p>
    );
  }
  if (status !== "authenticated") return null;
  if (submitted) {
    return (
      <p role="status" className="inline-flex items-center gap-2 text-xs font-bold text-teal-800">
        <Icon name="check" className="h-4 w-4" /> Đã gửi báo cáo review.
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        className="mt-4 inline-flex min-h-9 items-center gap-2 border-2 border-heroDark-950 bg-white px-3 text-xs font-extrabold shadow-glass-sm hover:bg-rent-coral focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brandBlue-500/40"
        onClick={() => setOpen(true)}
      >
        <Icon name="flag" className="h-4 w-4" /> Báo cáo review
      </button>
    );
  }

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api.reviews.report(reviewId, { category, details: details.trim() || null });
      setSubmitted(true);
      setOpen(false);
    } catch (caught: unknown) {
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.status === 409) setError("Bạn đã có một báo cáo đang được xử lý cho review này.");
      else if (apiError?.status === 404) setError("Review không còn ở trạng thái có thể báo cáo.");
      else if (apiError?.status === 429) setError("Bạn đã gửi quá nhiều báo cáo. Vui lòng thử lại sau.");
      else setError("Chưa thể gửi báo cáo review. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-4 max-w-xl space-y-3 border-2 border-heroDark-950 bg-[#fff6ef] p-3 shadow-glass-sm">
      <h3 className="font-display text-sm font-extrabold">Báo cáo review</h3>
      <label className="grid gap-1 text-xs font-extrabold" htmlFor={`review-report-category-${reviewId}`}>
        Lý do
        <select
          id={`review-report-category-${reviewId}`}
          value={category}
          onChange={(event) => setCategory(event.target.value as ReviewReportCategory)}
          className="min-h-10 border-2 border-heroDark-950 bg-white px-2 font-bold outline-none focus-visible:ring-4 focus-visible:ring-brandBlue-500/30"
        >
          {categories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-extrabold" htmlFor={`review-report-details-${reviewId}`}>
        Chi tiết <span className="font-semibold text-rent-secondary">(không bắt buộc)</span>
        <textarea
          id={`review-report-details-${reviewId}`}
          value={details}
          maxLength={2000}
          rows={3}
          onChange={(event) => setDetails(event.target.value)}
          className="resize-y border-2 border-heroDark-950 bg-white p-2 font-semibold outline-none focus-visible:ring-4 focus-visible:ring-brandBlue-500/30"
        />
      </label>
      {error ? (
        <p role="alert" className="text-xs font-bold text-red-800">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" pending={pending} onClick={() => void submit()}>
          Gửi báo cáo
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Hủy
        </Button>
      </div>
    </div>
  );
}
