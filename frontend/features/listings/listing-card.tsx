import Image from "next/image";
import Link from "next/link";
import type { PublicListingSummary } from "../../types/api";
import { formatAreaSqm, formatDistanceKm, formatVnd } from "./format";

export interface ListingCardProps {
  readonly listing: PublicListingSummary;
}

export function ListingCard({ listing }: ListingCardProps) {
  const coverImage: PublicListingSummary["coverImage"] | null = listing.coverImage;

  return (
    <article className="group overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-colors hover:border-teal-300">
      <Link
        href={`/listings/${listing.id}`}
        className="grid min-h-44 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700 sm:grid-cols-[12rem_1fr]"
      >
        <div className="relative aspect-[4/3] min-h-44 overflow-hidden bg-stone-100 sm:aspect-auto">
          {coverImage ? (
            <Image
              src={coverImage.url}
              alt={coverImage.altText ?? `Ảnh của ${listing.title}`}
              fill
              sizes="(min-width: 1024px) 192px, (min-width: 640px) 192px, 100vw"
              className="object-cover transition-opacity group-hover:opacity-95"
            />
          ) : (
            <div
              role="img"
              aria-label={`Chưa có ảnh cho ${listing.title}`}
              className="flex h-full min-h-44 items-center justify-center px-4 text-center text-sm font-medium text-slate-500"
            >
              Chưa có ảnh
            </div>
          )}
        </div>
        <div className="min-w-0 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-lg font-semibold leading-6 text-slate-950 group-hover:text-teal-800">
              {listing.title}
            </h2>
            {listing.distanceKm !== undefined ? (
              <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                {formatDistanceKm(listing.distanceKm)}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-xl font-bold text-teal-800">{formatVnd(listing.monthlyRent)}</p>
          <p className="mt-2 text-sm text-slate-700">
            {formatAreaSqm(listing.roomAreaSqm)} · {listing.propertyType.label}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">{listing.areaName}</p>
          {listing.amenities.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Tiện ích">
              {listing.amenities.map((amenity) => (
                <li key={amenity.code} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-slate-700">
                  {amenity.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
