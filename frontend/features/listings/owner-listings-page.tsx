"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { SelectField } from "../../components/ui/form-controls";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type {
  ApiPage,
  Inquiry,
  LandlordAnalytics,
  ListingBusinessStatus,
  ListingStatus,
  OwnerListingSummary
} from "../../types/api";
import { OwnerListingCard } from "./owner-listing-card";
import {
  ownerListingStatuses,
  ownerBusinessStatuses,
  ownerListingsUrl,
  parseOwnerQuery,
  serializeOwnerQuery,
  toOwnedListingQuery,
  withOwnerPage,
  withOwnerBusinessStatus,
  withOwnerStatus
} from "./owner-query";
import styles from "./owner-listings-page.module.css";

type LoadStatus = "idle" | "loading" | "success" | "error";
type SnapshotStatus = "idle" | "loading" | "success" | "error";

const statusLabels: Record<ListingStatus, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
  HIDDEN: "Đã ẩn",
  INACTIVE: "Ngừng hoạt động"
};

const businessStatusLabels: Record<ListingBusinessStatus, string> = {
  AVAILABLE: "Còn phòng",
  PAUSED: "Tạm dừng",
  RENTED: "Đã thuê",
  UNKNOWN: "Chưa xác định"
};

function ownerListError(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Trang quản lý tin chỉ dành cho tài khoản người cho thuê.";
  if (error?.status === 422) return "Liên kết quản lý tin đăng không hợp lệ.";
  if (error?.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  return "Không thể tải danh sách tin lúc này. Vui lòng thử lại.";
}

function createError(error: ApiError | null): string {
  if (error?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (error?.status === 403) return "Bạn không có quyền tạo bản nháp.";
  if (error?.status === 422) return "Yêu cầu tạo bản nháp không hợp lệ.";
  if (error?.code === "NETWORK_ERROR") {
    return "Không thể xác nhận việc tạo bản nháp. Hãy kiểm tra danh sách tin trước khi thử lại.";
  }
  return "Không thể tạo bản nháp lúc này. Vui lòng thử lại sau.";
}

function inquiryStatusLabel(status: Inquiry["status"]): string {
  return status === "NEW" ? "Mới" : status === "CONTACTED" ? "Đang trao đổi" : "Đã đóng";
}

export function OwnerListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsed = useMemo(() => parseOwnerQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const queryIdentity = parsed.ok ? serializeOwnerQuery(parsed.state).toString() : `invalid:${rawQuery}`;
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const [mounted, setMounted] = useState(false);
  const isLandlord = mounted && authStatus === "authenticated" && user?.role === "LANDLORD";
  const [result, setResult] = useState<ApiPage<OwnerListingSummary> | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [createPending, setCreatePending] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<string | null>(null);
  const [duplicatePendingId, setDuplicatePendingId] = useState<number | null>(null);
  const [duplicateFeedback, setDuplicateFeedback] = useState<string | null>(null);
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<{
    readonly analytics: LandlordAnalytics;
    readonly inquiries: readonly Inquiry[];
  } | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<SnapshotStatus>("idle");
  const requestIdentity = useRef(0);
  const authRefreshAttempted = useRef(false);
  const createPendingRef = useRef(false);
  const createController = useRef<AbortController | null>(null);
  const showSnapshot =
    isLandlord &&
    parsed.ok &&
    parsed.state.page === 1 &&
    parsed.state.status === undefined &&
    parsed.state.businessStatus === undefined;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isLandlord || !parsed.ok) {
      ++requestIdentity.current;
      setResult(null);
      setLoadError(null);
      setLoadStatus("idle");
      return;
    }

    const controller = new AbortController();
    const identity = ++requestIdentity.current;
    setResult(null);
    setLoadError(null);
    setLoadStatus("loading");

    void api.listings
      .listOwned(toOwnedListingQuery(parsed.state), controller.signal)
      .then((page) => {
        if (controller.signal.aborted || identity !== requestIdentity.current) return;
        setResult(page);
        setLoadStatus("success");
        authRefreshAttempted.current = false;
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || identity !== requestIdentity.current) return;
        const error = caught instanceof ApiError ? caught : null;
        setLoadError(error);
        setLoadStatus("error");
        if (error?.status === 401 && !authRefreshAttempted.current) {
          authRefreshAttempted.current = true;
          void refresh().catch(() => undefined);
        }
      });

    return () => controller.abort();
  }, [isLandlord, parsed, queryIdentity, refresh, retryKey]);

  useEffect(() => {
    if (!showSnapshot) {
      setWorkspaceSnapshot(null);
      setSnapshotStatus("idle");
      return;
    }

    const controller = new AbortController();
    setWorkspaceSnapshot(null);
    setSnapshotStatus("loading");
    void Promise.all([
      api.contact.listLandlordInquiries({ page: 1, pageSize: 3 }, controller.signal),
      api.analytics.getLandlord("30D", controller.signal)
    ])
      .then(([inquiries, analytics]) => {
        if (controller.signal.aborted) return;
        setWorkspaceSnapshot({ inquiries: inquiries.data, analytics });
        setSnapshotStatus("success");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSnapshotStatus("error");
      });

    return () => controller.abort();
  }, [retryKey, showSnapshot]);

  useEffect(
    () => () => {
      createController.current?.abort();
    },
    []
  );

  const createDraft = useCallback(async () => {
    if (createPendingRef.current) return;
    const controller = new AbortController();
    createController.current = controller;
    createPendingRef.current = true;
    setCreatePending(true);
    setCreateFeedback(null);
    try {
      const created = await api.listings.createDraft({}, controller.signal);
      if (!controller.signal.aborted) router.push(`/landlord/listings/${created.id}`);
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      const error = caught instanceof ApiError ? caught : null;
      setCreateFeedback(createError(error));
      if (error?.status === 401) await refresh().catch(() => undefined);
    } finally {
      if (!controller.signal.aborted && createController.current === controller) {
        createPendingRef.current = false;
        setCreatePending(false);
      }
    }
  }, [refresh, router]);

  const duplicateListing = useCallback(
    async (listingId: number) => {
      if (duplicatePendingId !== null) return;
      setDuplicatePendingId(listingId);
      setDuplicateFeedback(null);
      const controller = new AbortController();
      try {
        const created = await api.listings.duplicate(listingId, controller.signal);
        if (!controller.signal.aborted) router.push(`/landlord/listings/${created.id}`);
      } catch (caught: unknown) {
        if (controller.signal.aborted) return;
        const error = caught instanceof ApiError ? caught : null;
        if (error?.status === 401) {
          setDuplicateFeedback("Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.");
          await refresh().catch(() => undefined);
        } else if (error?.status === 403) {
          setDuplicateFeedback("Bạn không có quyền nhân bản tin này.");
        } else if (error?.status === 404) {
          setDuplicateFeedback("Tin đăng không còn tồn tại hoặc bạn không thể truy cập.");
        } else if (error?.status === 409) {
          setDuplicateFeedback("Tin đã thay đổi. Hãy tải lại danh sách rồi thử lại.");
        } else if (error?.code === "NETWORK_ERROR") {
          setDuplicateFeedback("Không thể xác nhận việc nhân bản. Hãy kiểm tra danh sách trước khi thử lại.");
        } else {
          setDuplicateFeedback("Không thể nhân bản tin lúc này. Vui lòng thử lại sau.");
        }
      } finally {
        setDuplicatePendingId(null);
      }
    },
    [duplicatePendingId, refresh, router]
  );

  let content: ReactNode;
  if (!mounted || authStatus === "loading") {
    content = <LoadingState message="Đang kiểm tra tài khoản…" />;
  } else if (!parsed.ok) {
    content = (
      <ErrorState
        message={parsed.message}
        action={<Button onClick={() => router.replace("/landlord")}>Đặt lại liên kết</Button>}
      />
    );
  } else if (authStatus === "anonymous") {
    content = (
      <EmptyState
        title="Đăng nhập để quản lý tin"
        description="Trang này dành cho tài khoản người cho thuê."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  } else if (authStatus === "error") {
    content = (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này. Vui lòng thử lại."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  } else if (!user || user.role !== "LANDLORD") {
    content = (
      <EmptyState
        title="Trang này dành cho tài khoản người cho thuê"
        description="Hãy dùng tài khoản người cho thuê để tạo và quản lý tin đăng."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/search">
            Tìm phòng
          </Link>
        }
      />
    );
  } else if (loadStatus === "loading" || loadStatus === "idle") {
    content = <LoadingState message="Đang tải tin của bạn…" />;
  } else if (loadStatus === "error") {
    content = (
      <ErrorState
        message={ownerListError(loadError)}
        requestId={loadError?.requestId}
        action={<Button onClick={() => setRetryKey((key) => key + 1)}>Thử lại</Button>}
      />
    );
  } else if (result) {
    const archivedListings = result.data.filter(
      (listing) => listing.status === "INACTIVE" || listing.businessStatus === "RENTED"
    );
    const currentListings = result.data.filter(
      (listing) => listing.status !== "INACTIVE" && listing.businessStatus !== "RENTED"
    );
    const attentionListings = result.data.filter(
      (listing) => listing.availabilityStatus === "REMINDER_DUE" || listing.availabilityStatus === "AUTO_PAUSED"
    );
    const renderCards = (listings: readonly OwnerListingSummary[]) => (
      <div className="space-y-4" aria-label="Tin đăng của bạn">
        {listings.map((listing) => (
          <OwnerListingCard
            key={listing.id}
            listing={listing}
            duplicatePending={duplicatePendingId === listing.id}
            onDuplicate={() => void duplicateListing(listing.id)}
          />
        ))}
      </div>
    );

    content = (
      <div className="space-y-6">
        {attentionListings.length > 0 ? (
          <div
            className="rm-workspace-card flex flex-wrap items-start gap-3 border-l-4 border-warning bg-warning-subtle p-4"
            role="status"
          >
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-warning text-white">
              !
            </span>
            <div>
              <p className="font-bold text-rent-ink">Tin cần cập nhật</p>
              <p className="mt-1 text-sm text-rent-secondary">
                Một số tin đăng cần xác nhận lại tình trạng phòng để tránh hiển thị thông tin đã cũ.
              </p>
            </div>
          </div>
        ) : null}
        <div className="rm-summary-grid" aria-label="Tóm tắt tin đăng trong trang này">
          <div className="rm-summary-card" data-tone="accent">
            <span className="rm-summary-label">Tin trong trang</span>
            <strong className="rm-summary-value">{result.data.length}</strong>
            <span className="rm-summary-note">Theo bộ lọc và trang hiện tại</span>
          </div>
          <div className="rm-summary-card" data-tone="attention">
            <span className="rm-summary-label">Cần chú ý</span>
            <strong className="rm-summary-value">{attentionListings.length}</strong>
            <span className="rm-summary-note">Cần xác nhận lại tình trạng phòng</span>
          </div>
          <div className="rm-summary-card">
            <span className="rm-summary-label">Đang quản lý</span>
            <strong className="rm-summary-value">{currentListings.length}</strong>
            <span className="rm-summary-note">Không gồm tin đã lưu trữ</span>
          </div>
          <div className="rm-summary-card" data-tone="muted">
            <span className="rm-summary-label">Đã lưu trữ</span>
            <strong className="rm-summary-value">{archivedListings.length}</strong>
            <span className="rm-summary-note">Tin đã thuê hoặc ngừng hoạt động</span>
          </div>
        </div>
        <section
          className="rm-workspace-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
          aria-labelledby="landlord-quick-actions-heading"
        >
          <div className="min-w-0">
            <p className="rm-workspace-eyebrow">Điểm xử lý nhanh</p>
            <h2 id="landlord-quick-actions-heading" className="mt-1 font-display text-lg font-bold text-foreground">
              Giữ nhịp phản hồi với khách thuê
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Mở đúng khu vực để xử lý yêu cầu, theo dõi lead hoặc xem số liệu từ các hoạt động đã ghi nhận.
            </p>
          </div>
          <div className="rm-workspace-action-bar shrink-0">
            <Link
              href="/landlord/inquiries"
              className="min-h-11 rounded-control border border-border px-4 py-2 text-ui-sm font-semibold text-primary-hover transition-colors hover:border-primary/40 hover:bg-primary-subtle"
            >
              Yêu cầu liên hệ
            </Link>
            <Link
              href="/landlord/analytics"
              className="min-h-11 rounded-control bg-primary px-4 py-2 text-ui-sm font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              Xem phân tích
            </Link>
          </div>
        </section>
        {showSnapshot && snapshotStatus === "loading" ? (
          <section className="rm-workspace-card grid gap-4 p-5 sm:grid-cols-3" aria-label="Đang tải tóm tắt vận hành">
            <div className="space-y-3">
              <div className="rm-skeleton h-3 w-24 rounded-full bg-muted" />
              <div className="rm-skeleton h-9 w-16 rounded-control bg-muted" />
            </div>
            <div className="space-y-3">
              <div className="rm-skeleton h-3 w-28 rounded-full bg-muted" />
              <div className="rm-skeleton h-9 w-16 rounded-control bg-muted" />
            </div>
            <div className="space-y-3">
              <div className="rm-skeleton h-3 w-20 rounded-full bg-muted" />
              <div className="rm-skeleton h-9 w-16 rounded-control bg-muted" />
            </div>
          </section>
        ) : null}
        {showSnapshot && snapshotStatus === "error" ? (
          <div
            className="rm-workspace-card border-l-4 border-warning bg-warning-subtle p-4 text-sm font-semibold text-warning-foreground"
            role="status"
          >
            Chưa thể tải tóm tắt hoạt động lúc này. Bạn vẫn có thể quản lý tin đăng hoặc mở Analytics để thử lại.
          </div>
        ) : null}
        {showSnapshot && workspaceSnapshot ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
            <section className="rm-workspace-card p-5 sm:p-6" aria-labelledby="landlord-activity-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="rm-workspace-eyebrow">Dữ liệu 30 ngày</p>
                  <h2 id="landlord-activity-heading" className="mt-1 font-display text-lg font-bold text-foreground">
                    Hoạt động trên các tin đăng
                  </h2>
                </div>
                <Link
                  href="/landlord/analytics"
                  className="text-sm font-semibold text-primary-hover underline underline-offset-4"
                >
                  Xem đầy đủ
                </Link>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-control bg-primary-subtle p-3">
                  <span className="rm-summary-label">Inquiry mới</span>
                  <strong className="rm-summary-value text-3xl">{workspaceSnapshot.analytics.inquiries}</strong>
                </div>
                <div className="rounded-control bg-warning-subtle p-3">
                  <span className="rm-summary-label">Cần phản hồi</span>
                  <strong className="rm-summary-value text-3xl">{workspaceSnapshot.analytics.needsReplyNow}</strong>
                </div>
                <div className="rounded-control bg-surface-subtle p-3">
                  <span className="rm-summary-label">Lượt xem</span>
                  <strong className="rm-summary-value text-3xl">{workspaceSnapshot.analytics.views}</strong>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Chỉ số lấy từ Analytics hiện có; không phải số hợp đồng hay doanh thu.
              </p>
            </section>
            <section className="rm-workspace-card p-5 sm:p-6" aria-labelledby="recent-inquiries-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="rm-workspace-eyebrow">Hộp thư</p>
                  <h2 id="recent-inquiries-heading" className="mt-1 font-display text-lg font-bold text-foreground">
                    Yêu cầu mới nhất
                  </h2>
                </div>
                <Link
                  href="/landlord/inquiries"
                  className="text-sm font-semibold text-primary-hover underline underline-offset-4"
                >
                  Mở hộp thư
                </Link>
              </div>
              {workspaceSnapshot.inquiries.length === 0 ? (
                <p className="mt-5 text-sm leading-6 text-muted-foreground">Chưa có yêu cầu liên hệ nào.</p>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {workspaceSnapshot.inquiries.map((inquiry) => (
                    <li key={inquiry.id}>
                      <Link
                        href={`/inquiries/${inquiry.id}`}
                        className="flex min-h-16 items-center gap-3 py-3 transition-colors hover:text-primary-hover"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-subtle text-sm font-bold text-primary-hover">
                          #{inquiry.id}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">Tin đăng #{inquiry.listingId}</span>
                          <span className="block text-xs text-muted-foreground">
                            {inquiryStatusLabel(inquiry.status)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(inquiry.updatedAt).toLocaleDateString("vi-VN")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
        {result.data.length === 0 ? (
          <EmptyState
            title={
              parsed.state.status === undefined && parsed.state.businessStatus === undefined
                ? "Bạn chưa có tin đăng."
                : "Không có tin ở bộ lọc này."
            }
            action={
              parsed.state.status === undefined && parsed.state.businessStatus === undefined ? (
                <Button pending={createPending} pendingLabel="Đang tạo…" onClick={() => void createDraft()}>
                  Tạo tin mới
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {currentListings.length > 0 ? (
              <section aria-labelledby="current-owner-listings-heading" className="space-y-3">
                <h2 id="current-owner-listings-heading" className="text-xl font-bold text-rent-ink">
                  Tin đang quản lý
                </h2>
                {renderCards(currentListings)}
              </section>
            ) : null}
            {archivedListings.length > 0 ? (
              <section aria-labelledby="archived-owner-listings-heading" className="space-y-3">
                <div>
                  <h2 id="archived-owner-listings-heading" className="text-xl font-bold text-rent-ink">
                    Tin cũ / đã lưu trữ
                  </h2>
                  <p className="text-sm text-rent-secondary">
                    Tin đã thuê hoặc đã ngừng hoạt động được gom riêng để bạn dễ theo dõi và nhân bản khi cần.
                  </p>
                </div>
                {renderCards(archivedListings)}
              </section>
            ) : null}
          </>
        )}

        <Pagination
          ariaLabel="Phân trang tin của tôi"
          page={result.pagination.page}
          hasNextPage={result.pagination.hasNextPage}
          onPrevious={() => router.push(ownerListingsUrl(withOwnerPage(parsed.state, result.pagination.page - 1)))}
          onNext={() => router.push(ownerListingsUrl(withOwnerPage(parsed.state, result.pagination.page + 1)))}
        />
      </div>
    );
  }

  const committedState = parsed.ok ? parsed.state : { page: 1 };

  return (
    <section
      aria-labelledby="owner-listings-heading"
      className={`${styles.ownerPage} rm-workspace rm-workspace-page space-y-8 my-4`}
    >
      <header className="rm-workspace-hero" data-tone="accent">
        <div className="max-w-2xl space-y-2">
          <span className="rm-workspace-eyebrow">Khu vực chủ nhà</span>
          <h1 id="owner-listings-heading" className="rm-workspace-title mt-3">
            Quản lý tin cho thuê
          </h1>
          <p className="rm-workspace-description mt-3">
            Theo dõi trạng thái duyệt, chỉnh sửa chi tiết và cập nhật vòng đời tin đăng của bạn.
          </p>
        </div>
        {isLandlord ? (
          <Button
            pending={createPending}
            pendingLabel="Đang tạo…"
            onClick={() => void createDraft()}
            className="shrink-0"
          >
            Tạo tin mới
          </Button>
        ) : null}
      </header>

      {isLandlord && parsed.ok ? (
        <div className="rm-workspace-card grid max-w-2xl gap-4 p-4 sm:grid-cols-2">
          <SelectField
            id="owner-status-filter"
            name="status"
            label="Trạng thái"
            value={committedState.status ?? ""}
            onChange={(event) => {
              const status = event.target.value === "" ? undefined : (event.target.value as ListingStatus);
              router.push(ownerListingsUrl(withOwnerStatus(committedState, status)));
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {ownerListingStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="owner-business-status-filter"
            name="businessStatus"
            label="Tình trạng phòng"
            value={committedState.businessStatus ?? ""}
            onChange={(event) => {
              const businessStatus =
                event.target.value === "" ? undefined : (event.target.value as ListingBusinessStatus);
              router.push(ownerListingsUrl(withOwnerBusinessStatus(committedState, businessStatus)));
            }}
          >
            <option value="">Tất cả tình trạng</option>
            {ownerBusinessStatuses.map((businessStatus) => (
              <option key={businessStatus} value={businessStatus}>
                {businessStatusLabels[businessStatus]}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}

      {createFeedback ? (
        <p
          role="alert"
          className="rm-workspace-card border-l-4 border-danger bg-danger-subtle p-4 text-sm font-semibold text-danger"
        >
          {createFeedback}
        </p>
      ) : null}
      {duplicateFeedback ? (
        <p
          role="alert"
          className="rm-workspace-card border-l-4 border-danger bg-danger-subtle p-4 text-sm font-semibold text-danger"
        >
          {duplicateFeedback}
        </p>
      ) : null}
      {content}
    </section>
  );
}
