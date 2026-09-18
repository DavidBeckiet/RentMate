"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, AdminListingSummary, ListingStatus } from "../../types/api";
import { AdminListingCard } from "./admin-listing-card";
import {
  adminListingStatuses,
  adminListingDetailUrl,
  adminListingsUrl,
  parseAdminListingQuery,
  toAdminListingQuery,
  withAdminListingPage,
  withAdminListingStatus
} from "./admin-listing-query";
import styles from "./admin-listings-page.module.css";

const statusLabels: Record<ListingStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
  HIDDEN: "Đã ẩn",
  DRAFT: "Bản nháp",
  INACTIVE: "Ngừng hoạt động"
};

type LoadState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "success"; readonly result: ApiPage<AdminListingSummary> }
  | { readonly status: "error"; readonly error: ApiError | null };

const numberFormatter = new Intl.NumberFormat("vi-VN");

export function AdminListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const parsed = useMemo(() => parseAdminListingQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const [mounted, setMounted] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [reloadVersion, setReloadVersion] = useState(0);
  const [listingIdInput, setListingIdInput] = useState("");
  const requestId = useRef(0);
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const queryIdentity = parsed.ok ? JSON.stringify(parsed.state) : "invalid";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!adminReady || !parsed.ok) return;
    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    setLoadState({ status: "loading" });
    void api.admin
      .listListings(toAdminListingQuery(parsed.state), controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && currentRequest === requestId.current) {
          setLoadState({ status: "success", result });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || currentRequest !== requestId.current) return;
        const apiError = error instanceof ApiError ? error : null;
        setLoadState({ status: "error", error: apiError });
        if (apiError?.status === 401) void refresh();
      });
    return () => controller.abort();
  }, [adminReady, parsed, queryIdentity, refresh, reloadVersion]);

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
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
  if (!user || user.role !== "ADMIN") return <ErrorState message="Trang này dành cho quản trị viên." />;
  if (!parsed.ok) return <ErrorState message={parsed.message} />;
  if (!mounted) return <LoadingState message="Đang kiểm tra tài khoản…" />;

  const updatePage = (page: number) => router.push(adminListingsUrl(withAdminListingPage(parsed.state, page)));
  const visibleResult = loadState.status === "success" ? loadState.result : null;
  const visibleListings = visibleResult?.data ?? [];
  const emptyLaterPage = Boolean(visibleResult && visibleListings.length === 0 && visibleResult.pagination.page > 1);
  const openReportCount = visibleListings.reduce((total, listing) => total + listing.openReportCount, 0);
  const duplicateCount = visibleListings.filter((listing) => listing.possibleDuplicate).length;
  const normalizedListingId = listingIdInput.trim();
  const listingId = /^[1-9][0-9]*$/.test(normalizedListingId) ? Number(normalizedListingId) : null;
  const canOpenListing = listingId !== null && Number.isSafeInteger(listingId);

  return (
    <section aria-labelledby="admin-listings-heading" className={styles.page}>
      <header className={styles.header}>
        <h1 id="admin-listings-heading" className={styles.title}>
          Kiểm duyệt tin
        </h1>
      </header>

      <nav aria-label="Lọc tin theo trạng thái" className={styles.statusNavigation}>
        {adminListingStatuses.map((status) => (
          <Link
            key={status}
            href={adminListingsUrl(withAdminListingStatus(parsed.state, status))}
            prefetch={false}
            aria-current={parsed.state.status === status ? "page" : undefined}
            className={styles.statusLink}
          >
            {statusLabels[status]}
          </Link>
        ))}
      </nav>

      <div className={styles.toolbar}>
        {visibleResult ? (
          <div aria-label="Số liệu trong trang hiện tại" className={styles.pageSummary}>
            <span className={styles.summaryCount}>
              {numberFormatter.format(visibleListings.length)} tin trong trang này
            </span>
            {openReportCount > 0 ? (
              <span className={styles.summarySignal}>{numberFormatter.format(openReportCount)} báo cáo mở</span>
            ) : null}
            {duplicateCount > 0 ? (
              <span className={styles.summarySignal}>{numberFormatter.format(duplicateCount)} nghi trùng</span>
            ) : null}
          </div>
        ) : (
          <span className={styles.queueContext}>Đang xem: {statusLabels[parsed.state.status]}</span>
        )}
        <form
          aria-label="Mở tin bằng mã"
          className={styles.idForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (canOpenListing && listingId !== null) {
              router.push(adminListingDetailUrl(listingId, parsed.state));
            }
          }}
        >
          <label htmlFor="admin-listing-id" className={styles.idLabel}>
            Mở theo mã tin
          </label>
          <input
            id="admin-listing-id"
            name="listingId"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ví dụ: 123"
            value={listingIdInput}
            onChange={(event) => setListingIdInput(event.currentTarget.value)}
            className={styles.idInput}
          />
          <Button type="submit" variant="secondary" disabled={!canOpenListing} className={styles.idSubmit}>
            Mở tin
          </Button>
        </form>
      </div>

      {loadState.status === "idle" || loadState.status === "loading" ? (
        <LoadingState message="Đang tải hàng đợi kiểm duyệt…" />
      ) : null}
      {loadState.status === "error" ? (
        <ErrorState
          message={
            loadState.error?.status === 401 ? "Phiên đăng nhập không còn hợp lệ." : "Không thể tải hàng đợi kiểm duyệt."
          }
          requestId={loadState.error?.requestId}
          action={<Button onClick={() => setReloadVersion((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}
      {loadState.status === "success" && loadState.result.data.length === 0 ? (
        <EmptyState
          title="Không có tin nào ở trạng thái này"
          description={
            emptyLaterPage
              ? "Trang này không còn tin đăng. Dữ liệu có thể đã thay đổi trong khi bạn đang xem."
              : "Hãy chọn một trạng thái khác hoặc quay lại sau."
          }
          action={
            emptyLaterPage ? (
              <Button variant="secondary" onClick={() => updatePage(loadState.result.pagination.page - 1)}>
                Quay lại trang trước
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {loadState.status === "success" && loadState.result.data.length > 0 ? (
        <section aria-label="Hàng đợi kiểm duyệt" className={styles.queue}>
          <div aria-hidden="true" className={styles.columnHeadings}>
            <span>Tin đăng</span>
            <span>Khu vực</span>
            <span>Người đăng</span>
            <span>Cập nhật</span>
            <span>Tín hiệu</span>
            <span className={styles.actionHeading}>Chi tiết</span>
          </div>
          <div className={styles.rows}>
            {loadState.result.data.map((listing) => (
              <AdminListingCard
                key={listing.id}
                listing={listing}
                detailHref={adminListingDetailUrl(listing.id, parsed.state)}
              />
            ))}
          </div>
        </section>
      ) : null}
      {loadState.status === "success" ? (
        <Pagination
          ariaLabel="Phân trang hàng đợi kiểm duyệt"
          page={loadState.result.pagination.page}
          hasNextPage={loadState.result.pagination.hasNextPage}
          onPrevious={() => updatePage(loadState.result.pagination.page - 1)}
          onNext={() => updatePage(loadState.result.pagination.page + 1)}
          variant="moderation"
        />
      ) : null}
    </section>
  );
}
