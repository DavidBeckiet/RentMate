"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { BusinessStatusBadge, ListingStatusBadge } from "../../components/ui/status-badge";
import { api, ApiError } from "../../lib/api/client";
import type { ListingBusinessStatus, OwnerListingDetail, OwnerListingSummary } from "../../types/api";
import { formatVnd } from "./format";
import { ListingImage } from "./listing-presentation";
import { propertyTypeLabel } from "./room-type-label";
import styles from "./owner-listing-inspector.module.css";

const businessStatusOptions: readonly { readonly value: ListingBusinessStatus; readonly label: string }[] = [
  { value: "AVAILABLE", label: "Còn phòng" },
  { value: "PAUSED", label: "Tạm dừng" },
  { value: "RENTED", label: "Đã thuê" },
  { value: "UNKNOWN", label: "Chưa xác định" }
];

type InspectorDetailState =
  | { readonly status: "loading"; readonly detail: null; readonly error: null }
  | { readonly status: "success"; readonly detail: OwnerListingDetail; readonly error: null }
  | { readonly status: "error"; readonly detail: null; readonly error: string };

function detailError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    return "Tin đăng không còn tồn tại hoặc bạn không thể truy cập.";
  }
  return "Không thể tải chi tiết tin lúc này.";
}

function availabilityError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error instanceof ApiError && error.status === 409) return "Tin vừa thay đổi. Hãy tải lại rồi thử lại.";
  return "Chưa thể xác nhận tình trạng phòng lúc này.";
}

function dateLabel(value: string | null): string {
  if (!value) return "Chưa có mốc xác nhận";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function OwnerListingInspector({
  listing,
  onClose,
  onDuplicate,
  duplicatePending = false,
  onBusinessStatusChange,
  businessStatusPending = false,
  onDetailChange,
  onAuthRefresh
}: {
  readonly listing: OwnerListingSummary;
  readonly onClose: () => void;
  readonly onDuplicate?: () => void;
  readonly duplicatePending?: boolean;
  readonly onBusinessStatusChange?: (status: ListingBusinessStatus) => void;
  readonly businessStatusPending?: boolean;
  readonly onDetailChange?: (detail: OwnerListingDetail) => void;
  readonly onAuthRefresh?: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [detailState, setDetailState] = useState<InspectorDetailState>({
    status: "loading",
    detail: null,
    error: null
  });
  const [retryKey, setRetryKey] = useState(0);
  const [availabilityPending, setAvailabilityPending] = useState(false);
  const [availabilityFeedback, setAvailabilityFeedback] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestRef.current = controller;
    setDetailState({ status: "loading", detail: null, error: null });
    void api.listings
      .getOwned(listing.id, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setDetailState({ status: "success", detail, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetailState({ status: "error", detail: null, error: detailError(error) });
        if (error instanceof ApiError && error.status === 401) onAuthRefresh?.();
      });

    return () => {
      controller.abort();
      if (requestRef.current === controller) requestRef.current = null;
    };
  }, [listing.id, onAuthRefresh, retryKey]);

  useEffect(() => {
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const isMobile = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1023px)").matches;
    if (isMobile) document.body.style.overflow = "hidden";

    const focusableSelector =
      'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    requestAnimationFrame(() => closeRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [listing.id, onClose]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    []
  );

  const detail = detailState.status === "success" ? detailState.detail : null;
  const title = detail?.title ?? listing.title ?? "Tin đăng chưa có tiêu đề";
  const image = detail?.images[0] ?? listing.coverImage;
  const status = detail?.status ?? listing.status;
  const rejectionReason = detail?.currentModerationReason ?? listing.currentModerationReason;
  const availabilityStatus = detail?.availabilityStatus ?? listing.availabilityStatus;
  const needsAvailabilityConfirmation = availabilityStatus === "REMINDER_DUE" || availabilityStatus === "AUTO_PAUSED";
  const monthlyRent = detail?.monthlyRent ?? listing.monthlyRent;
  const roomAreaSqm = detail?.roomAreaSqm ?? null;
  const propertyType = detail?.propertyType ?? listing.propertyType;

  const confirmAvailability = async () => {
    if (!detail || availabilityPending) return;
    const controller = new AbortController();
    setAvailabilityPending(true);
    setAvailabilityFeedback(null);
    try {
      const updated = await api.listings.confirmAvailability(detail.id, controller.signal);
      if (controller.signal.aborted) return;
      setDetailState({ status: "success", detail: updated, error: null });
      onDetailChange?.(updated);
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setAvailabilityFeedback(availabilityError(error));
        if (error instanceof ApiError && error.status === 401) onAuthRefresh?.();
      }
    } finally {
      if (!controller.signal.aborted) setAvailabilityPending(false);
    }
  };

  return (
    <div className={styles.inspectorLayer} data-inspector-open>
      <button type="button" className={styles.inspectorBackdrop} aria-label="Đóng chi tiết chỗ ở" onClick={onClose} />
      <aside ref={panelRef} className={styles.inspector} aria-labelledby={titleId}>
        <header className={styles.inspectorHeader}>
          <div className={styles.inspectorHeading}>
            <span className={styles.inspectorIcon} aria-hidden="true">
              <Icon name="info" />
            </span>
            <h2 id={titleId}>Chi tiết chỗ ở</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.closeButton}
            aria-label="Đóng chi tiết chỗ ở"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.inspectorScroll}>
          <section className={styles.focusSection} aria-label={`Tóm tắt ${title}`}>
            <div className={styles.focusPhoto}>
              <ListingImage
                image={image}
                title={title}
                sizes="(min-width: 1024px) 25rem, 100vw"
                className={styles.focusImage}
              />
              <div className={styles.focusPhotoShade} aria-hidden="true" />
              <span className={styles.focusRoomStatus}>
                <BusinessStatusBadge status={listing.businessStatus} />
              </span>
              <div className={styles.focusPhotoMeta}>
                <span>
                  Tin #{listing.id} · {title}
                </span>
              </div>
            </div>
            <div className={styles.statusRow}>
              <ListingStatusBadge status={status} />
            </div>
          </section>

          <dl className={styles.factList}>
            <div>
              <dt>Giá niêm yết</dt>
              <dd data-emphasis="true">{monthlyRent === null ? "Chưa nhập giá" : formatVnd(monthlyRent)}</dd>
            </div>
            <div>
              <dt>Diện tích</dt>
              <dd>{roomAreaSqm === null ? "Chưa nhập diện tích" : `${roomAreaSqm} m²`}</dd>
            </div>
            <div>
              <dt>Địa chỉ</dt>
              <dd>{detail?.addressText ?? detail?.areaName ?? listing.areaName ?? "Chưa nhập khu vực"}</dd>
            </div>
            <div>
              <dt>Loại phòng</dt>
              <dd>{propertyType ? propertyTypeLabel(propertyType) : "Chưa chọn loại phòng"}</dd>
            </div>
          </dl>

          <section className={styles.operationSection} aria-labelledby={`${titleId}-operation`}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>VẬN HÀNH</span>
                <h3 id={`${titleId}-operation`}>Tình trạng phòng</h3>
              </div>
              <span className={styles.sectionHint}>Độc lập với duyệt tin</span>
            </div>
            {onBusinessStatusChange ? (
              <label className={styles.statusControl} htmlFor={`${titleId}-business-status`}>
                <span>Cho người thuê biết tin còn nhận phòng không</span>
                <select
                  id={`${titleId}-business-status`}
                  aria-label={`Tình trạng phòng cho ${title}`}
                  value={listing.businessStatus}
                  disabled={businessStatusPending}
                  aria-busy={businessStatusPending || undefined}
                  onChange={(event) => onBusinessStatusChange(event.target.value as ListingBusinessStatus)}
                >
                  {businessStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Badge
                variant={listing.businessStatus === "AVAILABLE" ? "success" : "neutral"}
                context="Tình trạng phòng"
              >
                {businessStatusOptions.find((option) => option.value === listing.businessStatus)?.label ??
                  "Chưa xác định"}
              </Badge>
            )}
          </section>

          {availabilityStatus !== "NOT_APPLICABLE" ? (
            <section className={styles.availabilitySection} aria-labelledby={`${titleId}-availability`}>
              <div className={styles.availabilityCopy}>
                <span className={styles.availabilityIcon} aria-hidden="true">
                  <Icon name={needsAvailabilityConfirmation ? "refresh" : "check"} />
                </span>
                <div>
                  <h3 id={`${titleId}-availability`}>
                    {availabilityStatus === "AUTO_PAUSED" ? "Tin đang tạm dừng" : "Theo dõi tình trạng phòng"}
                  </h3>
                  <p>
                    {availabilityStatus === "AUTO_PAUSED"
                      ? "Xác nhận còn phòng để mở lại trạng thái hiển thị."
                      : needsAvailabilityConfirmation
                        ? "Tin cần được xác nhận để giữ thông tin chính xác."
                        : `Xác nhận gần nhất: ${dateLabel(detail?.availabilityConfirmedAt ?? listing.availabilityConfirmedAt)}.`}
                  </p>
                </div>
              </div>
              {needsAvailabilityConfirmation && detail ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  pending={availabilityPending}
                  pendingLabel="Đang xác nhận…"
                  onClick={() => void confirmAvailability()}
                >
                  Xác nhận còn phòng
                </Button>
              ) : null}
              {availabilityFeedback ? (
                <p role="alert" className={styles.inlineFeedback}>
                  {availabilityFeedback}
                </p>
              ) : null}
            </section>
          ) : null}

          {status === "REJECTED" && rejectionReason ? (
            <section className={styles.reasonSection} aria-labelledby={`${titleId}-reason`}>
              <span className={styles.reasonIcon} aria-hidden="true">
                <Icon name="note" />
              </span>
              <div>
                <h3 id={`${titleId}-reason`}>Cần chỉnh sửa</h3>
                <p>{rejectionReason}</p>
              </div>
            </section>
          ) : null}

          {status === "PENDING" ? (
            <p className={styles.reviewNote} role="status">
              <Icon name="shield" aria-hidden="true" />
              Đang được RentMate xem xét. Bạn không cần gửi lại tin.
            </p>
          ) : null}

          {detailState.status === "loading" ? (
            <p className={styles.loadingNote} role="status">
              Đang tải thông tin chi tiết…
            </p>
          ) : null}
          {detailState.status === "error" ? (
            <div className={styles.errorNote} role="alert">
              <p>{detailState.error}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRetryKey((value) => value + 1)}>
                Thử lại
              </Button>
            </div>
          ) : null}
          <footer className={styles.inspectorFooter}>
            {onDuplicate ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                pending={duplicatePending}
                pendingLabel="Đang nhân bản…"
                onClick={onDuplicate}
              >
                <Icon name="clipboard" aria-hidden="true" />
                Nhân bản
              </Button>
            ) : null}
            <Link href={`/landlord/listings/${listing.id}`} className={styles.editAction} onClick={onClose}>
              Chỉnh sửa tin
              <Icon name="arrow" aria-hidden="true" />
            </Link>
          </footer>
        </div>
      </aside>
    </div>
  );
}
