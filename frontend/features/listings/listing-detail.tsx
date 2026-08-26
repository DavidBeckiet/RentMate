"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MapBase } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { BusinessStatusBadge } from "../../components/ui/status-badge";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { PublicListingDetail } from "../../types/api";
import { InquiryForm } from "../contact/inquiry-form";
import { ComparisonToggle } from "../comparison/comparison-toggle";
import { ListingNoteEditor } from "../comparison/listing-note-editor";
import { ShareListingControl } from "../comparison/share-listing-control";
import { ListingReviews } from "../reviews/listing-reviews";
import { ReportListingControl } from "../reports/report-listing-control";
import { formatAreaSqm } from "./format";
import { ListingAmenityChips, ListingPrice } from "./listing-presentation";
import { rememberRecentListing } from "./recently-viewed-storage";
import { SimilarListings } from "./similar-listings";
import styles from "./listing-detail.module.css";

const maximumListingId = 2_147_483_647;

export interface ListingDetailProps {
  readonly listingId: string;
  readonly actions?: ReactNode;
}

type ListingImage = PublicListingDetail["images"][number];

function parseListingId(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximumListingId ? parsed : null;
}

function ListingDetailSkeleton() {
  return (
    <div className={styles.loadingShell} role="status">
      <span className="sr-only">Đang tải tin đăng…</span>
      <div className={styles.loadingSummary} aria-hidden="true">
        <span className={styles.loadingLineShort} />
        <span className={styles.loadingLineLong} />
        <span className={styles.loadingLineMedium} />
      </div>
      <div className={styles.loadingGrid} aria-hidden="true">
        <span className={styles.loadingImage} />
        <span className={styles.loadingCard} />
      </div>
    </div>
  );
}

function ListingGallery({
  title,
  images,
  selectedImageOrder,
  onSelect
}: {
  readonly title: string;
  readonly images: readonly ListingImage[];
  readonly selectedImageOrder: number | null;
  readonly onSelect: (displayOrder: number) => void;
}) {
  const orderedImages = useMemo(
    () => [...images].sort((left, right) => left.displayOrder - right.displayOrder),
    [images]
  );
  const selectedIndex = Math.max(
    0,
    orderedImages.findIndex((image) => image.displayOrder === selectedImageOrder)
  );
  const currentImage = orderedImages[selectedIndex] ?? orderedImages[0];
  const thumbnailImages = orderedImages.slice(0, 5);

  function moveImage(direction: -1 | 1) {
    if (orderedImages.length < 2) return;
    const nextIndex = (selectedIndex + direction + orderedImages.length) % orderedImages.length;
    const nextImage = orderedImages[nextIndex];
    if (nextImage) onSelect(nextImage.displayOrder);
  }

  function handleGalleryKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveImage(1);
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveImage(-1);
    }
  }

  if (!currentImage) {
    return (
      <section className={styles.gallery} aria-label="Hình ảnh tin đăng">
        <div className={styles.emptyGallery}>
          <Icon name="home" className="h-10 w-10" />
          <span>Tin đăng chưa có hình ảnh</span>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.gallery} aria-label="Hình ảnh tin đăng">
      <div
        className={styles.galleryMain}
        role="group"
        tabIndex={0}
        aria-label={`Ảnh ${selectedIndex + 1} trên ${orderedImages.length}. Dùng phím mũi tên để xem ảnh khác.`}
        onKeyDown={handleGalleryKeyDown}
      >
        <Image
          key={currentImage.url}
          src={currentImage.url}
          alt={currentImage.altText ?? `Ảnh chính của ${title}`}
          fill
          priority
          sizes="(min-width: 1024px) 58vw, 100vw"
          className={styles.galleryImage}
        />
        {orderedImages.length > 1 ? (
          <>
            <button
              type="button"
              className={`${styles.galleryNav} ${styles.galleryNavPrevious}`}
              aria-label="Ảnh trước"
              onClick={() => moveImage(-1)}
            >
              <Icon name="arrow" className="h-5 w-5 rotate-180" />
            </button>
            <button
              type="button"
              className={`${styles.galleryNav} ${styles.galleryNavNext}`}
              aria-label="Ảnh tiếp theo"
              onClick={() => moveImage(1)}
            >
              <Icon name="arrow" className="h-5 w-5" />
            </button>
            <span className={styles.galleryCounter} aria-live="polite">
              {selectedIndex + 1} / {orderedImages.length}
            </span>
          </>
        ) : null}
      </div>

      {thumbnailImages.length > 0 ? (
        <div className={styles.thumbnails} aria-label="Chọn ảnh xem trước">
          {thumbnailImages.map((image, index) => (
            <button
              type="button"
              key={`${image.url}-${image.displayOrder}`}
              className={`${styles.thumbnail} ${image.displayOrder === currentImage.displayOrder ? styles.thumbnailActive : ""}`}
              aria-label={`Xem ảnh ${index + 1} của ${title}`}
              aria-pressed={image.displayOrder === currentImage.displayOrder}
              onClick={() => onSelect(image.displayOrder)}
            >
              <Image
                src={image.url}
                alt={image.altText ?? `Ảnh ${index + 1} của ${title}`}
                fill
                sizes="(min-width: 1024px) 11vw, 25vw"
                className={styles.thumbnailImage}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ListingDetail({ listingId, actions }: ListingDetailProps) {
  const parsedId = useMemo(() => parseListingId(listingId), [listingId]);
  const [detail, setDetail] = useState<PublicListingDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "not-found" | "error">(
    parsedId === null ? "not-found" : "loading"
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedImageOrder, setSelectedImageOrder] = useState<number | null>(null);
  const requestIdentity = useRef(0);
  const { status: authStatus } = useAuth();

  useEffect(() => {
    if (parsedId === null) {
      setDetail(null);
      setError(null);
      setStatus("not-found");
      return;
    }

    const controller = new AbortController();
    const identity = ++requestIdentity.current;
    let active = true;
    setDetail(null);
    setError(null);
    setStatus("loading");

    void api.listings
      .getPublicDetail(parsedId, controller.signal)
      .then((result) => {
        if (!active || controller.signal.aborted || identity !== requestIdentity.current) return;
        setDetail(result);
        rememberRecentListing(result.id);
        setStatus("success");
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted || identity !== requestIdentity.current) return;
        const apiError = caught instanceof ApiError ? caught : null;
        if (apiError?.status === 404 || apiError?.status === 422) {
          setStatus("not-found");
          return;
        }
        setError(apiError);
        setStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [parsedId, retryKey]);

  useEffect(() => {
    setSelectedImageOrder(null);
  }, [detail?.id]);

  useEffect(() => {
    if (!detail) return;
    void api.analytics?.trackListingEvent?.(detail.id, "VIEW").catch(() => undefined);
  }, [detail]);

  if (parsedId !== null && status === "loading") return <ListingDetailSkeleton />;

  if (parsedId === null || status === "not-found") {
    return (
      <ErrorState
        message="Tin đăng không tồn tại hoặc hiện không khả dụng."
        action={
          <Link
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-glow-teal"
            href="/"
          >
            Quay lại trang chủ
          </Link>
        }
      />
    );
  }

  if (status === "error") {
    return (
      <ErrorState
        message="Không thể tải tin đăng lúc này. Vui lòng thử lại."
        requestId={error?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  }

  if (!detail) return null;

  return (
    <article className={styles.detail}>
      <nav className={styles.breadcrumbs} aria-label="Điều hướng tin đăng">
        <Link href="/search" className={styles.backLink}>
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          <span>Tìm phòng</span>
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Chi tiết tin đăng</span>
      </nav>

      <div className={styles.detailGrid}>
        <div className={styles.contentColumn}>
          <ListingGallery
            title={detail.title}
            images={detail.images}
            selectedImageOrder={selectedImageOrder}
            onSelect={setSelectedImageOrder}
          />

          <section className={styles.summaryCard} aria-labelledby="listing-title">
            <div className={styles.summaryEyebrow}>
              <span className={styles.statusBadge}>Đang hiển thị công khai</span>
              <span className={styles.typeBadge}>{detail.propertyType.label}</span>
              <BusinessStatusBadge status={detail.businessStatus} />
            </div>
            <h1 id="listing-title" className={styles.summaryTitle}>
              {detail.title}
            </h1>
            <p className={styles.summaryMeta}>
              <Icon name="pin" className="h-5 w-5 shrink-0" />
              <span>{detail.areaName}</span>
            </p>
            <div className={styles.factCard} aria-label="Thông tin chính">
              <div className={styles.fact}>
                <Icon name="note" className="h-5 w-5" />
                <div>
                  <span>Giá thuê</span>
                  <div className={styles.factPrice}>
                    <ListingPrice monthlyRent={detail.monthlyRent} />
                  </div>
                </div>
              </div>
              <div className={styles.fact}>
                <Icon name="ruler" className="h-5 w-5" />
                <div>
                  <span>Diện tích</span>
                  <strong>{formatAreaSqm(detail.roomAreaSqm)}</strong>
                </div>
              </div>
              <div className={styles.fact}>
                <Icon name="home" className="h-5 w-5" />
                <div>
                  <span>Loại hình</span>
                  <strong>{detail.propertyType.label}</strong>
                </div>
              </div>
              {detail.maxOccupants !== null ? (
                <div className={styles.fact}>
                  <Icon name="users" className="h-5 w-5" />
                  <div>
                    <span>Sức chứa</span>
                    <strong>{detail.maxOccupants} người tối đa</strong>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <div className={styles.mobileContactBar}>
            <a href="#contact-panel">
              <Icon name="phone" className="h-4 w-4" />
              <span>Liên hệ chủ trọ</span>
            </a>
            <ListingPrice monthlyRent={detail.monthlyRent} />
          </div>

          <section aria-labelledby="description-heading" className={styles.section}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionKicker}>KHÔNG GIAN</span>
              <h2 id="description-heading">Mô tả chi tiết</h2>
            </div>
            <p className={styles.description}>{detail.description}</p>
          </section>

          <section aria-labelledby="amenities-heading" className={styles.section}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionKicker}>TIỆN NGHI</span>
              <h2 id="amenities-heading">Tiện ích đi kèm</h2>
            </div>
            {detail.amenities.length > 0 ? (
              <div className={styles.amenities}>
                <ListingAmenityChips amenities={detail.amenities} />
              </div>
            ) : (
              <p className={styles.mutedText}>Tin đăng chưa liệt kê tiện ích.</p>
            )}
          </section>

          <section aria-labelledby="detail-map-heading" className={styles.mapSection}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionKicker}>KHU VỰC</span>
              <h2 id="detail-map-heading">Vị trí xấp xỉ</h2>
              <p>
                Để bảo vệ quyền riêng tư, vị trí trên bản đồ được làm tròn xấp xỉ; thông tin địa chỉ riêng tư không hiển
                thị.
              </p>
            </div>
            <div className={styles.mapFrame}>
              <MapBase
                ariaLabel="Bản đồ vị trí xấp xỉ của tin đăng"
                center={{ latitude: detail.latitude, longitude: detail.longitude }}
                zoom={14}
                markers={[
                  {
                    id: detail.id,
                    label: `${detail.title} — vị trí xấp xỉ`,
                    position: { latitude: detail.latitude, longitude: detail.longitude }
                  }
                ]}
              />
            </div>
          </section>
        </div>

        <aside id="contact-panel" className={styles.contactSidebar} data-testid="sticky-contact" data-sticky-contact>
          <section className={styles.priceCard} aria-label="Giá thuê và thao tác">
            <div className={styles.cardKicker}>MỨC GIÁ THUÊ</div>
            <ListingPrice monthlyRent={detail.monthlyRent} emphasis="prominent" />
            <p className={styles.priceNote}>Giá tham khảo theo tháng · chưa bao gồm chi phí phát sinh</p>
            {actions ? <div className={styles.primaryAction}>{actions}</div> : null}
            <div className={styles.secondaryActions}>
              <ComparisonToggle listingId={detail.id} />
              <ShareListingControl listingId={detail.id} title={detail.title} />
            </div>
          </section>

          <section className={styles.contactCard} aria-labelledby="contact-heading">
            <div className={styles.cardKicker}>KẾT NỐI</div>
            <h2 id="contact-heading">Liên hệ chủ trọ</h2>
            {detail.landlordVerified ? (
              <p className={styles.trustBadge}>
                <Icon name="check" className="h-4 w-4" /> Hồ sơ chủ trọ đã được RentMate duyệt
              </p>
            ) : null}
            {detail.landlordContact ? (
              <dl className={styles.contactList}>
                <div>
                  <dt>Email liên hệ</dt>
                  <dd>
                    <a
                      href={`mailto:${detail.landlordContact.email}`}
                      onClick={() =>
                        void api.analytics?.trackListingEvent?.(detail.id, "EMAIL_CLICK").catch(() => undefined)
                      }
                    >
                      {detail.landlordContact.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Số điện thoại</dt>
                  <dd>
                    <a
                      href={`tel:${detail.landlordContact.phone}`}
                      onClick={() =>
                        void api.analytics?.trackListingEvent?.(detail.id, "CALL_CLICK").catch(() => undefined)
                      }
                    >
                      {detail.landlordContact.phone}
                    </a>
                  </dd>
                </div>
              </dl>
            ) : authStatus === "anonymous" ? (
              <p className={styles.loginHint}>
                <Link href="/login">Đăng nhập bằng tài khoản người thuê</Link> để kiểm tra quyền xem thông tin liên hệ.
              </p>
            ) : (
              <p className={styles.mutedText}>Thông tin liên hệ không có trong phản hồi hiện tại.</p>
            )}
            <div className={styles.inquiryBlock}>
              <InquiryForm listingId={detail.id} />
            </div>
          </section>

          <section className={styles.safetyCard} aria-labelledby="safety-heading">
            <h2 id="safety-heading">
              <Icon name="shield" className="h-5 w-5" />
              Lưu ý an toàn
            </h2>
            <ul className={styles.safetyList}>
              <li>
                <Icon name="check" className="h-4 w-4" />
                <span>Không thanh toán trước khi xem phòng thực tế.</span>
              </li>
              <li>
                <Icon name="check" className="h-4 w-4" />
                <span>Gặp mặt trực tiếp với chủ trọ tại phòng.</span>
              </li>
              <li>
                <Icon name="check" className="h-4 w-4" />
                <span>Kiểm tra hợp đồng thuê nhà rõ ràng.</span>
              </li>
            </ul>
            <div className={styles.reportBlock}>
              <ReportListingControl listingId={detail.id} />
            </div>
          </section>

          <section className={styles.noteCard} aria-label="Ghi chú riêng">
            <div className={styles.cardKicker}>GHI CHÚ CỦA BẠN</div>
            <ListingNoteEditor listingId={detail.id} />
          </section>
        </aside>
      </div>

      <section
        className={styles.lowerSections}
        data-testid="reviews-section"
        data-reviews-section
        aria-label="Đánh giá tin đăng"
      >
        <ListingReviews listingId={detail.id} />
      </section>
      <SimilarListings listingId={detail.id} />
    </article>
  );
}
