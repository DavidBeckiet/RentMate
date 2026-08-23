"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/ui/button";
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

export function ReportListingControl({ listingId }: { readonly listingId: number }) {
  const { status, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("ALREADY_RENTED");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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
  if (submitted) {
    return (
      <div role="status" className="border-2 border-heroDark-950 bg-rent-accent p-3 text-xs font-bold shadow-glass-sm">
        <span className="inline-flex items-center gap-2">
          <Icon name="check" className="h-4 w-4" /> Báo cáo đã được gửi tới đội ngũ an toàn.
        </span>
      </div>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 border-2 border-heroDark-950 bg-white px-3 text-xs font-extrabold shadow-glass-sm transition-colors duration-200 hover:bg-rent-coral focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brandBlue-500/40"
      >
        <Icon name="shield" className="h-4 w-4" /> Báo cáo tin này
      </button>
    );
  }

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api.listings.report(listingId, { category, details: details.trim() || null });
      setSubmitted(true);
      setOpen(false);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.status === 409) setError("Bạn đã có một báo cáo đang được xử lý cho tin này.");
      else if (apiError?.status === 429) setError("Bạn đã gửi quá nhiều báo cáo. Vui lòng thử lại sau.");
      else if (apiError?.status === 404) setError("Tin không còn ở trạng thái có thể báo cáo.");
      else setError("Chưa thể gửi báo cáo. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 border-2 border-heroDark-950 bg-[#fff6ef] p-3 shadow-glass-sm">
      <div>
        <h3 className="font-display text-sm font-extrabold">Báo cáo tin đăng</h3>
        <p className="mt-1 text-xs leading-5 text-rent-secondary">
          Chỉ gửi thông tin bạn tin là chính xác. Admin sẽ kiểm tra trước khi xử lý.
        </p>
      </div>
      <label className="block text-xs font-extrabold" htmlFor={`report-category-${listingId}`}>
        Lý do
      </label>
      <select
        id={`report-category-${listingId}`}
        value={category}
        onChange={(event) => setCategory(event.target.value as ReportCategory)}
        className="min-h-11 w-full cursor-pointer border-2 border-heroDark-950 bg-white px-3 text-xs font-bold outline-none focus:ring-4 focus:ring-brandBlue-500/30"
      >
        {categories.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <label className="block text-xs font-extrabold" htmlFor={`report-details-${listingId}`}>
        Chi tiết <span className="font-semibold text-rent-secondary">(không bắt buộc)</span>
      </label>
      <textarea
        id={`report-details-${listingId}`}
        value={details}
        maxLength={2000}
        rows={4}
        onChange={(event) => setDetails(event.target.value)}
        className="w-full resize-y border-2 border-heroDark-950 bg-white p-3 text-xs font-semibold outline-none focus:ring-4 focus:ring-brandBlue-500/30"
        placeholder="Mô tả ngắn điều bạn phát hiện"
      />
      <p className="text-right text-[10px] font-bold text-rent-secondary">{details.length}/2000</p>
      {error ? (
        <p role="alert" className="border-l-4 border-red-800 pl-2 text-xs font-bold text-red-800">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          pending={pending}
          pendingLabel="Đang gửi…"
          className="flex-1 px-3 text-xs"
          onClick={() => void submit()}
        >
          Gửi báo cáo
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          className="px-3 text-xs"
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
