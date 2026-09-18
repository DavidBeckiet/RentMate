import Link from "next/link";
import type { AdminListingSummary, ListingBusinessStatus } from "../../types/api";
import styles from "./admin-listings-page.module.css";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });
const businessStatusLabels: Record<ListingBusinessStatus, string> = {
  AVAILABLE: "Còn phòng",
  PAUSED: "Tạm dừng",
  RENTED: "Đã thuê",
  UNKNOWN: "Chưa xác định"
};

export function AdminListingCard({
  listing,
  detailHref
}: {
  readonly listing: AdminListingSummary;
  readonly detailHref: string;
}) {
  const hasReviewSignals = listing.openReportCount > 0 || listing.possibleDuplicate;

  return (
    <article
      className={`${styles.row} ${hasReviewSignals ? "" : styles.rowWithoutSignals}`}
      aria-labelledby={`admin-listing-${listing.id}`}
    >
      <div className={styles.listingCell}>
        <h2 id={`admin-listing-${listing.id}`} className={styles.listingTitle}>
          {listing.title ?? "Chưa có tiêu đề"}
        </h2>
        <div className={styles.listingMeta}>
          <span>#{listing.id}</span>
          <span aria-hidden="true">·</span>
          <span>{businessStatusLabels[listing.businessStatus]}</span>
        </div>
      </div>
      {hasReviewSignals ? (
        <div className={styles.signalsCell}>
          <div role="note" aria-label="Tín hiệu cần kiểm tra" className={styles.signalList}>
            {listing.openReportCount > 0 ? (
              <span className={styles.signal}>{listing.openReportCount} báo cáo đang mở</span>
            ) : null}
            {listing.possibleDuplicate ? <span className={styles.signal}>Có khả năng trùng tiêu đề</span> : null}
          </div>
        </div>
      ) : null}
      <div className={styles.areaCell}>
        <span className={styles.cellLabel}>Khu vực</span>
        <span>{listing.areaName ?? "Chưa có khu vực"}</span>
      </div>
      <div className={styles.ownerCell}>
        <span className={styles.cellLabel}>Người đăng</span>
        <span className={styles.ownerEmail}>{listing.landlord.email}</span>
        <span className={listing.landlord.isActive ? styles.secondaryLine : styles.inactiveOwner}>
          {listing.landlord.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}
        </span>
      </div>
      <div className={styles.updatedCell}>
        <span className={styles.cellLabel}>Cập nhật</span>
        <time dateTime={listing.updatedAt}>{dateFormatter.format(new Date(listing.updatedAt))}</time>
      </div>
      <Link href={detailHref} className={styles.detailLink}>
        Xem
      </Link>
    </article>
  );
}
