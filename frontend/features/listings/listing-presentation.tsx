import type { ReactNode } from "react";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
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
    <div className={`relative aspect-[4/3] overflow-hidden border-b border-border bg-sky ${className}`}>
      {image ? (
        <MediaImage
          src={image.url}
          alt={image.altText ?? `Ảnh của ${title}`}
          fill
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={`Chưa có ảnh cho ${title}`}
          className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center font-sans text-ui-sm font-semibold text-muted-foreground"
        >
          <Icon name="home" className="h-9 w-9 text-primary" />
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
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-foreground">
      <span
        className={
          emphasis === "prominent"
            ? "font-display text-4xl font-bold tracking-[-0.05em] text-primary-hover"
            : "font-display text-2xl font-bold tracking-[-0.04em] text-primary-hover"
        }
      >
        {rentValue}
      </span>
      <span className="font-sans text-ui-xs font-semibold uppercase tracking-wider text-muted-foreground">/ tháng</span>
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
  return <p className={`text-ui-sm font-semibold leading-6 text-muted-foreground ${className}`}>{children}</p>;
}

export function ListingAmenityChips({ amenities }: { readonly amenities: readonly Amenity[] }) {
  if (amenities.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tiện ích">
      {amenities.map((amenity) => (
        <li
          key={amenity.code}
          className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 font-sans text-ui-xs font-semibold text-foreground"
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
      className={`group overflow-hidden rounded-card border border-border bg-surface shadow-surface transition-[box-shadow,transform] duration-standard ease-standard hover:-translate-y-0.5 hover:shadow-raised motion-reduce:transition-none ${className}`}
    >
      {children}
    </article>
  );
}
