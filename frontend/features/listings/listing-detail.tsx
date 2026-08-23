"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MapBase } from "../../components/map/map-base";
import { InquiryForm } from "../contact/inquiry-form";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { PublicListingDetail } from "../../types/api";
import { formatAreaSqm } from "./format";
import { ListingAmenityChips, ListingPrice } from "./listing-presentation";
import styles from "./listing-detail.module.css";
import { ReportListingControl } from "../reports/report-listing-control";
import { ListingReviews } from "../reviews/listing-reviews";
import { ComparisonToggle } from "../comparison/comparison-toggle";
import { ListingNoteEditor } from "../comparison/listing-note-editor";
import { ShareListingControl } from "../comparison/share-listing-control";

const maximumListingId = 2_147_483_647;

export interface ListingDetailProps {
  readonly listingId: string;
  readonly actions?: ReactNode;
}

function parseListingId(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximumListingId ? parsed : null;
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

  if (parsedId !== null && status === "loading") return <LoadingState message="Đang tải tin đăng…" />;

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
  const orderedImages = [...detail.images].sort((left, right) => left.displayOrder - right.displayOrder);
  const primaryImage = orderedImages.find((image) => image.displayOrder === selectedImageOrder) ?? orderedImages[0];
  const thumbnailImages = primaryImage
    ? orderedImages.filter((image) => image.displayOrder !== primaryImage.displayOrder).slice(0, 4)
    : [];

  return (
    <article className={`${styles.detail} space-y-10`}>
      <header className="space-y-5 border-2 border-heroDark-950 bg-rent-coral p-6 shadow-glass sm:p-8">
        <Link
          href="/search"
          className="inline-flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wider text-rent-ink transition-transform hover:-translate-x-1"
        >
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          <span>Quay lại tìm phòng</span>
        </Link>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rm-eyebrow">TIN CÔNG KHAI</span>
            <span className="border-2 border-heroDark-950 bg-rent-surface px-3 py-1 font-display text-xs font-bold text-rent-ink shadow-glass-sm">
              {detail.propertyType.label}
            </span>
          </div>
          <h1 className="font-display text-4xl font-bold leading-[0.95] tracking-[-0.055em] text-rent-ink sm:text-6xl">
            {detail.title}
          </h1>
          <p className="flex items-center gap-2 text-base font-bold text-rent-ink">
            <Icon name="pin" className="h-5 w-5 shrink-0" />
            <span>{detail.areaName}</span>
            <span>·</span>
            <span>{formatAreaSqm(detail.roomAreaSqm)}</span>
          </p>
        </div>
      </header>

      {/* Gallery Bento Grid */}
      {primaryImage ? (
        <section
          aria-label="Hình ảnh tin đăng"
          className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(14rem,0.8fr)]"
        >
          <div className="relative aspect-[16/10] overflow-hidden border-2 border-heroDark-950 bg-[#e5eefc] shadow-glass lg:aspect-auto lg:min-h-[30rem]">
            <Image
              key={primaryImage.url}
              src={primaryImage.url}
              alt={primaryImage.altText ?? `Ảnh chính của ${detail.title}`}
              fill
              priority
              sizes="(min-width: 1152px) 1088px, 100vw"
              className="rm-gallery-main object-cover"
            />
          </div>
          {thumbnailImages.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:grid-rows-2">
              {thumbnailImages.map((image, index) => (
                <button
                  type="button"
                  key={`${image.url}-${image.displayOrder}`}
                  className="rm-gallery-thumb overflow-hidden border-2 border-heroDark-950 bg-rent-surface shadow-glass-sm"
                  data-selected={image.displayOrder === primaryImage.displayOrder}
                  aria-label={`Xem ảnh ${image.displayOrder + 1} của ${detail.title}`}
                  onClick={() => setSelectedImageOrder(image.displayOrder)}
                >
                  <Image
                    src={image.url}
                    alt={image.altText ?? `Ảnh của ${detail.title}`}
                    fill
                    sizes="(min-width: 1024px) 22vw, (min-width: 640px) 50vw, 50vw"
                    className="object-cover transition-transform duration-300 hover:scale-105"
                  />
                  {index === thumbnailImages.length - 1 && orderedImages.length > thumbnailImages.length + 1 ? (
                    <span className="absolute inset-0 grid place-items-center bg-heroDark-950/85 font-display text-sm font-bold text-white">
                      +{orderedImages.length - thumbnailImages.length - 1} ảnh nữa
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <section
          aria-label="Hình ảnh tin đăng"
          className="flex aspect-[16/10] flex-col items-center justify-center gap-3 border-2 border-heroDark-950 bg-[#e5eefc] px-6 text-center text-sm font-bold text-rent-secondary shadow-glass"
        >
          <Icon name="home" className="h-12 w-12 text-brandBlue-600" />
          <span>Tin đăng chưa có hình ảnh</span>
        </section>
      )}

      {/* Main Details and Sidebar */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-10">
          {/* Key Specs Card */}
          <div className="grid grid-cols-1 divide-y-2 divide-heroDark-950 border-2 border-heroDark-950 bg-rent-surface shadow-glass sm:grid-cols-3 sm:divide-x-2 sm:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Loại hình</p>
              <p className="mt-1 text-base font-extrabold text-slate-900">{detail.propertyType.label}</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Diện tích</p>
              <p className="mt-1 text-base font-extrabold text-slate-900">{formatAreaSqm(detail.roomAreaSqm)}</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Khu vực</p>
              <p className="mt-1 text-base font-extrabold text-slate-900">{detail.areaName}</p>
            </div>
          </div>

          <section aria-labelledby="description-heading" className="space-y-4 border-t-2 border-heroDark-950 pt-8">
            <h2 id="description-heading" className="font-display text-3xl font-bold tracking-tight text-rent-ink">
              Mô tả chi tiết
            </h2>
            <p className="max-w-3xl whitespace-pre-wrap text-base leading-relaxed text-slate-700 font-medium">
              {detail.description}
            </p>
          </section>

          <section aria-labelledby="amenities-heading" className="space-y-4 border-t-2 border-heroDark-950 pt-8">
            <h2 id="amenities-heading" className="font-display text-3xl font-bold tracking-tight text-rent-ink">
              Tiện ích đi kèm
            </h2>
            {detail.amenities.length > 0 ? (
              <div>
                <ListingAmenityChips amenities={detail.amenities} />
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-500">Tin đăng chưa liệt kê tiện ích.</p>
            )}
          </section>

          <section
            aria-labelledby="detail-map-heading"
            className="space-y-4 border-2 border-heroDark-950 bg-rent-surface p-6 shadow-glass"
          >
            <div>
              <h2 id="detail-map-heading" className="font-display text-2xl font-bold text-rent-ink">
                Vị trí xấp xỉ
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Để bảo vệ quyền riêng tư của chủ nhà, tọa độ trên bản đồ được làm tròn xấp xỉ.
              </p>
            </div>
            <div className="min-h-[18rem] overflow-hidden border-2 border-heroDark-950">
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
          <ListingReviews listingId={detail.id} />
        </div>

        {/* Sticky Contact Sidebar Card */}
        <aside className="h-fit space-y-6 lg:sticky lg:top-24">
          <section className="space-y-4 border-2 border-heroDark-950 bg-rent-accent p-6 shadow-glass">
            <span className="rm-eyebrow">MỨC GIÁ THUÊ</span>
            <div>
              <ListingPrice monthlyRent={detail.monthlyRent} emphasis="prominent" />
            </div>
            <div className="space-y-4 border-t-2 border-heroDark-950 pt-4">
              {actions}
              <div className="flex flex-wrap gap-3">
                <ComparisonToggle listingId={detail.id} />
                <ShareListingControl listingId={detail.id} title={detail.title} />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-2 border-heroDark-950 bg-[#e5eefc] p-6 shadow-glass">
            <span className="rm-eyebrow">GHI CHÚ CỦA BẠN</span>
            <ListingNoteEditor listingId={detail.id} />
          </section>

          <section className="space-y-4 border-2 border-heroDark-950 bg-rent-surface p-6 shadow-glass">
            <span className="rm-eyebrow">THÔNG TIN LIÊN HỆ</span>
            <h2 className="text-lg font-extrabold text-slate-900">Thông tin liên hệ</h2>
            {detail.landlordVerified ? (
              <p className="inline-flex items-center gap-2 border-2 border-heroDark-950 bg-[#c9f269] px-3 py-2 text-xs font-extrabold shadow-glass-sm">
                <Icon name="check" className="h-4 w-4" /> Hồ sơ chủ trọ đã được RentMate duyệt
              </p>
            ) : null}
            {detail.landlordContact ? (
              <dl className="space-y-4 text-sm font-medium text-slate-700">
                <div className="border-2 border-heroDark-950 bg-[#e5eefc] p-3.5">
                  <dt className="text-xs font-bold text-slate-400">Email liên hệ</dt>
                  <dd className="mt-1 break-all">
                    <a
                      className="font-extrabold text-teal-700 hover:text-teal-900"
                      href={`mailto:${detail.landlordContact.email}`}
                    >
                      {detail.landlordContact.email}
                    </a>
                  </dd>
                </div>
                <div className="border-2 border-heroDark-950 bg-[#e5eefc] p-3.5">
                  <dt className="text-xs font-bold text-slate-400">Số điện thoại</dt>
                  <dd className="mt-1">
                    <a
                      className="font-extrabold text-teal-700 hover:text-teal-900"
                      href={`tel:${detail.landlordContact.phone}`}
                    >
                      {detail.landlordContact.phone}
                    </a>
                  </dd>
                </div>
              </dl>
            ) : authStatus === "anonymous" ? (
              <p className="text-xs leading-relaxed text-slate-700">
                <Link className="font-extrabold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
                  Đăng nhập bằng tài khoản người thuê
                </Link>{" "}
                để kiểm tra quyền xem thông tin liên hệ.
              </p>
            ) : (
              <p className="text-xs font-medium text-slate-500">Thông tin liên hệ không có trong phản hồi hiện tại.</p>
            )}
            <div className="border-t-2 border-heroDark-950 pt-4">
              <InquiryForm listingId={detail.id} />
            </div>
            <div className="border-t-2 border-heroDark-950 pt-4">
              <ReportListingControl listingId={detail.id} />
            </div>
          </section>
        </aside>
      </div>
    </article>
  );
}
