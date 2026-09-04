import Link from "next/link";
import { Icon } from "../../components/ui/icon";
import { ListingSaveControl } from "../../components/ui/listing-save-control";
import { MediaImage } from "../../components/ui/media-image";
import { ComparisonToggle } from "../comparison/comparison-toggle";
import type { PublicListingSummary } from "../../types/api";
import { formatAreaSqm, formatVnd } from "./format";
import { ListingFreshnessLabel } from "./listing-freshness";
import { formatNearMeDistance } from "./near-me-format";
import styles from "./near-me-page.module.css";

export interface NearMeResultCardProps {
  readonly listing: PublicListingSummary;
  readonly position: number;
  readonly selected: boolean;
}

export function NearMeResultCard({ listing, position, selected }: NearMeResultCardProps) {
  const distance = typeof listing.distanceKm === "number" ? formatNearMeDistance(listing.distanceKm) : null;
  const imageAlt = listing.coverImage.altText ?? `Ảnh của ${listing.title}`;

  return (
    <article
      id={`near-me-listing-${listing.id}`}
      aria-current={selected ? "true" : undefined}
      className={`${styles.railCard} ${selected ? styles.railCardSelected : ""}`}
    >
      <Link href={`/listings/${listing.id}`} target="_blank" rel="noopener noreferrer" className={styles.railCardLink}>
        <div className={styles.railCardMedia}>
          <MediaImage
            src={listing.coverImage.url}
            alt={imageAlt}
            fill
            sizes="(min-width: 1024px) 11vw, (min-width: 640px) 28vw, 34vw"
            className={styles.railCardImage}
            fallback={
              <div role="img" aria-label={imageAlt} className={styles.railCardImageFallback}>
                <Icon name="home" className="h-6 w-6" />
              </div>
            }
          />
        </div>

        <div className={styles.railCardBody}>
          <div className={styles.railCardTopline}>
            <span className={styles.railCardDistance}>
              <Icon name="target" className="h-3.5 w-3.5" />
              {distance ?? "Khoảng cách chưa có"}
            </span>
            <span className={styles.railCardRank}>{position === 1 ? "Gần nhất" : `#${position}`}</span>
          </div>
          <p className={styles.railCardPrice}>{formatVnd(listing.monthlyRent)}</p>
          <h3 className={styles.railCardTitle} title={listing.title}>
            {listing.title}
          </h3>
          <p className={styles.railCardLocation}>
            <Icon name="pin" className="h-3.5 w-3.5 shrink-0" />
            <span title={listing.areaName}>{listing.areaName}</span>
          </p>
          <div className={styles.railCardMeta}>
            <span>{formatAreaSqm(listing.roomAreaSqm)}</span>
            {listing.maxOccupants !== null ? <span>{listing.maxOccupants} người tối đa</span> : null}
            <span>
              <ListingFreshnessLabel updatedAt={listing.updatedAt} />
            </span>
          </div>
        </div>
      </Link>

      <div className={styles.railCardActions}>
        <ListingSaveControl listingId={String(listing.id)} compact />
        <ComparisonToggle listingId={listing.id} compact />
      </div>
    </article>
  );
}
