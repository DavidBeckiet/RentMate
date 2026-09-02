"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import {
  AdminDecisionPanel,
  AdminEvidence,
  AdminFilter,
  AdminPage,
  AdminPageHeader,
  AdminPill,
  AdminQueueCard,
  AdminSummaryCard,
  AdminSummaryGrid,
  AdminToolbar
} from "../../components/ui/admin-workspace";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminSupportRequest, ApiPage, SupportRequestCategory, SupportRequestStatus } from "../../types/api";

const statusLabels: Readonly<Record<SupportRequestStatus, string>> = {
  OPEN: "Mới",
  IN_PROGRESS: "Đang xử lý",
  RESOLVED: "Đã xử lý"
};

const categoryLabels: Readonly<Record<SupportRequestCategory, string>> = {
  ACCOUNT: "Tài khoản",
  LISTING: "Tin đăng",
  SAFETY: "An toàn và báo cáo",
  TECHNICAL: "Lỗi kỹ thuật",
  OTHER: "Vấn đề khác"
};

const statuses: readonly SupportRequestStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];

export function AdminSupportRequestsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [statusFilter, setStatusFilter] = useState<SupportRequestStatus>("OPEN");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<AdminSupportRequest> | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<AdminSupportRequest | null>(null);
  const [note, setNote] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!adminReady) return;
    const controller = new AbortController();
    setLoadStatus("loading");
    setError(null);
    setSelected(null);
    void api.admin
      .listSupportRequests({ status: statusFilter, page, pageSize: 20 }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          setLoadStatus("success");
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setLoadStatus("error");
        }
      });
    return () => controller.abort();
  }, [adminReady, page, retryKey, statusFilter]);

  const transition = async (next: Exclude<SupportRequestStatus, "OPEN">) => {
    if (!selected || actionPending) return;
    const normalizedNote = note.trim();
    if (next === "RESOLVED" && !normalizedNote) {
      setActionError("Cần nhập ghi chú trước khi đánh dấu đã xử lý.");
      return;
    }
    setActionPending(true);
    setActionError(null);
    try {
      const updated = await api.admin.updateSupportRequestStatus(selected.id, {
        status: next,
        note: normalizedNote || null
      });
      setSelected(updated);
      setNote("");
      setRetryKey((value) => value + 1);
    } catch (caught: unknown) {
      const apiError = caught instanceof ApiError ? caught : null;
      setActionError(
        apiError?.status === 409
          ? "Yêu cầu đã được cập nhật trước đó. Hãy tải lại danh sách."
          : "Chưa thể cập nhật yêu cầu hỗ trợ."
      );
    } finally {
      setActionPending(false);
    }
  };

  const requestsOnPage = result?.data ?? [];
  const unresolvedOnPage = requestsOnPage.filter((request) => request.status !== "RESOLVED").length;
  const safetyOnPage = requestsOnPage.filter((request) => request.category === "SAFETY").length;

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
  if (!adminReady) return <ErrorState message="Trang này dành cho quản trị viên." />;
  if (!mounted) return <LoadingState message="Đang kiểm tra tài khoản…" />;

  return (
    <AdminPage labelledBy="admin-support-heading" className="my-4 space-y-6">
      <AdminPageHeader
        eyebrow="Quản trị · Hỗ trợ"
        title="Yêu cầu hỗ trợ"
        titleId="admin-support-heading"
        icon="message"
        tone="info"
        description="Tiếp nhận vấn đề do người thuê và chủ trọ gửi từ Trung tâm trợ giúp. Chỉ hiển thị thông tin cần thiết cho việc xử lý."
      />

      <AdminToolbar summary={`${requestsOnPage.length} yêu cầu trong trang`}>
        <AdminFilter id="admin-support-status" label="Trạng thái">
          <select
            id="admin-support-status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as SupportRequestStatus);
              setPage(1);
            }}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </AdminFilter>
      </AdminToolbar>

      {loadStatus === "success" && result ? (
        <AdminSummaryGrid>
          <AdminSummaryCard
            label="Yêu cầu trong trang"
            value={requestsOnPage.length}
            note="Dữ liệu trang hiện tại"
            icon="message"
          />
          <AdminSummaryCard
            label="Chưa hoàn tất"
            value={unresolvedOnPage}
            tone="attention"
            note="Theo bộ lọc hiện tại"
            icon="bell"
          />
          <AdminSummaryCard
            label="Liên quan an toàn"
            value={safetyOnPage}
            tone="info"
            note="Cần đọc kỹ ngữ cảnh"
            icon="shield"
          />
        </AdminSummaryGrid>
      ) : null}

      {loadStatus === "loading" || loadStatus === "idle" ? <LoadingState message="Đang tải yêu cầu hỗ trợ…" /> : null}
      {loadStatus === "error" ? (
        <ErrorState
          message={error?.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Không thể tải hàng đợi hỗ trợ."}
          requestId={error?.requestId}
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}
      {loadStatus === "success" && result?.data.length === 0 ? (
        <EmptyState
          title="Không có yêu cầu ở trạng thái này"
          description="Hãy chọn trạng thái khác hoặc quay lại sau."
        />
      ) : null}
      {loadStatus === "success" && result && result.data.length > 0 ? (
        <div className="rm-admin-queue-layout">
          <div className="rm-admin-queue" aria-label="Danh sách yêu cầu hỗ trợ">
            {result.data.map((request) => (
              <AdminQueueCard key={request.id} selected={selected?.id === request.id}>
                <div className="rm-admin-queue-card__meta">
                  <span>
                    #{request.id} · {categoryLabels[request.category]}
                  </span>
                  <AdminPill
                    tone={
                      request.status === "OPEN" ? "attention" : request.status === "IN_PROGRESS" ? "info" : "success"
                    }
                  >
                    {statusLabels[request.status]}
                  </AdminPill>
                </div>
                <h2 className="rm-admin-queue-card__title">{request.subject}</h2>
                <p className="rm-admin-queue-card__body line-clamp-3">{request.message}</p>
                <div className="rm-admin-queue-card__footer">
                  <span>
                    {request.requester.email} · {request.requester.role === "TENANT" ? "Người thuê" : "Chủ trọ"}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSelected(request);
                      setNote("");
                      setActionError(null);
                    }}
                  >
                    Xem &amp; xử lý
                  </Button>
                </div>
              </AdminQueueCard>
            ))}
            <Pagination
              ariaLabel="Phân trang yêu cầu hỗ trợ"
              page={result.pagination.page}
              hasNextPage={result.pagination.hasNextPage}
              onPrevious={() => setPage((value) => value - 1)}
              onNext={() => setPage((value) => value + 1)}
            />
          </div>

          <aside className="rm-admin-detail" aria-label="Chi tiết yêu cầu hỗ trợ">
            {selected ? (
              <>
                <div className="rm-admin-detail__header">
                  <p className="rm-admin-detail__eyebrow">{statusLabels[selected.status]}</p>
                  <h2 className="rm-admin-detail__title">{selected.subject}</h2>
                  <p className="rm-admin-detail__meta">
                    #{selected.id} · {selected.requester.email}
                  </p>
                </div>
                <div className="space-y-4 py-5">
                  <AdminEvidence title="Chủ đề" icon="note" tone="info">
                    <p className="font-semibold">{categoryLabels[selected.category]}</p>
                  </AdminEvidence>
                  <AdminEvidence title="Nội dung yêu cầu" icon="message" tone="muted">
                    <p className="whitespace-pre-wrap">{selected.message}</p>
                  </AdminEvidence>
                  {selected.resolutionNote ? (
                    <AdminEvidence title="Ghi chú xử lý" icon="check" tone="success">
                      <p className="whitespace-pre-wrap">{selected.resolutionNote}</p>
                    </AdminEvidence>
                  ) : null}
                </div>
                {selected.status !== "RESOLVED" ? (
                  <AdminDecisionPanel
                    title="Cập nhật trạng thái"
                    description="Ghi chú bắt buộc khi đánh dấu yêu cầu đã xử lý."
                  >
                    {selected.status === "OPEN" ? (
                      <Button
                        variant="secondary"
                        pending={actionPending}
                        onClick={() => void transition("IN_PROGRESS")}
                      >
                        Bắt đầu xử lý
                      </Button>
                    ) : null}
                    <label className="rm-admin-field-label" htmlFor="support-resolution-note">
                      Ghi chú xử lý
                      <textarea
                        id="support-resolution-note"
                        rows={4}
                        maxLength={2000}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="rm-admin-textarea mt-2"
                      />
                    </label>
                    <Button pending={actionPending} onClick={() => void transition("RESOLVED")}>
                      Đánh dấu đã xử lý
                    </Button>
                    {actionError ? (
                      <p role="alert" className="text-sm font-bold text-danger">
                        {actionError}
                      </p>
                    ) : null}
                  </AdminDecisionPanel>
                ) : null}
              </>
            ) : (
              <EmptyState title="Chọn một yêu cầu" description="Chi tiết và thao tác xử lý sẽ xuất hiện tại đây." />
            )}
          </aside>
        </div>
      ) : null}
    </AdminPage>
  );
}
