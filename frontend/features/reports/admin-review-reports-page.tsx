"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminReviewReport, ApiPage, ReviewReportCategory, ReviewReportStatus } from "../../types/api";
import styles from "./admin-reports-page.module.css";

const statusLabels: Record<ReviewReportStatus, string> = {
  OPEN: "Mới",
  INVESTIGATING: "Đang điều tra",
  RESOLVED: "Đã xử lý",
  DISMISSED: "Đã bác bỏ"
};

const categoryLabels: Record<ReviewReportCategory, string> = {
  INACCURATE: "Không chính xác",
  OFFENSIVE: "Xúc phạm",
  HARASSMENT: "Quấy rối",
  SPAM: "Spam",
  OTHER: "Khác"
};

const statuses: readonly ReviewReportStatus[] = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"];
const categories: readonly ReviewReportCategory[] = ["INACCURATE", "OFFENSIVE", "HARASSMENT", "SPAM", "OTHER"];

export function AdminReviewReportsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [statusFilter, setStatusFilter] = useState<ReviewReportStatus>("OPEN");
  const [categoryFilter, setCategoryFilter] = useState<ReviewReportCategory | "">("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<AdminReviewReport> | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<AdminReviewReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
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
      .listReviewReports(
        { status: statusFilter, ...(categoryFilter ? { category: categoryFilter } : {}), page, pageSize: 20 },
        controller.signal
      )
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
  }, [adminReady, categoryFilter, page, retryKey, statusFilter]);

  const openDetail = async (reportId: number) => {
    setDetailLoading(true);
    setActionError(null);
    setNote("");
    try {
      setSelected(await api.admin.getReviewReport(reportId));
    } catch {
      setActionError("Không thể tải chi tiết báo cáo review.");
    } finally {
      setDetailLoading(false);
    }
  };

  const transition = async (next: "INVESTIGATING" | "RESOLVED" | "DISMISSED") => {
    if (!selected) return;
    if ((next === "RESOLVED" || next === "DISMISSED") && !note.trim()) {
      setActionError("Cần nhập ghi chú kết luận trước khi hoàn tất.");
      return;
    }
    setActionPending(true);
    setActionError(null);
    try {
      const updated = await api.admin.updateReviewReportStatus(selected.id, {
        status: next,
        note: note.trim() || null
      });
      setSelected(updated);
      setNote("");
      setRetryKey((value) => value + 1);
    } catch {
      setActionError("Chưa thể cập nhật báo cáo review.");
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
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!adminReady) return <ErrorState message="Trang này dành cho quản trị viên." />;

  return (
    <section className={styles.page} aria-labelledby="review-reports-heading">
      <header className={styles.header}>
        <span>TRUST &amp; SAFETY · REVIEW</span>
        <h1 id="review-reports-heading">
          Báo cáo <em>review</em>
        </h1>
        <p>Kiểm tra nội dung review bị báo cáo và lưu lại lý do cho mọi quyết định xử lý.</p>
      </header>
      <div className={styles.workspace}>
        <div className={styles.filters}>
          <label>
            Trạng thái
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as ReviewReportStatus);
                setPage(1);
              }}
            >
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Loại báo cáo
            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value as ReviewReportCategory | "");
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {categoryLabels[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loadStatus === "loading" || loadStatus === "idle" ? <LoadingState message="Đang tải báo cáo review…" /> : null}
        {loadStatus === "error" ? (
          <ErrorState
            message={error?.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Không thể tải hàng đợi báo cáo review."}
            requestId={error?.requestId}
            action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
          />
        ) : null}
        {loadStatus === "success" && result?.data.length === 0 ? (
          <EmptyState
            title="Không có báo cáo ở trạng thái này"
            description="Hãy chọn trạng thái hoặc loại báo cáo khác."
          />
        ) : null}
        {loadStatus === "success" && result && result.data.length > 0 ? (
          <div className={styles.layout}>
            <div className={styles.queue} aria-label="Danh sách báo cáo review">
              {result.data.map((report) => (
                <article key={report.id} className={styles.card} data-selected={selected?.id === report.id}>
                  <div className={styles.cardMeta}>
                    <span>#{report.id}</span>
                    <span>{statusLabels[report.status]}</span>
                  </div>
                  <h2>Review #{report.reviewId}</h2>
                  <p className={styles.category}>
                    {categoryLabels[report.category]} · Listing #{report.listingId}
                  </p>
                  <p>{report.details ?? "Không có mô tả bổ sung."}</p>
                  <div className={styles.cardFooter}>
                    <span>Người dùng #{report.reporterId}</span>
                    <button type="button" onClick={() => void openDetail(report.id)}>
                      Xem &amp; xử lý
                    </button>
                  </div>
                </article>
              ))}
              <Pagination
                ariaLabel="Phân trang báo cáo review"
                page={result.pagination.page}
                hasNextPage={result.pagination.hasNextPage}
                onPrevious={() => setPage((value) => value - 1)}
                onNext={() => setPage((value) => value + 1)}
              />
            </div>
            <aside className={styles.detail} aria-label="Chi tiết xử lý báo cáo review">
              {detailLoading ? (
                <LoadingState message="Đang tải chi tiết…" />
              ) : selected ? (
                <>
                  <div className={styles.detailHeading}>
                    <span>{statusLabels[selected.status]}</span>
                    <h2>Báo cáo #{selected.id}</h2>
                    <Link href={`/listings/${selected.listingId}`}>Mở tin đăng</Link>
                  </div>
                  <dl>
                    <div>
                      <dt>Đối tượng</dt>
                      <dd>
                        Review #{selected.reviewId} · Listing #{selected.listingId}
                      </dd>
                    </div>
                    <div>
                      <dt>Người báo cáo</dt>
                      <dd>Người dùng #{selected.reporterId}</dd>
                    </div>
                    <div>
                      <dt>Lý do</dt>
                      <dd>{categoryLabels[selected.category]}</dd>
                    </div>
                    <div>
                      <dt>Chi tiết</dt>
                      <dd>{selected.details ?? "Không có"}</dd>
                    </div>
                  </dl>
                  <section className={styles.timeline}>
                    <h3>Lịch sử xử lý</h3>
                    {selected.events?.map((event) => (
                      <div key={event.id}>
                        <span>{statusLabels[event.newStatus]}</span>
                        <p>{event.note ?? "Không có ghi chú"}</p>
                        <time>{new Date(event.createdAt).toLocaleString("vi-VN")}</time>
                      </div>
                    ))}
                  </section>
                  {selected.status === "OPEN" || selected.status === "INVESTIGATING" ? (
                    <div className={styles.actions}>
                      {selected.status === "OPEN" ? (
                        <Button pending={actionPending} onClick={() => void transition("INVESTIGATING")}>
                          Bắt đầu điều tra
                        </Button>
                      ) : null}
                      <label htmlFor="review-report-resolution-note">Ghi chú kết luận</label>
                      <textarea
                        id="review-report-resolution-note"
                        rows={4}
                        maxLength={2000}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                      <div>
                        {selected.status === "OPEN" ? (
                          <Button variant="danger" pending={actionPending} onClick={() => void transition("DISMISSED")}>
                            Bác bỏ report
                          </Button>
                        ) : (
                          <Button pending={actionPending} onClick={() => void transition("RESOLVED")}>
                            Đánh dấu đã xử lý
                          </Button>
                        )}
                      </div>
                      {actionError ? <p role="alert">{actionError}</p> : null}
                    </div>
                  ) : null}
                </>
              ) : actionError ? (
                <p className={styles.detailError} role="alert">
                  {actionError}
                </p>
              ) : (
                <EmptyState title="Chọn một báo cáo để xử lý" description="Chi tiết và lịch sử sẽ xuất hiện tại đây." />
              )}
            </aside>
          </div>
        ) : null}
      </div>
    </section>
  );
}
