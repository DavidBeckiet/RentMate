"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
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
  const [mounted, setMounted] = useState(false);
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

  const landlordReady = mounted && authStatus === "authenticated" && user?.role === "LANDLORD";

  useEffect(() => setMounted(true), []);

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

  if (!mounted || authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
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
  const completionItems = [
    { label: "Tiêu đề và mô tả", complete: Boolean(detail.title?.trim() && detail.description?.trim()) },
    {
      label: "Giá, diện tích và loại phòng",
      complete: detail.monthlyRent !== null && detail.roomAreaSqm !== null && detail.propertyType !== null
    },
    {
      label: "Địa chỉ và ghim bản đồ",
      complete: Boolean(
        detail.addressText?.trim() && detail.areaName?.trim() && detail.latitude !== null && detail.longitude !== null
      )
    },
    { label: "Ít nhất một ảnh", complete: detail.images.length > 0 }
  ];
  const completedItems = completionItems.filter((item) => item.complete).length;
  const completionPercent = Math.round((completedItems / completionItems.length) * 100);

  return (
    <article className={`${styles.ownerDetail} rm-workspace rm-workspace-page`}>
      <header className={styles.hero} data-tone={detail.status === "REJECTED" ? "attention" : "info"}>
        <Icon name="building" className={styles.heroWatermark} />
        <Link href="/landlord" className={styles.backLink}>
          <Icon name="arrow" className={styles.backIcon} />
          Tin của tôi
        </Link>
        <div className={styles.heroContent}>
          <div>
            <p className={styles.eyebrow}>Trung tâm đăng tin</p>
            <h1>{title}</h1>
            <p className={styles.updatedAt}>Lưu lần cuối {new Date(detail.updatedAt).toLocaleString("vi-VN")}</p>
          </div>
          <div className={styles.badges}>
            <ListingStatusBadge status={detail.status} />
            <BusinessStatusBadge status={detail.businessStatus} />
          </div>
        </div>
        {reasonLabel && detail.currentModerationReason ? (
          <div className="rounded-control border-l-4 border-danger bg-danger-subtle p-4 text-sm text-danger">
            <p className="font-semibold">{reasonLabel}</p>
            <p className="mt-1 whitespace-pre-wrap">{detail.currentModerationReason}</p>
          </div>
        ) : null}
      </header>

      <nav className={styles.sectionNav} aria-label="Các phần của tin đăng">
        <a href="#listing-content">
          <Icon name="note" className="h-4 w-4" />
          Nội dung
        </a>
        <a href="#listing-images">
          <Icon name="eye" className="h-4 w-4" />
          Hình ảnh
        </a>
        <a href="#listing-publishing">
          <Icon name="send" className="h-4 w-4" />
          Đăng tin
        </a>
      </nav>

      <div className={styles.detailGrid}>
        <main className={styles.mainColumn}>
          <div id="listing-content" className={styles.anchorTarget}>
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
          </div>

          <div id="listing-images" className={styles.anchorTarget}>
            <OwnerImageManager
              detail={detail}
              contentBlocked={editorDirty || editorBusy}
              onCanonicalChange={replaceDetail}
              onBusyChange={setImageBusy}
              onOrderDirtyChange={setImageOrderDirty}
            />
          </div>
        </main>

        <aside id="listing-publishing" className={`${styles.sideColumn} ${styles.anchorTarget}`}>
          <section className={styles.completionCard} aria-labelledby="completion-heading">
            <div className={styles.completionHeader}>
              <div>
                <p className={styles.sideEyebrow}>Mức độ hoàn thiện</p>
                <h2 id="completion-heading">Sẵn sàng đăng tin</h2>
              </div>
              <strong>{completionPercent}%</strong>
            </div>
            <div className={styles.progressTrack} aria-label={`Đã hoàn thành ${completionPercent}%`}>
              <span style={{ width: `${completionPercent}%` }} />
            </div>
            <ul className={styles.completionList}>
              {completionItems.map((item) => (
                <li key={item.label} data-complete={item.complete}>
                  <Icon name={item.complete ? "check" : "minus"} className="h-4 w-4" />
                  {item.label}
                </li>
              ))}
            </ul>
            <p>
              {completedItems === completionItems.length
                ? "Tin đã đủ nội dung cốt lõi."
                : `Còn ${completionItems.length - completedItems} mục cần hoàn thiện.`}
            </p>
          </section>

          <OwnerBusinessStatusControl detail={detail} disabled={blocked} onDetailChange={replaceDetail} />
          <OwnerListingAvailabilityControl detail={detail} disabled={blocked} onDetailChange={replaceDetail} />
          <OwnerLifecycleActions
            detail={detail}
            blocked={blocked}
            onDetailChange={replaceDetail}
            onEditorFeedback={setEditorFeedback}
            onRefresh={refreshDetail}
          />
        </aside>
      </div>
    </article>
  );
}
