"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ReviewReportCategory } from "../../types/api";

const categories: readonly { readonly value: ReviewReportCategory; readonly label: string }[] = [
  { value: "INACCURATE", label: "Thông tin không chính xác" },
  { value: "OFFENSIVE", label: "Nội dung xúc phạm" },
  { value: "HARASSMENT", label: "Quấy rối" },
  { value: "SPAM", label: "Nội dung rác / Spam" },
  { value: "OTHER", label: "Lý do khác" }
];

export function ReportReviewControl({
  reviewId,
  hasReported = false,
  onRequestReport
}: Readonly<{ reviewId: number; hasReported?: boolean; onRequestReport?: (reviewId: number) => void }>) {
  const { status, user } = useAuth();
  if (status === "authenticated" && user?.role === "ADMIN") return null;
  if (status === "anonymous")
    return (
      <p className="text-xs font-semibold text-rent-secondary">
        Thấy đánh giá có vấn đề?{" "}
        <Link className="font-extrabold underline decoration-2 underline-offset-4" href="/login">
          Đăng nhập để báo cáo
        </Link>
        .
      </p>
    );
  if (status !== "authenticated") return null;
  if (hasReported)
    return (
      <p role="status" className="inline-flex items-center gap-1.5 text-ui-xs font-semibold text-success-foreground">
        <Icon name="check" className="h-3.5 w-3.5" /> Bạn đã gửi báo cáo.
      </p>
    );
  return (
    <button
      type="button"
      onClick={() => onRequestReport?.(reviewId)}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-transparent bg-transparent px-2 text-ui-xs font-semibold text-muted-foreground hover:border-danger/20 hover:bg-danger-subtle hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/25"
    >
      <Icon name="flag" className="h-4 w-4" /> Báo cáo
    </button>
  );
}

export function ReviewReportDialog({
  reviewId,
  open,
  onClose,
  onReported
}: Readonly<{ reviewId: number | null; open: boolean; onClose: () => void; onReported: (reviewId: number) => void }>) {
  const formId = useId();
  const [category, setCategory] = useState<ReviewReportCategory>("INACCURATE");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCategory("INACCURATE");
      setDetails("");
      setError(null);
    }
  }, [open, reviewId]);
  const close = () => {
    if (!pending) onClose();
  };
  const submit = async () => {
    if (reviewId === null) return;
    setPending(true);
    setError(null);
    try {
      await api.reviews.report(reviewId, { category, details: details.trim() || null });
      onReported(reviewId);
    } catch (caught: unknown) {
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.status === 409) onReported(reviewId);
      else if (apiError?.status === 422) setError("Vui lòng kiểm tra lại thông tin báo cáo.");
      else if (apiError?.status === 404) setError("Đánh giá không còn ở trạng thái có thể báo cáo.");
      else if (apiError?.status === 429) setError("Bạn đã gửi quá nhiều báo cáo. Vui lòng thử lại sau.");
      else setError("Chưa thể gửi báo cáo đánh giá. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open={open}
      title="Báo cáo đánh giá"
      description="Chỉ báo cáo khi bạn tin rằng đánh giá có thông tin sai lệch, nội dung không phù hợp hoặc vi phạm quy định cộng đồng."
      onClose={close}
      closeLabel="Đóng biểu mẫu báo cáo"
      actions={
        <>
          <Button type="submit" form={formId} pending={pending} pendingLabel="Đang gửi…">
            Gửi báo cáo
          </Button>
          <Button variant="secondary" disabled={pending} onClick={close}>
            Hủy
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="grid gap-2 text-sm font-semibold" htmlFor="review-report-category">
          Lý do
          <select
            id="review-report-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as ReviewReportCategory)}
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-sm font-medium outline-none focus:ring-4 focus:ring-focus/25"
          >
            {categories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold" htmlFor="review-report-details">
          Chi tiết <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
          <textarea
            id="review-report-details"
            value={details}
            maxLength={2000}
            rows={4}
            onChange={(event) => setDetails(event.target.value)}
            className="w-full resize-y rounded-control border border-border-strong bg-surface p-3 text-sm font-normal outline-none focus:ring-4 focus:ring-focus/25"
          />
        </label>
        <p className="text-right text-ui-xs text-muted-foreground">{details.length}/2000</p>
        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger/30 bg-danger-subtle p-3 text-sm font-medium text-danger"
          >
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
