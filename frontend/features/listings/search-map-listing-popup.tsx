import Image from "next/image";
import Link from "next/link";
import { BusinessStatusBadge } from "../../components/ui/status-badge";
import type { PublicListingSummary } from "../../types/api";
import { formatAreaSqm, formatVnd } from "./format";

export function SearchMapListingPopup({ listing }: { readonly listing: PublicListingSummary }) {
  return (
    <article className="w-64 max-w-[calc(100vw-4rem)] space-y-3 text-rent-ink">
      <div className="flex gap-3">
        <Image
          src={listing.coverImage.url}
          alt={listing.coverImage.altText ?? `Ảnh của ${listing.title}`}
          width={88}
          height={66}
          className="h-[4.125rem] w-[5.5rem] shrink-0 border-2 border-heroDark-950 object-cover"
        />
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-display text-sm font-bold leading-5">{listing.title}</h3>
          <p className="mt-1 text-sm font-extrabold text-rent-primary">{formatVnd(listing.monthlyRent)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-rent-secondary">
        <span>{listing.areaName}</span>
        <span aria-hidden="true">·</span>
        <span>{formatAreaSqm(listing.roomAreaSqm)}</span>
        {listing.maxOccupants !== null ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{listing.maxOccupants} người tối đa</span>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BusinessStatusBadge status={listing.businessStatus} />
        <Link
          href={`/listings/${listing.id}`}
          className="inline-flex min-h-10 items-center border-2 border-heroDark-950 bg-rent-accent px-3 text-xs font-extrabold shadow-glass-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none"
        >
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}
