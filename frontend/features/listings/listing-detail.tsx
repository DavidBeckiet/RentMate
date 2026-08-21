"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MapBase } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { PublicListingDetail } from "../../types/api";
import { formatAreaSqm } from "./format";
import { ListingAmenityChips, ListingPrice } from "./listing-presentation";
import styles from "./listing-detail.module.css";

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
          <Link className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-glow-teal" href="/">
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
      <header className="space-y-4 border-b border-slate-200/80 pb-8">
        <Link
          href="/?sort=newest"
          className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-teal-700 hover:text-teal-900 transition-colors"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          <span>Quay lại tìm phòng</span>
        </Link>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rm-eyebrow">TIN CÔNG KHAI</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{detail.propertyType.label}</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 sm:text-4xl lg:text-5xl tracking-tight leading-tight">{detail.title}</h1>
          <p className="flex items-center gap-2 text-base font-semibold text-slate-600">
            <svg aria-hidden="true" className="h-5 w-5 text-teal-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            <span>{detail.areaName}</span>
            <span>·</span>
            <span>{formatAreaSqm(detail.roomAreaSqm)}</span>
          </p>
        </div>
      </header>

      {/* Gallery Bento Grid */}
      {primaryImage ? (
        <section aria-label="Hình ảnh tin đăng" className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(14rem,0.8fr)]">
          <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-slate-100 shadow-glass lg:aspect-auto lg:min-h-[30rem]">
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
                  className="rm-gallery-thumb rounded-2xl overflow-hidden shadow-sm"
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
                    <span className="absolute inset-0 grid place-items-center bg-slate-950/70 text-sm font-extrabold text-white backdrop-blur-xs">
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
          className="flex aspect-[16/10] flex-col items-center justify-center gap-3 rounded-3xl bg-slate-100 px-6 text-center text-sm font-semibold text-slate-500 shadow-sm"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12 text-teal-600">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="m4 18 5.5-5 3.5 3 2.5-2.5 4.5 4.5" />
          </svg>
          <span>Tin đăng chưa có hình ảnh</span>
        </section>
      )}

      {/* Main Details and Sidebar */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-10">
          {/* Key Specs Card */}
          <div className="grid grid-cols-3 gap-4 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-glass">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Loại hình</p>
              <p className="mt-1 text-base font-extrabold text-slate-900">{detail.propertyType.label}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Diện tích</p>
              <p className="mt-1 text-base font-extrabold text-slate-900">{formatAreaSqm(detail.roomAreaSqm)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Khu vực</p>
              <p className="mt-1 text-base font-extrabold text-slate-900">{detail.areaName}</p>
            </div>
          </div>

          <section aria-labelledby="description-heading" className="space-y-4 border-t border-slate-200/80 pt-8">
            <h2 id="description-heading" className="text-2xl font-black text-slate-900">
              Mô tả chi tiết
            </h2>
            <p className="max-w-3xl whitespace-pre-wrap text-base leading-relaxed text-slate-700 font-medium">
              {detail.description}
            </p>
          </section>

          <section aria-labelledby="amenities-heading" className="space-y-4 border-t border-slate-200/80 pt-8">
            <h2 id="amenities-heading" className="text-2xl font-black text-slate-900">
              Tiện ích đi kèm
            </h2>
            {detail.amenities.length > 0 ? (
              <div><ListingAmenityChips amenities={detail.amenities} /></div>
            ) : (
              <p className="text-sm font-medium text-slate-500">Tin đăng chưa liệt kê tiện ích.</p>
            )}
          </section>

          <section aria-labelledby="detail-map-heading" className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-glass space-y-4">
            <div>
              <h2 id="detail-map-heading" className="text-xl font-black text-slate-900">
                Vị trí xấp xỉ
              </h2>
              <p className="text-xs font-medium text-slate-500">Để bảo vệ quyền riêng tư của chủ nhà, tọa độ trên bản đồ được làm tròn xấp xỉ.</p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 min-h-[18rem]">
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

        {/* Sticky Contact Sidebar Card */}
        <aside className="h-fit space-y-6 lg:sticky lg:top-24">
          <section className="rounded-3xl border border-teal-200/80 bg-gradient-to-br from-teal-50/80 via-white to-teal-50/40 p-6 shadow-card-hover space-y-4">
            <span className="rm-eyebrow">MỨC GIÁ THUÊ</span>
            <div>
              <ListingPrice monthlyRent={detail.monthlyRent} emphasis="prominent" />
            </div>
            {actions ? <div className="border-t border-teal-100 pt-4">{actions}</div> : null}
          </section>

          <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-glass space-y-4">
            <span className="rm-eyebrow">THÔNG TIN LIÊN HỆ</span>
            <h2 className="text-lg font-extrabold text-slate-900">Thông tin liên hệ</h2>
            {detail.landlordContact ? (
              <dl className="space-y-4 text-sm font-medium text-slate-700">
                <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-100">
                  <dt className="text-xs font-bold text-slate-400">Email liên hệ</dt>
                  <dd className="mt-1 break-all">
                    <a className="font-extrabold text-teal-700 hover:text-teal-900" href={`mailto:${detail.landlordContact.email}`}>
                      {detail.landlordContact.email}
                    </a>
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-100">
                  <dt className="text-xs font-bold text-slate-400">Số điện thoại</dt>
                  <dd className="mt-1">
                    <a className="font-extrabold text-teal-700 hover:text-teal-900" href={`tel:${detail.landlordContact.phone}`}>
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
          </section>
        </aside>
      </div>
    </article>
  );
}
