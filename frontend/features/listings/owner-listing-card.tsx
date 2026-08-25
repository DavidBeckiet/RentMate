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

export function OwnerListingCard({ listing }: { readonly listing: OwnerListingSummary }) {
  const title = listing.title ?? "Chưa có tiêu đề";
  const reason = moderationReason(listing);

  return (
    <ListingCardShell>
      <Link
        href={`/landlord/listings/${listing.id}`}
        className="grid min-h-44 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700 sm:grid-cols-[13rem_1fr]"
      >
        <ListingImage
          image={listing.coverImage}
          title={title}
          sizes="(min-width: 640px) 208px, 100vw"
          className="min-h-44 sm:aspect-auto"
        />

        <div className="min-w-0 space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-semibold leading-6 text-rent-ink group-hover:text-teal-800">{title}</h2>
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
          {reason ? (
            <div className="rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-950">
              <p className="font-semibold">{reason.label}</p>
              <p className="mt-1 whitespace-pre-wrap">{reason.value}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rent-line pt-3">
            <p className="text-xs text-rent-subtle">Cập nhật {dateFormatter.format(new Date(listing.updatedAt))}</p>
            <span className="text-sm font-semibold text-teal-800">Quản lý tin</span>
          </div>
        </div>
      </Link>
    </ListingCardShell>
  );
}
