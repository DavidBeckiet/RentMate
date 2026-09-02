"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdminFilter,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminSummaryCard,
  AdminSummaryGrid,
  AdminToolbar
} from "../../components/ui/admin-workspace";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
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

  const updateStatus = (status: ListingStatus) =>
    router.push(adminListingsUrl(withAdminListingStatus(parsed.state, status)));
  const updatePage = (page: number) => router.push(adminListingsUrl(withAdminListingPage(parsed.state, page)));
  const visibleResult = loadState.status === "success" ? loadState.result : null;
  const visibleListings = visibleResult?.data ?? [];
  const openReportCount = visibleListings.reduce((total, listing) => total + listing.openReportCount, 0);
  const duplicateCount = visibleListings.filter((listing) => listing.possibleDuplicate).length;
  const pendingCount = visibleListings.filter((listing) => listing.status === "PENDING").length;

  return (
    <AdminPage labelledBy="admin-listings-heading">
      <AdminPageHeader
        eyebrow="Tổng quan vận hành · kiểm duyệt tin"
        title="Hàng đợi kiểm duyệt"
        titleId="admin-listings-heading"
        description="Một góc nhìn gọn để nhận biết tin cần xem, tín hiệu báo cáo và các trường hợp nên mở chi tiết. Số liệu bên dưới chỉ phản ánh trang dữ liệu hiện tại."
        icon="clipboard"
        tone={openReportCount > 0 || duplicateCount > 0 ? "attention" : "default"}
      />

      {visibleResult ? (
        <AdminSummaryGrid>
          <AdminSummaryCard
            label="Tin trong trang"
            value={numberFormatter.format(visibleListings.length)}
            note={`Trang ${visibleResult.pagination.page} · không phải tổng hệ thống`}
            icon="clipboard"
          />
          <AdminSummaryCard
            label="Tin chờ duyệt"
            value={numberFormatter.format(pendingCount)}
            note="Trong dữ liệu đang hiển thị"
            tone={pendingCount > 0 ? "attention" : "success"}
            icon="target"
          />
          <AdminSummaryCard
            label="Báo cáo mở"
            value={numberFormatter.format(openReportCount)}
            note="Gắn với các tin trong trang"
            tone={openReportCount > 0 ? "attention" : "muted"}
            icon="flag"
          />
          <AdminSummaryCard
            label="Tín hiệu trùng lặp"
            value={numberFormatter.format(duplicateCount)}
            note="Cần đối chiếu thủ công"
            tone={duplicateCount > 0 ? "attention" : "muted"}
            icon="search"
          />
        </AdminSummaryGrid>
      ) : null}

      <AdminToolbar
        summary={
          visibleResult
            ? `${visibleListings.length} bản ghi · page size ${visibleResult.pagination.pageSize}`
            : undefined
        }
      >
        <AdminFilter id="admin-listing-status" label="Trạng thái">
          <select
            id="admin-listing-status"
            name="status"
            value={parsed.state.status}
            onChange={(event) => updateStatus(event.currentTarget.value as ListingStatus)}
          >
            {adminListingStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </AdminFilter>
      </AdminToolbar>

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
        <AdminSection
          title="Danh sách tin"
          description="Mở từng tin để xem thông tin riêng tư được phép hiển thị, lịch sử kiểm duyệt và hành động phù hợp."
        >
          <div className="divide-y divide-border">
            {loadState.result.data.map((listing) => (
              <AdminListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </AdminSection>
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
    </AdminPage>
  );
}
