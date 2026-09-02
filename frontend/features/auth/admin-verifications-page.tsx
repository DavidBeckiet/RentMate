"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPage, AdminSummaryCard, AdminSummaryGrid } from "../../components/ui/admin-workspace";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminLandlordVerification, ApiPage, VerificationStatus } from "../../types/api";

const statuses: readonly VerificationStatus[] = ["PENDING", "APPROVED", "REJECTED"];
const statusLabels: Record<VerificationStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã xác minh",
  REJECTED: "Đã từ chối"
};

export function AdminVerificationsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [mounted, setMounted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<VerificationStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<AdminLandlordVerification> | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [selected, setSelected] = useState<AdminLandlordVerification | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!adminReady) return;
    const controller = new AbortController();
    setLoadState("loading");
    setSelected(null);
    setMessage(null);
    void api.admin
      .listVerifications({ status: statusFilter, page, pageSize: 20 }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          setLoadState("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("error");
      });
    return () => controller.abort();
  }, [adminReady, page, retryKey, statusFilter]);

  const openDetail = async (verificationId: number) => {
    setDetailLoading(true);
    setMessage(null);
    setNote("");
    try {
      setSelected(await api.admin.getVerification(verificationId));
    } catch {
      setMessage("Không thể tải chi tiết yêu cầu xác minh.");
    } finally {
      setDetailLoading(false);
    }
  };

  const decide = async (status: "APPROVED" | "REJECTED") => {
    if (!selected) return;
    if (!note.trim()) {
      setMessage("Cần nhập ghi chú quyết định.");
      return;
    }
    setActionPending(true);
    setMessage(null);
    try {
      setSelected(await api.admin.reviewVerification(selected.id, { status, note: note.trim() }));
      setNote("");
      setRetryKey((value) => value + 1);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setMessage(
        apiError?.status === 409
          ? "Yêu cầu đã được xử lý bởi một quản trị viên khác."
          : "Chưa thể lưu quyết định xác minh."
      );
    } finally {
      setActionPending(false);
    }
  };

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên."
        action={<Link href="/admin/login">Đăng nhập quản trị</Link>}
      />
    );
  }
  if (authStatus === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  const visibleVerifications = loadState === "success" && result ? result.data : [];
  const pendingVerifications = visibleVerifications.filter((verification) => verification.status === "PENDING").length;
  const activeLandlords = visibleVerifications.filter((verification) => verification.landlord.isActive).length;

  if (!adminReady) return <ErrorState message="Trang này dành cho quản trị viên." />;
  if (!mounted) return <LoadingState message="Đang kiểm tra tài khoản…" />;

  return (
    <AdminPage labelledBy="verifications-heading">
      <header className="rm-admin-hero rm-admin-hero--info">
        <span className="rm-admin-eyebrow">
          <Icon name="shield" className="h-4 w-4" /> Identity review
        </span>
        <h1 id="verifications-heading" className="rm-admin-title">
          Xác minh chủ trọ
        </h1>
        <p>Duyệt thủ công hồ sơ và thông tin liên hệ hiện có. Không thu giấy tờ và không coi đây là eKYC.</p>
      </header>
      <div className="space-y-5">
        <div className="rm-admin-toolbar">
          <label className="rm-admin-filter">
            Trạng thái
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as VerificationStatus);
                setPage(1);
              }}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loadState === "success" ? (
          <AdminSummaryGrid>
            <AdminSummaryCard
              label="Yêu cầu trong trang"
              value={visibleVerifications.length}
              note={`Trang ${result?.pagination.page ?? page} · không phải tổng hệ thống`}
              icon="shield"
            />
            <AdminSummaryCard
              label="Đang chờ quyết định"
              value={pendingVerifications}
              note="Cần đọc bằng chứng trước khi chọn"
              tone={pendingVerifications > 0 ? "attention" : "success"}
              icon="target"
            />
            <AdminSummaryCard
              label="Tài khoản đang hoạt động"
              value={activeLandlords}
              note="Theo dữ liệu yêu cầu hiện tại"
              tone="info"
              icon="user"
            />
            <AdminSummaryCard
              label="Trạng thái đang xem"
              value={statusLabels[statusFilter]}
              note="Bộ lọc hiện tại"
              tone="muted"
              icon="sliders"
            />
          </AdminSummaryGrid>
        ) : null}

        {loadState === "loading" || loadState === "idle" ? <LoadingState message="Đang tải yêu cầu xác minh…" /> : null}
        {loadState === "error" ? (
          <ErrorState
            message="Không thể tải hàng đợi xác minh."
            action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
          />
        ) : null}
        {loadState === "success" && result?.data.length === 0 ? (
          <EmptyState
            title="Không có yêu cầu ở trạng thái này"
            description="Hãy chọn trạng thái khác hoặc quay lại sau."
          />
        ) : null}

        {loadState === "success" && result && result.data.length > 0 ? (
          <div className="rm-admin-queue-layout">
            <div className="rm-admin-queue" aria-label="Danh sách yêu cầu xác minh">
              {result.data.map((verification) => (
                <article
                  className="rm-admin-queue-card"
                  data-selected={selected?.id === verification.id}
                  key={verification.id}
                >
                  <div className="rm-admin-queue-card__meta">
                    <span>#{verification.id}</span>
                    <span>{statusLabels[verification.status]}</span>
                  </div>
                  <h2 className="rm-admin-queue-card__title">{verification.displayName}</h2>
                  <p className="rm-admin-queue-card__body">{verification.landlord.email}</p>
                  <p className="rm-admin-queue-card__body">{verification.requestNote ?? "Không có ghi chú bổ sung."}</p>
                  <button
                    type="button"
                    className="mt-4 inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 py-2 text-ui-sm font-semibold text-primary-foreground"
                    onClick={() => void openDetail(verification.id)}
                  >
                    Xem & duyệt
                  </button>
                </article>
              ))}
              <Pagination
                ariaLabel="Phân trang xác minh"
                page={result.pagination.page}
                hasNextPage={result.pagination.hasNextPage}
                onPrevious={() => setPage((value) => value - 1)}
                onNext={() => setPage((value) => value + 1)}
              />
            </div>
            <aside className="rm-admin-detail p-5 sm:p-6" aria-label="Chi tiết xác minh">
              {detailLoading ? (
                <LoadingState message="Đang tải chi tiết…" />
              ) : selected ? (
                <>
                  <span className="rm-admin-pill rm-admin-pill--info">{statusLabels[selected.status]}</span>
                  <h2 className="mt-3 font-display text-2xl font-bold text-foreground">Yêu cầu #{selected.id}</h2>
                  <dl>
                    <div>
                      <dt>Tên hiển thị</dt>
                      <dd>{selected.displayName}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{selected.landlord.email}</dd>
                    </div>
                    <div>
                      <dt>Điện thoại</dt>
                      <dd>{selected.landlord.phone ?? "Không có"}</dd>
                    </div>
                    <div>
                      <dt>Tài khoản</dt>
                      <dd>{selected.landlord.isActive ? "Đang hoạt động" : "Đã vô hiệu hóa"}</dd>
                    </div>
                    <div>
                      <dt>Ghi chú gửi lên</dt>
                      <dd>{selected.requestNote ?? "Không có"}</dd>
                    </div>
                    {selected.decisionNote ? (
                      <div>
                        <dt>Quyết định</dt>
                        <dd>{selected.decisionNote}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {selected.status === "PENDING" ? (
                    <div className="rm-admin-decision-panel">
                      <label htmlFor="verification-decision-note">Ghi chú quyết định</label>
                      <textarea
                        id="verification-decision-note"
                        rows={4}
                        maxLength={1000}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                      <div>
                        <Button pending={actionPending} onClick={() => void decide("APPROVED")}>
                          Duyệt hồ sơ
                        </Button>
                        <Button variant="danger" pending={actionPending} onClick={() => void decide("REJECTED")}>
                          Từ chối
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {message ? (
                    <p className="mt-4 border-l-2 border-danger pl-3 text-ui-sm font-semibold text-danger" role="alert">
                      {message}
                    </p>
                  ) : null}
                </>
              ) : message ? (
                <p className="mt-4 border-l-2 border-danger pl-3 text-ui-sm font-semibold text-danger" role="alert">
                  {message}
                </p>
              ) : (
                <EmptyState title="Chọn một yêu cầu để duyệt" description="Thông tin hồ sơ sẽ xuất hiện tại đây." />
              )}
            </aside>
          </div>
        ) : null}
      </div>
    </AdminPage>
  );
}
