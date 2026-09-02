import Link from "next/link";
import { MediaImage } from "../../components/ui/media-image";
import { BusinessStatusBadge } from "../../components/ui/status-badge";
import type { PublicListingSummary } from "../../types/api";
import { formatAreaSqm, formatVnd } from "./format";

export function SearchMapListingPopup({ listing }: { readonly listing: PublicListingSummary }) {
  const imageAlt = listing.coverImage.altText ?? "Ảnh của " + listing.title;

  return (
    <article className="w-64 max-w-[calc(100vw-4rem)] space-y-3 text-foreground">
      <div className="flex gap-3">
        <MediaImage
          src={listing.coverImage.url}
          alt={imageAlt}
          width={88}
          height={66}
          className="h-[4.125rem] w-[5.5rem] shrink-0 rounded-control border border-border object-cover"
          fallback={
            <div
              role="img"
              aria-label={imageAlt}
              className="grid h-[4.125rem] w-[5.5rem] shrink-0 place-items-center rounded-control bg-info-subtle text-info-foreground"
            >
              <span className="sr-only">Không thể tải hình ảnh</span>
            </div>
          }
        />
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-display text-ui-sm font-bold leading-5">{listing.title}</h3>
          <p className="mt-1 text-ui-sm font-extrabold text-primary-hover">{formatVnd(listing.monthlyRent)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-ui-xs font-semibold text-muted-foreground">
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
          href={"/listings/" + listing.id}
          className="inline-flex min-h-10 items-center rounded-control border border-primary bg-primary px-3 text-ui-xs font-extrabold text-primary-foreground shadow-surface transition-transform hover:-translate-y-0.5 hover:bg-primary-hover focus-visible:outline-none"
        >
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}
