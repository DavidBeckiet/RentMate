"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapBase } from "../../components/map/map-base";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { AccountStatusBadge, BusinessStatusBadge, ListingStatusBadge } from "../../components/ui/status-badge";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminListingDetail as AdminListingDetailDto } from "../../types/api";
import { formatAreaSqm, formatVnd } from "./format";
import { ListingAmenityChips, ListingPrice } from "./listing-presentation";
import { ModerationActions } from "./moderation-actions";
import { ModerationHistory, type HistoryRefreshInstruction } from "./moderation-history";
import styles from "./admin-listing-detail.module.css";

type DetailState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "success"; readonly detail: AdminListingDetailDto }
  | { readonly status: "error"; readonly error: ApiError | null };

function parseListingId(rawListingId: string): number | null {
  if (!/^[1-9][0-9]*$/.test(rawListingId)) return null;
  const value = Number(rawListingId);
  return Number.isSafeInteger(value) ? value : null;
}

export function AdminListingDetail({ listingId: rawListingId }: { readonly listingId: string }) {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const listingId = parseListingId(rawListingId);
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const [historyRefresh, setHistoryRefresh] = useState<HistoryRefreshInstruction>();
  const detailRequest = useRef(0);
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";

  const loadDetail = useCallback(async () => {
    if (!adminReady || listingId === null) return;
    const currentRequest = ++detailRequest.current;
    setState((current) => (current.status === "success" ? current : { status: "loading" }));
    try {
      const detail = await api.admin.getListing(listingId);
      if (currentRequest === detailRequest.current) setState({ status: "success", detail });
    } catch (error) {
      if (currentRequest !== detailRequest.current) return;
      const apiError = error instanceof ApiError ? error : null;
      setState({ status: "error", error: apiError });
      if (apiError?.status === 401) void refresh();
    }
  }, [adminReady, listingId, refresh]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous")
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên để tiếp tục."
        action={
          <Link href="/admin/login" className="font-semibold text-teal-800 underline">
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
  if (!user || user.role !== "ADMIN") return <ErrorState message="Trang này dành cho quản trị viên." />;
  if (listingId === null) return <ErrorState message="Mã tin không hợp lệ." />;

  const refreshHistory = (resetToFirstPage: boolean) =>
    setHistoryRefresh((current) => ({ token: (current?.token ?? 0) + 1, ...(resetToFirstPage ? { page: 1 } : {}) }));

  return (
    <article className={`${styles.adminDetail} rm-workspace space-y-10`}>
      <header className="border-b border-rent-line pb-7">
        <Link href="/admin" className="text-sm font-semibold text-teal-800 underline decoration-2 underline-offset-4">
          ← Quay lại hàng đợi
        </Link>
        <p className="mt-6 text-sm font-semibold text-teal-700">CHI TIẾT QUẢN TRỊ</p>
        <h1 className="mt-2 text-3xl font-bold text-rent-ink sm:text-4xl">Tin #{listingId}</h1>
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
      {state.status === "success" ? (
        <CanonicalDetail detail={state.detail} onReloadDetail={loadDetail} onRefreshHistory={refreshHistory} />
      ) : null}

      <ModerationHistory listingId={listingId} refreshInstruction={historyRefresh} />
    </article>
  );
}

function CanonicalDetail({
  detail,
  onReloadDetail,
  onRefreshHistory
}: {
  readonly detail: AdminListingDetailDto;
  readonly onReloadDetail: () => Promise<void>;
  readonly onRefreshHistory: (reset: boolean) => void;
}) {
  const orderedImages = [...detail.images].sort((left, right) => left.displayOrder - right.displayOrder);
  const reasonLabel = detail.status === "REJECTED" ? "Lý do từ chối" : detail.status === "HIDDEN" ? "Lý do ẩn" : null;
  return (
    <div className="space-y-8">
      <section className="rounded-card border border-rent-line bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-rent-ink">{detail.title ?? "Chưa có tiêu đề"}</h2>
            <p className="mt-2 text-sm text-rent-secondary">Cập nhật {new Date(detail.updatedAt).toLocaleString("vi-VN")}</p>
          </div>
          <ListingStatusBadge status={detail.status} />
          <BusinessStatusBadge status={detail.businessStatus} />
        </div>
        {reasonLabel && detail.currentModerationReason ? (
          <div className="mt-5 rounded-control border border-red-200 bg-red-50 p-4 text-sm text-red-950">
            <p className="font-semibold">{reasonLabel}</p>
            <p className="mt-1 whitespace-pre-wrap">{detail.currentModerationReason}</p>
          </div>
        ) : null}
        <div className="mt-6"><ListingPrice monthlyRent={detail.monthlyRent} /></div>
        <dl className="mt-5 grid gap-4 border-t border-rent-line pt-5 text-sm text-rent-secondary sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-semibold text-rent-ink">Giá thuê</dt>
            <dd>{detail.monthlyRent === null ? "Chưa có" : formatVnd(detail.monthlyRent)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-rent-ink">Diện tích</dt>
            <dd>{detail.roomAreaSqm === null ? "Chưa có" : formatAreaSqm(detail.roomAreaSqm)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-rent-ink">Loại hình</dt>
            <dd>{detail.propertyType?.label ?? "Chưa có"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-rent-ink">Khu vực</dt>
            <dd>{detail.areaName ?? "Chưa có"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold text-rent-ink">Địa chỉ chính xác</dt>
            <dd>{detail.addressText ?? "Chưa có"}</dd>
          </div>
        </dl>
        <div className="mt-6">
          <h3 className="font-semibold text-rent-ink">Mô tả</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-rent-secondary">
            {detail.description ?? "Chưa có mô tả"}
          </p>
        </div>
        <div className="mt-6">
          <h3 className="font-semibold text-rent-ink">Tiện ích</h3>
          {detail.amenities.length ? <div className="mt-2"><ListingAmenityChips amenities={detail.amenities} /></div> : <p className="mt-2 text-sm text-rent-secondary">Chưa có tiện ích</p>}
        </div>
      </section>

      {orderedImages.length ? (
        <section aria-label="Ảnh tin đăng" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {orderedImages.map((image) => (
            <div key={image.id} className="relative aspect-[4/3] overflow-hidden rounded-control bg-rent-surface-muted">
              <Image
                src={image.url}
                alt={image.altText ?? `Ảnh tin ${detail.id}`}
                fill
                sizes="(min-width: 640px) 33vw, 50vw"
                className="object-cover"
              />
            </div>
          ))}
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-card border border-rent-line bg-white p-5">
          <h2 className="text-xl font-semibold text-rent-ink">Người cho thuê</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-semibold">Email</dt>
              <dd className="break-all">{detail.landlord.email}</dd>
            </div>
            <div>
              <dt className="font-semibold">Điện thoại</dt>
              <dd>{detail.landlord.phone || "Chưa có số điện thoại"}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <AccountStatusBadge isActive={detail.landlord.isActive} />
          </div>
        </section>
        {detail.latitude !== null && detail.longitude !== null ? (
          <section className="rounded-card border border-rent-line bg-white p-4 sm:p-5">
            <h2 className="text-xl font-semibold text-rent-ink">Vị trí chính xác</h2>
            <p className="mb-4 mt-1 text-sm text-rent-secondary">
              {detail.latitude}, {detail.longitude}
            </p>
            <MapBase
              ariaLabel="Bản đồ vị trí chính xác của tin"
              center={{ latitude: detail.latitude, longitude: detail.longitude }}
              zoom={16}
              markers={[
                {
                  id: detail.id,
                  label: detail.title ?? `Tin ${detail.id}`,
                  position: { latitude: detail.latitude, longitude: detail.longitude }
                }
              ]}
            />
          </section>
        ) : null}
      </div>
      <ModerationActions detail={detail} onReloadDetail={onReloadDetail} onRefreshHistory={onRefreshHistory} />
    </div>
  );
}
