import Link from "next/link";
import { BusinessStatusBadge, ListingStatusBadge } from "../../components/ui/status-badge";
import type { OwnerListingSummary } from "../../types/api";
import { ListingCardShell, ListingImage, ListingMetadata, ListingPrice } from "./listing-presentation";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

function moderationReason(listing: OwnerListingSummary) {
  if (!listing.currentModerationReason) return null;
  if (listing.status === "REJECTED") return { label: "Lý do từ chối", value: listing.currentModerationReason };
  if (listing.status === "HIDDEN") return { label: "Lý do ẩn", value: listing.currentModerationReason };
  return null;
}

export function OwnerListingCard({
  listing,
  onDuplicate,
  duplicatePending = false
}: {
  readonly listing: OwnerListingSummary;
  readonly onDuplicate?: () => void;
  readonly duplicatePending?: boolean;
}) {
  const title = listing.title ?? "Chưa có tiêu đề";
  const reason = moderationReason(listing);

  return (
    <ListingCardShell className="rm-listing-management-card">
      <Link
        href={`/landlord/listings/${listing.id}`}
        className="grid min-h-44 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus sm:grid-cols-[13rem_1fr]"
      >
        <ListingImage
          image={listing.coverImage}
          title={title}
          sizes="(min-width: 640px) 208px, 100vw"
          className="rm-listing-cover min-h-44 sm:aspect-auto"
        />

        <div className="min-w-0 space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="rm-listing-title text-lg font-semibold leading-6 text-foreground group-hover:text-primary-hover">
              {title}
            </h2>
            <div className="flex flex-wrap justify-end gap-2">
              <ListingStatusBadge status={listing.status} />
              <BusinessStatusBadge status={listing.businessStatus} />
            </div>
          </div>
          <ListingPrice monthlyRent={listing.monthlyRent} />
          <ListingMetadata>
            {listing.propertyType?.label ?? "Chưa chọn loại"} · {listing.areaName ?? "Chưa nhập khu vực"}
            {listing.maxOccupants !== null ? ` · ${listing.maxOccupants} người tối đa` : ""}
          </ListingMetadata>
          {listing.availabilityStatus === "REMINDER_DUE" ? (
            <p className="text-sm font-semibold text-amber-800">Cần xác nhận lại tình trạng phòng</p>
          ) : listing.availabilityStatus === "AUTO_PAUSED" ? (
            <p className="text-sm font-semibold text-red-800">Đã tạm dừng vì quá hạn xác nhận</p>
          ) : null}
          {reason ? (
            <div className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-950">
              <p className="font-semibold">{reason.label}</p>
              <p className="mt-1 whitespace-pre-wrap">{reason.value}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="rm-listing-meta">Cập nhật {dateFormatter.format(new Date(listing.updatedAt))}</p>
            <span className="text-sm font-semibold text-primary-hover">Quản lý tin</span>
          </div>
        </div>
      </Link>
      {onDuplicate ? (
        <div className="rm-listing-actions flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <p className="text-xs text-rent-subtle">Tạo tin mới từ nội dung này, ảnh sẽ không được sao chép.</p>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-control border border-border bg-surface px-3 py-2 text-sm font-bold text-foreground shadow-surface transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary-subtle hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
            disabled={duplicatePending}
            aria-busy={duplicatePending || undefined}
            onClick={onDuplicate}
          >
            {duplicatePending ? "Đang nhân bản…" : "Nhân bản"}
          </button>
        </div>
      ) : null}
    </ListingCardShell>
  );
}
