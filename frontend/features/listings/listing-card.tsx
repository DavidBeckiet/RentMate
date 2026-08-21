import Image from "next/image";
import Link from "next/link";
import { Icon } from "../../components/ui/icon";
import { ListingSaveControl } from "../../components/ui/listing-save-control";
import type { PublicListingSummary } from "../../types/api";
import { formatAreaSqm, formatDistanceKm, formatVnd } from "./format";
import styles from "./listing-card.module.css";

export interface ListingCardProps {
  readonly listing: PublicListingSummary;
  readonly showFavorite?: boolean;
  readonly href?: string;
  readonly variant?: "default" | "search";
}

export function ListingCard({ listing, showFavorite = true, href, variant = "default" }: ListingCardProps) {
  const coverImage = listing.coverImage;
  const searchVariant = variant === "search";

  return (
    <article
      className={`${styles.card} ${searchVariant ? styles.searchCard : ""} group relative flex h-full flex-col overflow-hidden`}
    >
      <Link href={href ?? `/listings/${listing.id}`} className="flex h-full flex-1 flex-col focus-visible:outline-none">
        <div
          className={`${styles.media} relative aspect-[4/3] overflow-hidden border-b-2 border-heroDark-950 bg-[#e5eefc]`}
        >
          {coverImage ? (
            <Image
              src={coverImage.url}
              alt={coverImage.altText ?? `Ảnh của ${listing.title}`}
              fill
              sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 motion-reduce:transition-none group-hover:scale-105"
            />
          ) : (
            <div
              role="img"
              aria-label={`Chưa có ảnh cho ${listing.title}`}
              className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center font-display text-sm font-bold"
            >
              <Icon name="home" className="h-9 w-9" />
              Chưa có ảnh
            </div>
          )}

          <span
            className={`${styles.badge} absolute left-3 top-3 border-2 border-heroDark-950 bg-rent-yellow px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.1em] shadow-glass-sm`}
          >
            {listing.propertyType.label}
          </span>
          {listing.distanceKm !== undefined ? (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 border-2 border-heroDark-950 bg-rent-accent px-2.5 py-1 font-display text-[10px] font-bold shadow-glass-sm">
              <Icon name="target" className="h-3.5 w-3.5" />
              {formatDistanceKm(listing.distanceKm)}
            </span>
          ) : null}
        </div>

        <div className={`${styles.content} flex flex-1 flex-col justify-between gap-5 p-4 sm:p-5`}>
          <div>
            <div className="flex items-start justify-between gap-3">
              <p className={`${styles.price} font-display text-xl font-bold tracking-[-0.04em] text-brandBlue-600`}>
                {formatVnd(listing.monthlyRent)}
              </p>
              <Icon name="arrowUpRight" className="h-5 w-5 shrink-0 transition-transform group-hover:rotate-45" />
            </div>
            <h2 className="rm-listing-title mt-2 font-display text-base font-bold leading-5">{listing.title}</h2>
            <p className={`${styles.location} mt-3 flex items-center gap-2 text-xs font-semibold text-rent-secondary`}>
              <Icon name="pin" className="h-4 w-4 shrink-0" />
              <span className="truncate">{listing.areaName}</span>
            </p>
          </div>

          <div
            className={`${styles.meta} flex flex-wrap items-center justify-between gap-2 border-t-2 border-heroDark-950 pt-3 text-xs font-bold`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name="ruler" className="h-4 w-4" />
              {formatAreaSqm(listing.roomAreaSqm)} · {listing.propertyType.label}
            </span>
            {listing.amenities.slice(0, 1).map((amenity) => (
              <span
                key={amenity.code}
                className={`${styles.amenity} border border-heroDark-950 bg-[#e5eefc] px-2 py-1`}
              >
                {amenity.label}
              </span>
            ))}
          </div>
        </div>
      </Link>

      {showFavorite ? (
        <div className="absolute right-3 top-3 z-20">
          <ListingSaveControl listingId={String(listing.id)} compact />
        </div>
      ) : null}
    </article>
  );
}
