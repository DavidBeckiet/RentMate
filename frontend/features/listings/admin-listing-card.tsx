import Link from "next/link";
import { AccountStatusBadge, ListingStatusBadge } from "../../components/ui/status-badge";
import type { AdminListingSummary } from "../../types/api";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export function AdminListingCard({ listing }: { readonly listing: AdminListingSummary }) {
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-950">{listing.title ?? "Chưa có tiêu đề"}</h2>
            <ListingStatusBadge status={listing.status} />
          </div>
          <p className="text-sm text-slate-700">{listing.areaName ?? "Chưa có khu vực"}</p>
          <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-900">Người cho thuê</dt>
              <dd className="break-all">{listing.landlord.email}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Điện thoại</dt>
              <dd>{listing.landlord.phone || "Chưa có số điện thoại"}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <AccountStatusBadge isActive={listing.landlord.isActive} />
            <span className="text-xs text-slate-500">Cập nhật {dateFormatter.format(new Date(listing.updatedAt))}</span>
          </div>
        </div>
        <Link
          href={`/admin/listings/${listing.id}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
        >
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}
