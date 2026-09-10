import Link from "next/link";
import { Icon } from "../../components/ui/icon";
import { formatAreaLabel } from "../../lib/area";
import type { PublicListingSummary } from "../../types/api";
import { formatAreaSqm } from "./format";
import { formatNearMeDistance, formatNearMePopupRent } from "./near-me-format";
import styles from "./near-me-page.module.css";

export function NearMeMapListingPopup({ listing }: Readonly<{ listing: PublicListingSummary }>) {
  const distance =
    typeof listing.distanceKm === "number" ? formatNearMeDistance(listing.distanceKm) : "Khoảng cách chưa có";
  const area =
    Number.isFinite(listing.roomAreaSqm) && listing.roomAreaSqm > 0 ? formatAreaSqm(listing.roomAreaSqm) : null;

  return (
    <div className={styles.mapPopup} data-testid={`near-me-popup-${listing.id}`}>
      <h3 className={styles.mapPopupTitle} title={listing.title}>
        {listing.title}
      </h3>
      <p className={styles.mapPopupPrice}>{formatNearMePopupRent(listing.monthlyRent)}</p>
      <div className={styles.mapPopupDetails}>
        <span className={styles.mapPopupLocation} title={formatAreaLabel(listing.areaName)}>
          <Icon name="pin" className="h-3.5 w-3.5 shrink-0" />
          <span>{formatAreaLabel(listing.areaName)}</span>
        </span>
        <span className={styles.mapPopupMeta}>
          <Icon name="target" className="h-3.5 w-3.5 shrink-0" />
          <span>Cách {distance}</span>
          {area ? (
            <>
              <span className={styles.mapPopupSeparator} aria-hidden="true">
                •
              </span>
              <span>{area}</span>
            </>
          ) : null}
        </span>
      </div>
      <Link
        href={`/listings/${listing.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.mapPopupAction}
      >
        Xem chi tiết
        <Icon name="arrow" className="h-4 w-4" />
      </Link>
    </div>
  );
}
