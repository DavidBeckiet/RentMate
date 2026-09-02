import Link from "next/link";
import { AdminPill } from "../../components/ui/admin-workspace";
import { AccountStatusBadge, BusinessStatusBadge, ListingStatusBadge } from "../../components/ui/status-badge";
import type { AdminListingSummary } from "../../types/api";
import { ListingMetadata } from "./listing-presentation";
import { getListingFreshness, ListingFreshnessLabel } from "./listing-freshness";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export function AdminListingCard({ listing }: { readonly listing: AdminListingSummary }) {
  const freshness = getListingFreshness(listing.updatedAt);
  const hasTrustSignals = freshness.isStale || listing.openReportCount > 0 || listing.possibleDuplicate;

  return (
    <article className="rm-admin-mobile-record">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 basis-full truncate font-display text-lg font-bold tracking-tight text-foreground sm:basis-auto sm:text-xl">
              {listing.title ?? "Chưa có tiêu đề"}
            </h2>
            <ListingStatusBadge status={listing.status} />
            <BusinessStatusBadge status={listing.businessStatus} />
          </div>
          <ListingMetadata>{listing.areaName ?? "Chưa có khu vực"}</ListingMetadata>
          <dl className="grid min-w-0 gap-3 border-t border-border pt-3 text-ui-sm text-muted-foreground sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="font-semibold text-foreground">Người cho thuê</dt>
              <dd className="truncate">{listing.landlord.email}</dd>
            </div>
            <div className="min-w-0">
              <dt className="font-semibold text-foreground">Điện thoại</dt>
              <dd className="truncate">{listing.landlord.phone || "Chưa có số điện thoại"}</dd>
            </div>
          </dl>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <AccountStatusBadge isActive={listing.landlord.isActive} />
            <span className="text-ui-xs text-subtle-foreground">
              <ListingFreshnessLabel updatedAt={listing.updatedAt} /> ·{" "}
              {dateFormatter.format(new Date(listing.updatedAt))}
            </span>
          </div>
          {hasTrustSignals ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2" role="note" aria-label="Tín hiệu cần kiểm tra">
              {freshness.isStale ? <AdminPill tone="attention">Lâu chưa cập nhật</AdminPill> : null}
              {listing.openReportCount > 0 ? (
                <AdminPill tone="attention">{listing.openReportCount} báo cáo đang chờ xử lý</AdminPill>
              ) : null}
              {listing.possibleDuplicate ? <AdminPill tone="attention">Có khả năng trùng lặp</AdminPill> : null}
            </div>
          ) : null}
        </div>
        <Link
          href={`/admin/listings/${listing.id}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-control border border-primary bg-primary px-4 py-2 text-ui-sm font-semibold text-primary-foreground shadow-surface transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-raised focus-visible:outline-none lg:mt-1"
        >
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}
