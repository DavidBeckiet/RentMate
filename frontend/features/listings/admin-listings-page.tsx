"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { SelectField } from "../../components/ui/form-controls";
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
    <section className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-700">Quản trị</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Hàng đợi kiểm duyệt</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Đọc trạng thái hiện tại trước khi thực hiện một hành động kiểm duyệt.
        </p>
      </header>

      <div className="max-w-sm">
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
        <div className="space-y-4">
          {loadState.result.data.map((listing) => (
            <AdminListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : null}
      {loadState.status === "success" ? (
        <nav aria-label="Phân trang hàng đợi kiểm duyệt" className="flex items-center justify-between gap-4">
          <Button
            variant="secondary"
            disabled={loadState.result.pagination.page <= 1}
            onClick={() => updatePage(loadState.result.pagination.page - 1)}
          >
            Trang trước
          </Button>
          <span className="text-sm text-slate-600">Trang {loadState.result.pagination.page}</span>
          <Button
            variant="secondary"
            disabled={!loadState.result.pagination.hasNextPage}
            onClick={() => updatePage(loadState.result.pagination.page + 1)}
          >
            Trang sau
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
