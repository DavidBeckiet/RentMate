"use client";

import Link from "next/link";
import { Icon } from "../../components/ui/icon";
import { BusinessStatusBadge, ListingStatusBadge } from "../../components/ui/status-badge";
import type { OwnerListingSummary } from "../../types/api";
import { formatVnd } from "./format";
import { ListingImage } from "./listing-presentation";
import styles from "./owner-listing-card.module.css";

function detailActionLabel(status: OwnerListingSummary["status"]): string {
  if (status === "DRAFT") return "Tiếp tục tin đăng";
  if (status === "REJECTED") return "Sửa tin";
  if (status === "PENDING") return "Xem trạng thái";
  return "Chi tiết";
}

export function OwnerListingCard({
  listing,
  onInspect,
  selected = false
}: {
  readonly listing: OwnerListingSummary;
  readonly onInspect?: () => void;
  readonly selected?: boolean;
}) {
  const title = listing.title ?? "Tin đăng chưa có tiêu đề";
  const detailHref = "/landlord/listings/" + listing.id;

  return (
    <article
      className={`${styles.card} ${selected ? styles.selected : ""}`}
      data-selected={selected || undefined}
      data-inspectable={onInspect ? "true" : undefined}
      onClick={(event) => {
        if (!onInspect) return;
        const target = event.target as HTMLElement;
        if (target.closest("a, button, select, summary, input, textarea")) return;
        onInspect();
      }}
    >
      <div className={styles.photoStage}>
        {onInspect ? (
          <button
            type="button"
            className={styles.photoLink}
            aria-label={`Xem chi tiết chỗ ở: ${title}`}
            onClick={(event) => {
              event.stopPropagation();
              onInspect();
            }}
          >
            <ListingImage
              image={listing.coverImage}
              title={title}
              sizes="(min-width: 1280px) 390px, (min-width: 1024px) 30vw, (min-width: 720px) 46vw, 100vw"
              className={styles.photo}
            />
          </button>
        ) : (
          <Link href={detailHref} className={styles.photoLink} aria-label={"Mở tin đăng: " + title}>
            <ListingImage
              image={listing.coverImage}
              title={title}
              sizes="(min-width: 1280px) 390px, (min-width: 1024px) 30vw, (min-width: 720px) 46vw, 100vw"
              className={styles.photo}
            />
          </Link>
        )}
        <span className={styles.moderationBadge}>
          <ListingStatusBadge status={listing.status} />
        </span>
        <div className={styles.photoMeta}>
          <span className={styles.listingId}>Tin #{listing.id}</span>
          <span className={styles.rentOnPhoto}>
            {listing.monthlyRent === null ? "Chưa nhập giá" : formatVnd(listing.monthlyRent)}
          </span>
        </div>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.identity}>
          <Link href={detailHref} className={styles.titleLink}>
            <h2>{title}</h2>
          </Link>
          <p className={styles.location}>
            <Icon name="pin" aria-hidden="true" />
            {listing.areaName ?? "Chưa nhập khu vực"}
          </p>
        </div>
        {listing.status === "REJECTED" && listing.currentModerationReason ? (
          <p className={styles.rejectionReason}>
            <strong>Cần chỉnh sửa</strong>
            <span>{listing.currentModerationReason}</span>
          </p>
        ) : null}
        {listing.availabilityStatus === "REMINDER_DUE" || listing.availabilityStatus === "AUTO_PAUSED" ? (
          <p
            className={styles.photoNotice}
            data-tone={listing.availabilityStatus === "AUTO_PAUSED" ? "danger" : "warning"}
          >
            <Icon name="refresh" aria-hidden="true" />
            {listing.availabilityStatus === "AUTO_PAUSED"
              ? "Đã tạm dừng tự động · Mở tin để xác nhận tình trạng phòng."
              : "Cần xác nhận tình trạng phòng."}
          </p>
        ) : null}
      </div>
      <footer className={styles.cardFooter}>
        <div className={styles.roomState}>
          <BusinessStatusBadge status={listing.businessStatus} />
        </div>
        <Link href={detailHref} className={styles.inspectAction}>
          {onInspect ? "Chỉnh sửa" : detailActionLabel(listing.status)}
          <Icon name="arrow" aria-hidden="true" />
        </Link>
      </footer>
    </article>
  );
}
