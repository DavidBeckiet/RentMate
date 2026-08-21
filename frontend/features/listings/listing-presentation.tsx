import Image from "next/image";
import type { ReactNode } from "react";
import type { Amenity, OwnerImage, PublicImage } from "../../types/api";
import { formatVnd } from "./format";

type ListingImageSource = Pick<PublicImage | OwnerImage, "url" | "altText">;

export interface ListingImageProps {
  readonly image: ListingImageSource | null;
  readonly title: string;
  readonly sizes: string;
  readonly className?: string;
}

export function ListingImage({ image, title, sizes, className = "" }: ListingImageProps) {
  return (
    <div className={`relative aspect-[4/3] overflow-hidden border-b-2 border-heroDark-950 bg-[#e5eefc] ${className}`}>
      {image ? (
        <Image
          src={image.url}
          alt={image.altText ?? `Ảnh của ${title}`}
          fill
          sizes={sizes}
          className="object-cover transition-transform duration-500 motion-reduce:transition-none group-hover:scale-105"
        />
      ) : (
        <div
          role="img"
          aria-label={`Chưa có ảnh cho ${title}`}
          className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center font-display text-sm font-bold text-rent-secondary"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-9 w-9 text-brandBlue-600"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8" cy="9" r="1.5" />
            <path d="m4 18 5.5-5 3.5 3 2.5-2.5 4.5 4.5" />
          </svg>
          <span>Chưa có ảnh</span>
        </div>
      )}
    </div>
  );
}

export function ListingPrice({
  monthlyRent,
  missingLabel = "Chưa nhập giá",
  emphasis = "default"
}: {
  readonly monthlyRent: number | null;
  readonly missingLabel?: string;
  readonly emphasis?: "default" | "prominent";
}) {
  if (monthlyRent === null) return <p className="text-base font-bold text-slate-500">{missingLabel}</p>;
  const rentValue = formatVnd(monthlyRent).replace(/\s*\/\s*tháng$/, "");

  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-rent-ink">
      <span
        className={
          emphasis === "prominent"
            ? "font-display text-4xl font-bold tracking-[-0.05em] text-brandBlue-600"
            : "font-display text-2xl font-bold tracking-[-0.04em] text-brandBlue-600"
        }
      >
        {rentValue}
      </span>
      <span className="font-display text-xs font-bold uppercase tracking-wider text-rent-secondary">/ tháng</span>
    </p>
  );
}

export function ListingMetadata({
  children,
  className = ""
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <p className={`text-sm font-semibold leading-6 text-rent-secondary ${className}`}>{children}</p>;
}

export function ListingAmenityChips({ amenities }: { readonly amenities: readonly Amenity[] }) {
  if (amenities.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tiện ích">
      {amenities.map((amenity) => (
        <li
          key={amenity.code}
          className="border-2 border-heroDark-950 bg-[#e5eefc] px-2.5 py-1 font-display text-[11px] font-bold text-rent-ink shadow-glass-sm"
        >
          {amenity.label}
        </li>
      ))}
    </ul>
  );
}

export function ListingCardShell({
  children,
  className = ""
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <article
      className={`group overflow-hidden border-2 border-heroDark-950 bg-rent-surface shadow-glass transition-[box-shadow,transform] duration-200 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-card-hover ${className}`}
    >
      {children}
    </article>
  );
}
