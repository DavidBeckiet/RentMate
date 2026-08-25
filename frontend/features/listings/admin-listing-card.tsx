import Link from "next/link";
import { AccountStatusBadge, BusinessStatusBadge, ListingStatusBadge } from "../../components/ui/status-badge";
import type { AdminListingSummary } from "../../types/api";
import { ListingMetadata } from "./listing-presentation";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export function AdminListingCard({ listing }: { readonly listing: AdminListingSummary }) {
  return (
    <article className="rm-admin-row">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight text-rent-ink">
              {listing.title ?? "Chưa có tiêu đề"}
            </h2>
            <ListingStatusBadge status={listing.status} />
            <BusinessStatusBadge status={listing.businessStatus} />
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
          className="inline-flex min-h-11 shrink-0 items-center justify-center border-2 border-heroDark-950 bg-rent-accent px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-rent-ink shadow-glass-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 focus-visible:outline-none"
        >
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}
