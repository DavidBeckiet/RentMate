import Link from "next/link";
import { Badge } from "../../components/ui/badge";
import { Icon } from "../../components/ui/icon";
import { ListingSaveControl } from "../../components/ui/listing-save-control";
import { MediaImage } from "../../components/ui/media-image";
import { Skeleton } from "../../components/ui/skeleton";
import { ComparisonToggle } from "../comparison/comparison-toggle";
import { BusinessStatusBadge } from "../../components/ui/status-badge";
import type { PublicListingSummary } from "../../types/api";
import { formatAreaSqm, formatDistanceKm, formatVnd } from "./format";
import { ListingFreshnessLabel } from "./listing-freshness";
import styles from "./listing-card.module.css";

export interface ListingCardProps {
  readonly listing: PublicListingSummary;
  readonly showFavorite?: boolean;
  readonly showCompare?: boolean;
  readonly href?: string;
  readonly variant?: "default" | "search";
  readonly mapSelected?: boolean;
  readonly onMapFocus?: () => void;
  readonly onMapSelect?: () => void;
}

export function ListingCardSkeleton({ variant = "default" }: { readonly variant?: "default" | "search" }) {
  return (
    <article
      aria-hidden="true"
      className={styles.card + " " + (variant === "search" ? styles.searchCard : "") + " " + styles.skeletonCard}
    >
      <div className={styles.media}>
        <Skeleton rounded="card" className={styles.skeletonMedia} />
      </div>
      <div className={styles.content}>
        <div className={styles.skeletonContent}>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-3 h-4 w-4/5" />
          <Skeleton className="mt-2 h-3 w-2/5" />
        </div>
        <div className={styles.meta}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </article>
  );
}

export function ListingCard({
  listing,
  showFavorite = true,
  showCompare = true,
  href,
  variant = "default",
  mapSelected = false,
  onMapFocus,
  onMapSelect
}: ListingCardProps) {
  const coverImage = listing.coverImage;
  const searchVariant = variant === "search";

  return (
    <article
      id={onMapFocus || onMapSelect ? "listing-card-" + listing.id : undefined}
      aria-current={mapSelected ? "true" : undefined}
      onMouseEnter={onMapFocus}
      onFocus={onMapFocus}
      className={
        styles.card + " " + (searchVariant ? styles.searchCard : "") + " " + (mapSelected ? styles.mapSelected : "")
      }
    >
      <Link href={href ?? "/listings/" + listing.id} className={styles.link}>
        <div className={styles.media}>
          {coverImage ? (
            <MediaImage
              src={coverImage.url}
              alt={coverImage.altText ?? "Ảnh của " + listing.title}
              fill
              sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
              className={styles.mediaImage}
              fallback={
                <div
                  role="img"
                  aria-label={coverImage.altText ?? "Ảnh của " + listing.title}
                  className={styles.imageFallback}
                >
                  <Icon name="home" className="h-9 w-9" />
                  <span>Không thể tải hình ảnh</span>
                </div>
              }
            />
          ) : (
            <div role="img" aria-label={"Chưa có ảnh cho " + listing.title} className={styles.imageFallback}>
              <Icon name="home" className="h-9 w-9" />
              <span>Chưa có ảnh</span>
            </div>
          )}

          {listing.distanceKm !== undefined ? (
            <Badge variant="info" className={styles.distance}>
              <Icon name="target" className="h-3.5 w-3.5" />
              {formatDistanceKm(listing.distanceKm)}
            </Badge>
          ) : null}
          <span className={styles.businessStatus}>
            <BusinessStatusBadge status={listing.businessStatus} />
          </span>
        </div>

        <div className={styles.content}>
          <div>
            <div className={styles.titleRow}>
              <p className={styles.price}>{formatVnd(listing.monthlyRent)}</p>
              <Icon name="arrowUpRight" className="h-5 w-5 shrink-0" />
            </div>
            <h2 className={styles.title} title={listing.title}>
              {listing.title}
            </h2>
            <p className={styles.location}>
              <Icon name="pin" className="h-4 w-4 shrink-0" />
              <span className={styles.locationText} title={listing.areaName}>
                {listing.areaName}
              </span>
            </p>
            <div className={styles.verifiedSlot}>
              {listing.landlordVerified ? (
                <Badge variant="verified" showIndicator context="Chủ nhà" className={styles.verified}>
                  <Icon name="shield" className="h-3.5 w-3.5" />
                  Đã xác minh
                </Badge>
              ) : null}
            </div>
          </div>

          <div className={styles.meta}>
            <span className={styles.fact}>
              <Icon name="ruler" className="h-4 w-4" />
              {formatAreaSqm(listing.roomAreaSqm)}
            </span>
            {listing.maxOccupants !== null ? (
              <span className={styles.fact}>
                <Icon name="users" className="h-4 w-4" />
                {listing.maxOccupants} người tối đa
              </span>
            ) : null}
            <span className={styles.freshness}>
              <ListingFreshnessLabel updatedAt={listing.updatedAt} />
            </span>
          </div>
        </div>
      </Link>

      <div className={styles.actions}>
        {onMapSelect ? (
          <button
            type="button"
            aria-label={"Xem " + listing.title + " trên bản đồ"}
            aria-pressed={mapSelected}
            onClick={onMapSelect}
            className={styles.mapButton}
          >
            <Icon name="map" className="h-4 w-4" />
          </button>
        ) : null}
        {showFavorite ? <ListingSaveControl listingId={String(listing.id)} compact /> : null}
        {showCompare ? <ComparisonToggle listingId={listing.id} compact /> : null}
      </div>
    </article>
  );
}
