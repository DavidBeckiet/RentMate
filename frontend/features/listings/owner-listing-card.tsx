import Image from "next/image";
import Link from "next/link";
import { ListingStatusBadge } from "../../components/ui/status-badge";
import type { OwnerListingSummary } from "../../types/api";
import { formatVnd } from "./format";

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
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <Link
        href={`/landlord/listings/${listing.id}`}
        className="group grid min-h-44 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700 sm:grid-cols-[12rem_1fr]"
      >
        <div className="relative aspect-[4/3] min-h-44 overflow-hidden bg-stone-100 sm:aspect-auto">
          {listing.coverImage ? (
            <Image
              src={listing.coverImage.url}
              alt={listing.coverImage.altText ?? `Ảnh của ${title}`}
              fill
              sizes="(min-width: 640px) 192px, 100vw"
              className="object-cover transition-opacity group-hover:opacity-95"
            />
          ) : (
            <div
              role="img"
              aria-label={`Chưa có ảnh cho ${title}`}
              className="flex h-full min-h-44 items-center justify-center px-4 text-center text-sm font-medium text-slate-500"
            >
              Chưa có ảnh
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-semibold leading-6 text-slate-950 group-hover:text-teal-800">{title}</h2>
            <ListingStatusBadge status={listing.status} />
          </div>
          <p className="text-xl font-bold text-teal-800">
            {listing.monthlyRent === null ? "Chưa nhập giá" : formatVnd(listing.monthlyRent)}
          </p>
          <p className="text-sm text-slate-700">
            {listing.propertyType?.label ?? "Chưa chọn loại"} · {listing.areaName ?? "Chưa nhập khu vực"}
          </p>
          {reason ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
              <p className="font-semibold">{reason.label}</p>
              <p className="mt-1 whitespace-pre-wrap">{reason.value}</p>
            </div>
          ) : null}
          <p className="text-xs text-slate-500">Cập nhật {dateFormatter.format(new Date(listing.updatedAt))}</p>
        </div>
      </Link>
    </article>
  );
}
