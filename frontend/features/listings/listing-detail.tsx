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
import { formatAreaSqm, formatVnd } from "./format";

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

  if (parsedId !== null && status === "loading") return <LoadingState message="Đang tải tin đăng…" />;

  if (parsedId === null || status === "not-found") {
    return (
      <ErrorState
        message="Tin đăng không tồn tại hoặc hiện không khả dụng."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/">
            Quay lại tìm phòng
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
  const primaryImage = orderedImages[0];

  return (
    <article className="space-y-8">
      <header>
        <Link href="/" className="text-sm font-semibold text-teal-800 underline decoration-2 underline-offset-4">
          ← Quay lại kết quả tìm kiếm
        </Link>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-teal-700">Tin đăng công khai</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{detail.title}</h1>
        <p className="mt-4 text-2xl font-bold text-teal-800">{formatVnd(detail.monthlyRent)}</p>
        <p className="mt-2 text-slate-700">
          {formatAreaSqm(detail.roomAreaSqm)} · {detail.propertyType.label} · {detail.areaName}
        </p>
        {actions ? <div className="mt-5 rounded-xl border border-stone-200 bg-white p-4">{actions}</div> : null}
      </header>

      {primaryImage ? (
        <section aria-label="Hình ảnh tin đăng" className="space-y-3">
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-stone-100">
            <Image
              src={primaryImage.url}
              alt={primaryImage.altText ?? `Ảnh chính của ${detail.title}`}
              fill
              priority
              sizes="(min-width: 1152px) 1088px, 100vw"
              className="object-cover"
            />
          </div>
          {orderedImages.length > 1 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {orderedImages.slice(1).map((image) => (
                <div
                  key={`${image.url}-${image.displayOrder}`}
                  className="relative aspect-[4/3] overflow-hidden rounded-lg bg-stone-100"
                >
                  <Image
                    src={image.url}
                    alt={image.altText ?? `Ảnh của ${detail.title}`}
                    fill
                    sizes="(min-width: 1024px) 256px, (min-width: 640px) 33vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-8">
          <section aria-labelledby="description-heading" className="rounded-xl border border-stone-200 bg-white p-6">
            <h2 id="description-heading" className="text-xl font-semibold text-slate-950">
              Mô tả
            </h2>
            <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-700">{detail.description}</p>
          </section>

          <section aria-labelledby="amenities-heading" className="rounded-xl border border-stone-200 bg-white p-6">
            <h2 id="amenities-heading" className="text-xl font-semibold text-slate-950">
              Tiện ích
            </h2>
            {detail.amenities.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {detail.amenities.map((amenity) => (
                  <li key={amenity.code} className="rounded-full bg-stone-100 px-3 py-1.5 text-sm text-slate-700">
                    {amenity.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-600">Tin đăng chưa nêu tiện ích.</p>
            )}
          </section>

          <section aria-labelledby="detail-map-heading" className="rounded-xl border border-stone-200 bg-white p-4">
            <h2 id="detail-map-heading" className="font-semibold text-slate-950">
              Vị trí xấp xỉ
            </h2>
            <p className="mb-4 mt-1 text-sm text-slate-600">Bản đồ không hiển thị địa chỉ hoặc tọa độ chính xác.</p>
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
          </section>
        </div>

        <aside className="h-fit rounded-xl border border-stone-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
          <h2 className="text-lg font-semibold text-slate-950">Thông tin liên hệ</h2>
          {detail.landlordContact ? (
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="font-medium text-slate-600">Email</dt>
                <dd className="mt-1 break-all">
                  <a
                    className="font-semibold text-teal-800 underline decoration-2 underline-offset-4"
                    href={`mailto:${detail.landlordContact.email}`}
                  >
                    {detail.landlordContact.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-600">Điện thoại</dt>
                <dd className="mt-1">
                  <a
                    className="font-semibold text-teal-800 underline decoration-2 underline-offset-4"
                    href={`tel:${detail.landlordContact.phone}`}
                  >
                    {detail.landlordContact.phone}
                  </a>
                </dd>
              </div>
            </dl>
          ) : authStatus === "anonymous" ? (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
                Đăng nhập bằng tài khoản người thuê
              </Link>{" "}
              để kiểm tra quyền xem thông tin liên hệ.
            </p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600">Thông tin liên hệ không có trong phản hồi hiện tại.</p>
          )}
        </aside>
      </div>
    </article>
  );
}
