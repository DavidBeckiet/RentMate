"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { BusinessStatusBadge, ListingStatusBadge } from "../../components/ui/status-badge";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { Amenity, OwnerListingDetail as OwnerDetail, PropertyType } from "../../types/api";
import { OwnerImageManager } from "./owner-image-manager";
import { OwnerLifecycleActions } from "./owner-lifecycle-actions";
import { OwnerListingEditor, type LookupResource, type OwnerEditorFeedback } from "./owner-listing-editor";
import { OwnerBusinessStatusControl } from "./owner-business-status-control";
import { OwnerListingAvailabilityControl } from "./owner-listing-availability-control";
import styles from "./owner-listing-detail.module.css";

const maximumListingId = 2_147_483_647;
const unavailableMessage = "Tin đăng không tồn tại hoặc bạn không thể truy cập.";

type DetailState =
  | { readonly status: "idle"; readonly detail: null; readonly error: null }
  | { readonly status: "loading"; readonly detail: null; readonly error: null }
  | { readonly status: "success"; readonly detail: OwnerDetail; readonly error: null }
  | { readonly status: "unavailable"; readonly detail: null; readonly error: null }
  | { readonly status: "error"; readonly detail: null; readonly error: ApiError | null };

function parseListingId(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximumListingId ? parsed : null;
}

function initialLookup<Value>(): LookupResource<Value> {
  return { status: "loading", data: [] };
}

function lookupAfterFailure<Value>(current: LookupResource<Value>): LookupResource<Value> {
  return { status: "error", data: current.data };
}

export function OwnerListingDetail({ listingId }: { readonly listingId: string }) {
  const parsedId = useMemo(() => parseListingId(listingId), [listingId]);
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const [detailState, setDetailState] = useState<DetailState>({ status: "idle", detail: null, error: null });
  const [detailVersion, setDetailVersion] = useState(0);
  const [propertyVersion, setPropertyVersion] = useState(0);
  const [amenityVersion, setAmenityVersion] = useState(0);
  const [propertyTypes, setPropertyTypes] = useState<LookupResource<PropertyType>>(initialLookup);
  const [amenities, setAmenities] = useState<LookupResource<Amenity>>(initialLookup);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageOrderDirty, setImageOrderDirty] = useState(false);
  const [editorFeedback, setEditorFeedback] = useState<OwnerEditorFeedback | null>(null);
  const detailIdentity = useRef(0);
  const authRefreshForId = useRef<number | null>(null);

  const landlordReady = authStatus === "authenticated" && user?.role === "LANDLORD";

  useEffect(() => {
    setEditorDirty(false);
    setEditorBusy(false);
    setImageBusy(false);
    setImageOrderDirty(false);
    setEditorFeedback(null);
  }, [parsedId]);

  useEffect(() => {
    if (!landlordReady) {
      setDetailState({ status: "idle", detail: null, error: null });
      return;
    }
    if (parsedId === null) {
      setDetailState({ status: "unavailable", detail: null, error: null });
      return;
    }

    const controller = new AbortController();
    const identity = ++detailIdentity.current;
    let active = true;
    setDetailState({ status: "loading", detail: null, error: null });

    void api.listings
      .getOwned(parsedId, controller.signal)
      .then((detail) => {
        if (!active || controller.signal.aborted || identity !== detailIdentity.current) return;
        authRefreshForId.current = null;
        setDetailState({ status: "success", detail, error: null });
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted || identity !== detailIdentity.current) return;
        const apiError = caught instanceof ApiError ? caught : null;
        if (apiError?.status === 404 || apiError?.status === 403 || apiError?.status === 422) {
          setDetailState({ status: "unavailable", detail: null, error: null });
          return;
        }
        setDetailState({ status: "error", detail: null, error: apiError });
        if (apiError?.status === 401 && authRefreshForId.current !== parsedId) {
          authRefreshForId.current = parsedId;
          void refresh().catch(() => undefined);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [detailVersion, landlordReady, parsedId, refresh]);

  const canonicalDetail = detailState.status === "success" ? detailState.detail : null;
  const canonicalDetailId = canonicalDetail?.id ?? null;

  useEffect(() => {
    if (!landlordReady || canonicalDetailId === null) return;
    const controller = new AbortController();
    let active = true;
    setPropertyTypes((current) => ({ status: "loading", data: current.data }));
    void api.lookups
      .listPropertyTypes(controller.signal)
      .then((data) => {
        if (active && !controller.signal.aborted) setPropertyTypes({ status: "success", data });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setPropertyTypes(lookupAfterFailure);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [canonicalDetailId, landlordReady, propertyVersion]);

  useEffect(() => {
    if (!landlordReady || canonicalDetailId === null) return;
    const controller = new AbortController();
    let active = true;
    setAmenities((current) => ({ status: "loading", data: current.data }));
    void api.lookups
      .listAmenities(controller.signal)
      .then((data) => {
        if (active && !controller.signal.aborted) setAmenities({ status: "success", data });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setAmenities(lookupAfterFailure);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [amenityVersion, canonicalDetailId, landlordReady]);

  const replaceDetail = useCallback((detail: OwnerDetail) => {
    setDetailState({ status: "success", detail, error: null });
    setEditorFeedback(null);
  }, []);

  const refreshDetail = useCallback(() => {
    setEditorFeedback(null);
    setDetailVersion((version) => version + 1);
  }, []);

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản chủ nhà để quản lý tin."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  }
  if (authStatus === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!user || user.role !== "LANDLORD") {
    return <ErrorState message="Trang này dành cho tài khoản chủ nhà." />;
  }
  if (parsedId === null || detailState.status === "unavailable") {
    return <ErrorState message={unavailableMessage} />;
  }
  if (detailState.status === "idle" || detailState.status === "loading") {
    return <LoadingState message="Đang tải tin của bạn…" />;
  }
  if (detailState.status === "error") {
    const message =
      detailState.error?.status === 401
        ? "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại."
        : "Không thể tải tin lúc này. Vui lòng thử lại.";
    return (
      <ErrorState
        message={message}
        requestId={detailState.error?.requestId}
        action={<Button onClick={refreshDetail}>Thử lại</Button>}
      />
    );
  }

  const detail = detailState.detail;
  const title = detail.title ?? "Chưa có tiêu đề";
  const reasonLabel = detail.status === "REJECTED" ? "Lý do từ chối" : detail.status === "HIDDEN" ? "Lý do ẩn" : null;
  const blocked = editorDirty || editorBusy || imageBusy || imageOrderDirty;

  return (
    <article className={`${styles.ownerDetail} rm-workspace space-y-8`}>
      <header className="space-y-4 border-b border-rent-line pb-7">
        <Link
          href="/landlord"
          className="text-sm font-semibold text-teal-800 underline decoration-2 underline-offset-4"
        >
          ← Quay lại tin của tôi
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-teal-700">TIN CỦA CHỦ NHÀ</p>
            <h1 className="mt-2 text-3xl font-bold text-rent-ink sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm text-rent-secondary">
              Cập nhật lần cuối: {new Date(detail.updatedAt).toLocaleString("vi-VN")}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <ListingStatusBadge status={detail.status} />
            <BusinessStatusBadge status={detail.businessStatus} />
          </div>
        </div>
        {reasonLabel && detail.currentModerationReason ? (
          <div className="rounded-control border border-red-200 bg-red-50 p-4 text-sm text-red-950">
            <p className="font-semibold">{reasonLabel}</p>
            <p className="mt-1 whitespace-pre-wrap">{detail.currentModerationReason}</p>
          </div>
        ) : null}
      </header>

      <OwnerListingEditor
        detail={detail}
        propertyTypes={propertyTypes}
        amenities={amenities}
        externalFeedback={editorFeedback}
        onDetailChange={replaceDetail}
        onDirtyChange={setEditorDirty}
        onBusyChange={setEditorBusy}
        onEdit={() => setEditorFeedback(null)}
        onRetryPropertyTypes={() => setPropertyVersion((version) => version + 1)}
        onRetryAmenities={() => setAmenityVersion((version) => version + 1)}
      />

      <OwnerBusinessStatusControl detail={detail} disabled={blocked} onDetailChange={replaceDetail} />

      <OwnerListingAvailabilityControl detail={detail} disabled={blocked} onDetailChange={replaceDetail} />

      <OwnerImageManager
        detail={detail}
        contentBlocked={editorDirty || editorBusy}
        onCanonicalChange={replaceDetail}
        onBusyChange={setImageBusy}
        onOrderDirtyChange={setImageOrderDirty}
      />

      <OwnerLifecycleActions
        detail={detail}
        blocked={blocked}
        onDetailChange={replaceDetail}
        onEditorFeedback={setEditorFeedback}
        onRefresh={refreshDetail}
      />
    </article>
  );
}
