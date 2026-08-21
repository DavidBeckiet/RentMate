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
    <div className={`relative aspect-[4/3] overflow-hidden bg-slate-100 ${className}`}>
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
          className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm font-semibold text-slate-400"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-9 w-9 text-sky-600">
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
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-slate-900">
      <span className={emphasis === "prominent" ? "text-3xl font-black tracking-tight text-sky-700" : "text-2xl font-black tracking-tight text-sky-700"}>
        {rentValue}
      </span>
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">/ tháng</span>
    </p>
  );
}

export function ListingMetadata({ children, className = "" }: { readonly children: ReactNode; readonly className?: string }) {
  return <p className={`text-sm font-semibold leading-6 text-slate-600 ${className}`}>{children}</p>;
}

export function ListingAmenityChips({ amenities }: { readonly amenities: readonly Amenity[] }) {
  if (amenities.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tiện ích">
      {amenities.map((amenity) => (
        <li
          key={amenity.code}
          className="rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[11px] font-extrabold text-slate-600"
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
      className={`group overflow-hidden rounded-card border border-slate-200/90 bg-white shadow-sm transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-sky-500/50 hover:shadow-card-hover ${className}`}
    >
      {children}
    </article>
  );
}
