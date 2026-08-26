"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
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

  return (
    <section className="rm-workspace my-4 space-y-8" aria-labelledby="admin-support-heading">
      <header className="border-2 border-heroDark-950 bg-rent-yellow p-6 shadow-glass sm:p-8">
        <span className="rm-eyebrow">QUẢN TRỊ · HỖ TRỢ</span>
        <h1 id="admin-support-heading" className="mt-4 font-display text-4xl font-bold tracking-[-0.055em] sm:text-6xl">
          Yêu cầu hỗ trợ
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-700">
          Tiếp nhận các vấn đề do người thuê và chủ trọ gửi từ Trung tâm trợ giúp. Chỉ hiển thị thông tin cần thiết cho
          việc xử lý.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-2 border-heroDark-950 bg-rent-surface p-4 shadow-glass-sm">
        <label className="flex min-h-11 items-center gap-3 text-sm font-bold" htmlFor="admin-support-status">
          Trạng thái
          <select
            id="admin-support-status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as SupportRequestStatus);
              setPage(1);
            }}
            className="min-h-11 border-2 border-heroDark-950 bg-white px-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-rent-coral"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.82fr)]">
          <div className="space-y-3" aria-label="Danh sách yêu cầu hỗ trợ">
            {result.data.map((request) => (
              <article
                key={request.id}
                className={`border-2 border-heroDark-950 p-5 shadow-glass-sm ${selected?.id === request.id ? "bg-rent-accent" : "bg-rent-surface"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.1em]">
                  <span>
                    #{request.id} · {categoryLabels[request.category]}
                  </span>
                  <span className="border-2 border-heroDark-950 bg-rent-yellow px-2 py-1">
                    {statusLabels[request.status]}
                  </span>
                </div>
                <h2 className="mt-4 font-display text-xl font-bold">{request.subject}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-rent-secondary">{request.message}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-heroDark-950 pt-3 text-xs font-semibold text-rent-secondary">
                  <span>
                    {request.requester.email} · {request.requester.role === "TENANT" ? "Người thuê" : "Chủ trọ"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(request);
                      setNote("");
                      setActionError(null);
                    }}
                    className="min-h-10 border-2 border-heroDark-950 bg-white px-3 font-bold text-heroDark-950 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rent-coral"
                  >
                    Xem &amp; xử lý
                  </button>
                </div>
              </article>
            ))}
            <Pagination
              ariaLabel="Phân trang yêu cầu hỗ trợ"
              page={result.pagination.page}
              hasNextPage={result.pagination.hasNextPage}
              onPrevious={() => setPage((value) => value - 1)}
              onNext={() => setPage((value) => value + 1)}
            />
          </div>

          <aside
            className="border-2 border-heroDark-950 bg-rent-surface p-5 shadow-glass sm:p-6"
            aria-label="Chi tiết yêu cầu hỗ trợ"
          >
            {selected ? (
              <>
                <div className="border-b-2 border-heroDark-950 pb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-rent-secondary">
                    {statusLabels[selected.status]}
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-bold">{selected.subject}</h2>
                  <p className="mt-2 text-xs font-semibold text-rent-secondary">
                    #{selected.id} · {selected.requester.email}
                  </p>
                </div>
                <dl className="space-y-4 py-5 text-sm">
                  <div>
                    <dt className="font-bold text-rent-secondary">Chủ đề</dt>
                    <dd className="mt-1 font-semibold">{categoryLabels[selected.category]}</dd>
                  </div>
                  <div>
                    <dt className="font-bold text-rent-secondary">Nội dung</dt>
                    <dd className="mt-1 whitespace-pre-wrap leading-6">{selected.message}</dd>
                  </div>
                  {selected.resolutionNote ? (
                    <div>
                      <dt className="font-bold text-rent-secondary">Ghi chú xử lý</dt>
                      <dd className="mt-1 whitespace-pre-wrap leading-6">{selected.resolutionNote}</dd>
                    </div>
                  ) : null}
                </dl>
                {selected.status !== "RESOLVED" ? (
                  <div className="space-y-4 border-t-2 border-heroDark-950 pt-5">
                    {selected.status === "OPEN" ? (
                      <Button
                        variant="secondary"
                        pending={actionPending}
                        onClick={() => void transition("IN_PROGRESS")}
                      >
                        Bắt đầu xử lý
                      </Button>
                    ) : null}
                    <label className="block text-sm font-bold" htmlFor="support-resolution-note">
                      Ghi chú xử lý
                      <textarea
                        id="support-resolution-note"
                        rows={4}
                        maxLength={2000}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="mt-2 w-full border-2 border-heroDark-950 bg-white p-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-rent-coral"
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
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState title="Chọn một yêu cầu" description="Chi tiết và thao tác xử lý sẽ xuất hiện tại đây." />
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
