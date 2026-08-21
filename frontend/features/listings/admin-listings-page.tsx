"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { SelectField } from "../../components/ui/form-controls";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, AdminListingSummary, ListingStatus } from "../../types/api";
import { AdminListingCard } from "./admin-listing-card";
import {
  adminListingStatuses,
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

export function AdminListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const parsed = useMemo(() => parseAdminListingQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestId = useRef(0);
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const queryIdentity = parsed.ok ? JSON.stringify(parsed.state) : "invalid";

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
          <Link href="/admin/login" className="font-semibold text-teal-800 underline">
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

  const updateStatus = (status: ListingStatus) =>
    router.push(adminListingsUrl(withAdminListingStatus(parsed.state, status)));
  const updatePage = (page: number) => router.push(adminListingsUrl(withAdminListingPage(parsed.state, page)));

  return (
    <section className={`${styles.adminPage} rm-workspace space-y-8 my-4`}>
      <header className="flex flex-col gap-4 border-2 border-heroDark-950 bg-rent-yellow p-6 shadow-glass sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="max-w-2xl space-y-2">
          <span className="rm-eyebrow">QUẢN TRỊ VIÊN</span>
          <h1 className="font-display text-4xl font-bold tracking-[-0.055em] text-rent-ink sm:text-6xl">
            Hàng đợi kiểm duyệt
          </h1>
          <p className="text-sm font-medium text-slate-600 leading-relaxed">
            Đánh giá chất lượng hình ảnh, tiện ích và khu vực tin đăng trước khi duyệt hoặc từ chối.
          </p>
        </div>
      </header>

      <div className="max-w-xs border-2 border-heroDark-950 bg-rent-surface p-4 shadow-glass-sm">
        <SelectField
          id="admin-listing-status"
          name="status"
          label="Trạng thái"
          value={parsed.state.status}
          onChange={(event) => updateStatus(event.currentTarget.value as ListingStatus)}
        >
          {adminListingStatuses.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </SelectField>
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
          description="Hãy chọn một trạng thái khác hoặc quay lại sau."
        />
      ) : null}
      {loadState.status === "success" && loadState.result.data.length > 0 ? (
        <div className="divide-y-2 divide-heroDark-950 overflow-hidden border-2 border-heroDark-950 bg-rent-surface shadow-glass">
          {loadState.result.data.map((listing) => (
            <AdminListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : null}
      {loadState.status === "success" ? (
        <Pagination
          ariaLabel="Phân trang hàng đợi kiểm duyệt"
          page={loadState.result.pagination.page}
          hasNextPage={loadState.result.pagination.hasNextPage}
          onPrevious={() => updatePage(loadState.result.pagination.page - 1)}
          onNext={() => updatePage(loadState.result.pagination.page + 1)}
        />
      ) : null}
    </section>
  );
}
