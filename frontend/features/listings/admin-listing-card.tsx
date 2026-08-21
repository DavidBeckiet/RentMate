import Link from "next/link";
import { AccountStatusBadge, ListingStatusBadge } from "../../components/ui/status-badge";
import type { AdminListingSummary } from "../../types/api";
import { ListingMetadata } from "./listing-presentation";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export function AdminListingCard({ listing }: { readonly listing: AdminListingSummary }) {
  return (
    <article className="rm-admin-row">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-rent-ink">{listing.title ?? "Chưa có tiêu đề"}</h2>
            <ListingStatusBadge status={listing.status} />
          </div>
          <ListingMetadata>{listing.areaName ?? "Chưa có khu vực"}</ListingMetadata>
          <dl className="grid gap-x-6 gap-y-2 text-sm text-rent-secondary sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-rent-ink">Người cho thuê</dt>
              <dd className="break-all">{listing.landlord.email}</dd>
            </div>
            <div>
              <dt className="font-semibold text-rent-ink">Điện thoại</dt>
              <dd>{listing.landlord.phone || "Chưa có số điện thoại"}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <AccountStatusBadge isActive={listing.landlord.isActive} />
            <span className="text-xs text-rent-subtle">
              Cập nhật {dateFormatter.format(new Date(listing.updatedAt))}
            </span>
          </div>
        </div>
        <Link
          href={`/admin/listings/${listing.id}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm transition-all hover:border-teal-500 hover:bg-teal-50 hover:text-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}
