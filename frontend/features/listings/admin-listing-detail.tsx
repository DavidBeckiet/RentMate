"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapBase } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { AccountStatusBadge, BusinessStatusBadge, ListingStatusBadge } from "../../components/ui/status-badge";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminListingDetail as AdminListingDetailDto } from "../../types/api";
import { adminListingReturnUrl } from "./admin-listing-query";
import styles from "./admin-listing-detail.module.css";
import { formatAreaSqm, formatVnd } from "./format";
import { ModerationActions } from "./moderation-actions";
import { ModerationHistory, type HistoryRefreshInstruction } from "./moderation-history";
import { amenityLabel, propertyTypeLabel } from "./room-type-label";

type DetailState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "success"; readonly detail: AdminListingDetailDto }
  | { readonly status: "error"; readonly error: ApiError | null };

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

function parseListingId(rawListingId: string): number | null {
  if (!/^[1-9][0-9]*$/.test(rawListingId)) return null;
  const value = Number(rawListingId);
  return Number.isSafeInteger(value) ? value : null;
}

export function AdminListingDetail({ listingId: rawListingId }: { readonly listingId: string }) {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const searchParams = useSearchParams();
  const listingId = parseListingId(rawListingId);
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const [historyRefresh, setHistoryRefresh] = useState<HistoryRefreshInstruction>();
  const [mounted, setMounted] = useState(false);
  const detailRequest = useRef(0);
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const returnHref = adminListingReturnUrl(new URLSearchParams(searchParams.toString()));

  useEffect(() => setMounted(true), []);

  const loadDetail = useCallback(async (): Promise<boolean> => {
    if (!adminReady || listingId === null) return false;
    const currentRequest = ++detailRequest.current;
    setState((current) => (current.status === "success" ? current : { status: "loading" }));
    try {
      const detail = await api.admin.getListing(listingId);
      if (currentRequest !== detailRequest.current) return false;
      setState({ status: "success", detail });
      return true;
    } catch (error) {
      if (currentRequest !== detailRequest.current) return false;
      const apiError = error instanceof ApiError ? error : null;
      setState((current) => (current.status === "success" ? current : { status: "error", error: apiError }));
      if (apiError?.status === 401) void refresh();
      return false;
    }
  }, [adminReady, listingId, refresh]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const refreshHistory = useCallback(
    (resetToFirstPage: boolean): Promise<boolean> =>
      new Promise((resolve) =>
        setHistoryRefresh((current) => ({
          token: (current?.token ?? 0) + 1,
          ...(resetToFirstPage ? { page: 1 } : {}),
          resolve
        }))
      ),
    []
  );
  const reloadCanonical = useCallback(
    async (resetHistory: boolean): Promise<boolean> => {
      const [detailSucceeded, historySucceeded] = await Promise.all([loadDetail(), refreshHistory(resetHistory)]);
      return detailSucceeded && historySucceeded;
    },
    [loadDetail, refreshHistory]
  );

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous")
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên để tiếp tục."
        action={
          <Link href="/admin/login" className="font-semibold text-primary-hover underline">
            Đăng nhập quản trị
          </Link>
        }
      />
    );
  if (authStatus === "error")
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  if (adminReady && listingId !== null && !mounted) return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (!user || user.role !== "ADMIN") return <ErrorState message="Trang này dành cho quản trị viên." />;
  if (listingId === null) return <ErrorState message="Mã tin không hợp lệ." />;

  const detail = state.status === "success" ? state.detail : null;

  return (
    <section aria-labelledby="admin-listing-detail-heading" className={styles.page}>
      <header className={styles.header}>
        <Link href={returnHref} className={styles.backLink}>
          <Icon name="arrow" className={styles.backIcon} />
          Quay lại hàng đợi kiểm duyệt
        </Link>
        <div className={styles.headerMain}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>Chi tiết kiểm duyệt</p>
            <h1 id="admin-listing-detail-heading" className={styles.title}>
              {detail?.title ?? `Tin #${listingId}`}
            </h1>
            <div className={styles.headerMeta}>
              <span>Mã tin #{listingId}</span>
              {detail ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{detail.areaName ?? "Chưa có khu vực"}</span>
                  <span aria-hidden="true">·</span>
                  <span>Cập nhật {dateTimeFormatter.format(new Date(detail.updatedAt))}</span>
                  <span aria-hidden="true">·</span>
                  <span>{detail.landlord.isActive ? "Chủ trọ đang hoạt động" : "Chủ trọ ngừng hoạt động"}</span>
                </>
              ) : null}
            </div>
          </div>
          {detail ? (
            <div className={styles.headerStatuses} aria-label="Trạng thái hiện tại">
              <ListingStatusBadge status={detail.status} />
              <BusinessStatusBadge status={detail.businessStatus} />
            </div>
          ) : null}
        </div>
      </header>

      {state.status === "idle" || state.status === "loading" ? <LoadingState message="Đang tải chi tiết tin…" /> : null}
      {state.status === "error" ? (
        <ErrorState
          message={
            state.error?.status === 404
              ? "Không tìm thấy tin."
              : state.error?.status === 401
                ? "Phiên đăng nhập không còn hợp lệ."
                : "Không thể tải chi tiết tin."
          }
          requestId={state.error?.requestId}
          action={<Button onClick={() => void loadDetail()}>Thử lại chi tiết</Button>}
        />
      ) : null}
      {detail ? (
        <CanonicalDetail detail={detail} historyRefresh={historyRefresh} onReloadCanonical={reloadCanonical} />
      ) : null}
    </section>
  );
}

function CanonicalDetail({
  detail,
  historyRefresh,
  onReloadCanonical
}: {
  readonly detail: AdminListingDetailDto;
  readonly historyRefresh?: HistoryRefreshInstruction;
  readonly onReloadCanonical: (resetHistory: boolean) => Promise<boolean>;
}) {
  const orderedImages = [...detail.images].sort((left, right) => left.displayOrder - right.displayOrder);
  const reasonLabel = detail.status === "REJECTED" ? "Lý do từ chối" : detail.status === "HIDDEN" ? "Lý do ẩn" : null;

  const hasModerationContext = detail.openReportCount > 0 || detail.possibleDuplicate || detail.currentModerationReason;

  return (
    <>
      {hasModerationContext ? (
        <section aria-label="Ngữ cảnh kiểm duyệt" className={styles.contextBand}>
          {detail.openReportCount > 0 ? (
            <p className={styles.contextSignal}>{detail.openReportCount} báo cáo đang mở</p>
          ) : null}
          {detail.possibleDuplicate ? (
            <p className={styles.contextSignal}>Có khả năng trùng tiêu đề với tin khác của cùng chủ trọ</p>
          ) : null}
          {reasonLabel && detail.currentModerationReason ? (
            <p className={styles.contextReason}>
              <strong>{reasonLabel}:</strong> {detail.currentModerationReason}
            </p>
          ) : null}
        </section>
      ) : null}
      <div className={styles.workspace}>
        <div className={`${styles.evidenceColumn} ${styles.primaryEvidence}`}>
          <section aria-labelledby="listing-content-heading" className={styles.evidenceSection}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionKicker}>Nội dung do người đăng cung cấp</p>
              <h2 id="listing-content-heading" className={styles.sectionTitle}>
                Thông tin tin đăng
              </h2>
            </div>
            <dl className={styles.factGrid}>
              <div className={styles.primaryFact}>
                <dt>Giá thuê</dt>
                <dd>{detail.monthlyRent === null ? "Chưa có" : formatVnd(detail.monthlyRent)}</dd>
              </div>
              <div>
                <dt>Diện tích</dt>
                <dd>{detail.roomAreaSqm === null ? "Chưa có" : formatAreaSqm(detail.roomAreaSqm)}</dd>
              </div>
              <div>
                <dt>Sức chứa</dt>
                <dd>{detail.maxOccupants === null ? "Chưa xác định" : `${detail.maxOccupants} người tối đa`}</dd>
              </div>
              <div>
                <dt>Loại hình</dt>
                <dd>{detail.propertyType ? propertyTypeLabel(detail.propertyType) : "Chưa có"}</dd>
              </div>
              <div>
                <dt>Khu vực</dt>
                <dd>{detail.areaName ?? "Chưa có"}</dd>
              </div>
            </dl>
            <div className={styles.descriptionBlock}>
              <h3>Mô tả</h3>
              <p>{detail.description ?? "Chưa có mô tả"}</p>
            </div>
          </section>

          <section aria-labelledby="listing-photos-heading" className={styles.evidenceSection}>
            <h2 id="listing-photos-heading" className={styles.sectionTitle}>
              Ảnh tin đăng
            </h2>
            {orderedImages.length ? (
              <ModerationListingGallery images={orderedImages} listingId={detail.id} />
            ) : (
              <p className={styles.emptyEvidence}>Tin này chưa có ảnh.</p>
            )}
          </section>
        </div>

        <div className={`${styles.evidenceColumn} ${styles.supportingEvidence}`}>
          <section aria-labelledby="listing-amenities-heading" className={styles.evidenceSection}>
            <h2 id="listing-amenities-heading" className={styles.sectionTitle}>
              Tiện ích và thuộc tính
            </h2>
            {detail.amenities.length ? (
              <ul className={styles.amenityList}>
                {detail.amenities.map((amenity) => (
                  <li key={amenity.code}>{amenityLabel(amenity)}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyEvidence}>Chưa có tiện ích được khai báo.</p>
            )}
          </section>

          <section aria-labelledby="listing-location-heading" className={styles.evidenceSection}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionKicker}>Dữ liệu riêng dành cho kiểm duyệt</p>
              <h2 id="listing-location-heading" className={styles.sectionTitle}>
                Vị trí chính xác
              </h2>
            </div>
            <dl className={styles.locationFacts}>
              <div>
                <dt>Địa chỉ</dt>
                <dd>{detail.addressText ?? "Chưa có"}</dd>
              </div>
            </dl>
            {detail.latitude !== null && detail.longitude !== null ? (
              <MapBase
                ariaLabel="Bản đồ vị trí chính xác của tin"
                center={{ latitude: detail.latitude, longitude: detail.longitude }}
                zoom={16}
                className={styles.map}
                markers={[
                  {
                    id: detail.id,
                    label: detail.title ?? `Tin ${detail.id}`,
                    position: { latitude: detail.latitude, longitude: detail.longitude }
                  }
                ]}
              />
            ) : null}
            {detail.latitude !== null && detail.longitude !== null ? (
              <p className={styles.coordinates}>
                Tọa độ: {detail.latitude}, {detail.longitude}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="listing-owner-heading" className={styles.evidenceSection}>
            <div className={styles.sectionHeaderInline}>
              <h2 id="listing-owner-heading" className={styles.sectionTitle}>
                Người cho thuê
              </h2>
              <AccountStatusBadge isActive={detail.landlord.isActive} />
            </div>
            <dl className={styles.ownerFacts}>
              <div>
                <dt>Mã tài khoản</dt>
                <dd>#{detail.landlord.id}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{detail.landlord.email}</dd>
              </div>
              <div>
                <dt>Điện thoại</dt>
                <dd>{detail.landlord.phone || "Chưa có số điện thoại"}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className={styles.historyColumn} aria-label="Lịch sử kiểm duyệt">
          <ModerationHistory listingId={detail.id} refreshInstruction={historyRefresh} />
        </section>

        {detail.status === "REJECTED" || detail.status === "INACTIVE" ? (
          <aside className={`${styles.decisionColumn} ${styles.readOnlyColumn}`} aria-label="Kết quả kiểm duyệt">
            <div className={styles.readOnlyPanel}>
              <ModerationActions detail={detail} onReloadCanonical={onReloadCanonical} />
            </div>
          </aside>
        ) : (
          <aside className={styles.decisionColumn} aria-labelledby="decision-panel-heading">
            <div className={styles.decisionPanel}>
              <div className={styles.decisionHeader}>
                <p className={styles.sectionKicker}>Xử lý tin đăng</p>
                <h2 id="decision-panel-heading" className={styles.decisionTitle}>
                  Quyết định
                </h2>
              </div>
              {!detail.landlord.isActive ? (
                <div className={styles.moderationSignal} role="note">
                  <strong>Tài khoản người đăng đã ngừng hoạt động</strong>
                  <p>Tin được duyệt vẫn chưa thể xuất hiện công khai.</p>
                </div>
              ) : null}
              <ModerationActions detail={detail} onReloadCanonical={onReloadCanonical} />
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

function ModerationListingGallery({
  images,
  listingId
}: {
  readonly images: AdminListingDetailDto["images"];
  readonly listingId: number;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex] ?? images[0];
  if (!activeImage) return null;

  const showPrevious = () => setActiveIndex((current) => (current - 1 + images.length) % images.length);
  const showNext = () => setActiveIndex((current) => (current + 1) % images.length);

  return (
    <div className={styles.gallery}>
      <div className={styles.galleryFrame}>
        <Image
          key={activeImage.id}
          src={activeImage.url}
          alt={activeImage.altText ?? `Ảnh tin ${listingId}`}
          fill
          sizes="(min-width: 1280px) 46vw, (min-width: 768px) 64vw, 100vw"
          className="object-cover"
        />
        {images.length > 1 ? (
          <>
            <button
              type="button"
              className={`${styles.galleryControl} ${styles.galleryPrevious}`}
              aria-label="Xem ảnh trước"
              onClick={showPrevious}
            >
              <Icon name="chevronDown" className="h-4 w-4 rotate-90" />
            </button>
            <button
              type="button"
              className={`${styles.galleryControl} ${styles.galleryNext}`}
              aria-label="Xem ảnh tiếp theo"
              onClick={showNext}
            >
              <Icon name="chevronDown" className="h-4 w-4 -rotate-90" />
            </button>
          </>
        ) : null}
        <span className={styles.galleryCounter} aria-live="polite">
          {activeIndex + 1} / {images.length}
        </span>
      </div>

      {images.length >= 3 ? (
        <div className={styles.thumbnails} role="group" aria-label="Chọn ảnh tin đăng">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className={styles.thumbnail}
              aria-label={`Xem ảnh ${index + 1}`}
              aria-pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
            >
              <Image src={image.url} alt="" fill sizes="72px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
