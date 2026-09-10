"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ReportCategory } from "../../types/api";

const categories: readonly { readonly value: ReportCategory; readonly label: string }[] = [
  { value: "PRICE_INCORRECT", label: "Giá thuê không chính xác" },
  { value: "LOCATION_INCORRECT", label: "Vị trí không chính xác" },
  { value: "IMAGE_INCORRECT", label: "Hình ảnh không đúng" },
  { value: "ALREADY_RENTED", label: "Phòng đã được cho thuê" },
  { value: "FRAUD", label: "Có dấu hiệu lừa đảo" },
  { value: "INAPPROPRIATE", label: "Nội dung không phù hợp" }
];

interface ReportListingControlProps {
  readonly listingId: number;
  readonly hasReported?: boolean;
  readonly onReported?: () => void;
}

export function ReportListingControl({ listingId, hasReported = false, onReported }: ReportListingControlProps) {
  const { status, user } = useAuth();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("ALREADY_RENTED");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(hasReported);

  useEffect(() => {
    if (hasReported) setReported(true);
  }, [hasReported]);

  const resetForm = useCallback(() => {
    setCategory("ALREADY_RENTED");
    setDetails("");
    setError(null);
  }, []);
  const close = useCallback(() => {
    if (pending) return;
    setOpen(false);
    resetForm();
  }, [pending, resetForm]);
  const acknowledgeReport = useCallback(() => {
    setReported(true);
    setOpen(false);
    resetForm();
    onReported?.();
  }, [onReported, resetForm]);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api.listings.report(listingId, { category, details: details.trim() || null });
      acknowledgeReport();
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.status === 409) acknowledgeReport();
      else if (apiError?.status === 422) setError("Vui lòng kiểm tra lại thông tin báo cáo.");
      else if (apiError?.status === 429) setError("Bạn đã gửi quá nhiều báo cáo. Vui lòng thử lại sau.");
      else if (apiError?.status === 404) setError("Tin không còn ở trạng thái có thể báo cáo.");
      else setError("Chưa thể gửi báo cáo. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  };

  if (status === "authenticated" && user?.role !== "TENANT") return null;
  if (status === "anonymous") {
    return (
      <p className="text-xs font-semibold leading-5 text-rent-secondary">
        Thấy thông tin bất thường?{" "}
        <Link className="font-extrabold underline decoration-2 underline-offset-4" href="/login">
          Đăng nhập để báo cáo tin
        </Link>
        .
      </p>
    );
  }
  if (status !== "authenticated") return null;
  if (reported) {
    return (
      <p role="status" className="inline-flex items-center gap-2 text-xs font-semibold text-success-foreground">
        <Icon name="check" className="h-4 w-4" /> Bạn đã gửi báo cáo về tin này.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-border-strong bg-surface px-3 text-xs font-bold text-foreground transition-colors duration-200 hover:border-danger/40 hover:bg-danger-subtle hover:text-danger focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus/25"
      >
        <Icon name="flag" className="h-4 w-4" /> Báo cáo tin đăng
      </button>
      <Dialog
        open={open}
        title="Báo cáo tin đăng"
        description="Chỉ báo cáo khi bạn tin rằng nội dung tin đăng không chính xác, không còn phù hợp hoặc có dấu hiệu vi phạm."
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
          <label className="grid gap-2 text-sm font-semibold" htmlFor={`report-category-${listingId}`}>
            Lý do
            <select
              id={`report-category-${listingId}`}
              value={category}
              onChange={(event) => setCategory(event.target.value as ReportCategory)}
              className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-sm font-medium outline-none focus:ring-4 focus:ring-focus/25"
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold" htmlFor={`report-details-${listingId}`}>
            Chi tiết <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
            <textarea
              id={`report-details-${listingId}`}
              value={details}
              maxLength={2000}
              rows={4}
              onChange={(event) => setDetails(event.target.value)}
              className="w-full resize-y rounded-control border border-border-strong bg-surface p-3 text-sm font-normal outline-none focus:ring-4 focus:ring-focus/25"
              placeholder="Mô tả ngắn điều bạn phát hiện"
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
    </>
  );
}
