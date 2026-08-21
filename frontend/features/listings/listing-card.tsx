import Image from "next/image";
import Link from "next/link";
import { FavoriteSaveControl } from "../favorites/favorite-save-control";
import type { PublicListingSummary } from "../../types/api";
import { formatAreaSqm, formatDistanceKm, formatVnd } from "./format";

const fallbackImage = "/images/rentmate-home-hero.png";

export interface ListingCardProps {
  readonly listing: PublicListingSummary;
  readonly showFavorite?: boolean;
}

export function ListingCard({ listing, showFavorite = true }: ListingCardProps) {
  return (
    <article className="rm-card group relative flex h-full flex-col justify-between overflow-hidden cursor-pointer">
      <Link
        href={`/listings/${listing.id}`}
        className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      >
        {/* Image Box */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
          <Image
            src={listing.coverImage?.url || fallbackImage}
            alt={listing.coverImage?.altText ?? `Ảnh của ${listing.title}`}
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />

          {/* Badges on Top Left */}
          <div className="absolute left-3 top-3 flex flex-col gap-1 z-10">
            <span className="rounded-md bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-900 shadow-sm">
              {listing.propertyType.label}
            </span>
          </div>

          {/* Distance Badge if available */}
          {listing.distanceKm !== undefined && (
            <div className="absolute bottom-2.5 left-2.5 rounded-full bg-slate-950/75 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-bold text-white z-10">
              📍 {formatDistanceKm(listing.distanceKm)}
            </div>
          )}
        </div>

        {/* Card Body */}
        <div className="flex flex-1 flex-col justify-between p-4">
          <div className="space-y-1.5">
            {/* Price */}
            <div className="text-lg sm:text-xl font-black text-brandBlue-500 tracking-tight">
              {formatVnd(listing.monthlyRent)}
              <span className="text-xs font-normal text-slate-400">/tháng</span>
            </div>

            {/* Title */}
            <h3 className="rm-listing-title text-sm sm:text-[15px] font-bold leading-snug text-slate-800 uppercase transition-colors group-hover:text-brandBlue-500">
              {listing.title}
            </h3>

            {/* Address */}
            <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
              <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brandBlue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              <span className="truncate">{listing.areaName}</span>
            </div>

          </div>

          {/* Footer Metadata */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-3 text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1 font-bold text-slate-700">
              📐 {formatAreaSqm(listing.roomAreaSqm)}
            </span>
            <span className="text-[11px] text-brandBlue-600 font-bold">
              Xem chi tiết →
            </span>
          </div>
        </div>
      </Link>

      {/* Favorite Heart Button */}
      {showFavorite && (
        <div className="absolute right-3 top-3 z-20">
          <FavoriteSaveControl listingId={String(listing.id)} compact />
        </div>
      )}
    </article>
  );
}

