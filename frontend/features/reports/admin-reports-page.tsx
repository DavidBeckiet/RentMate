"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminListingReport, ApiPage, ReportCategory, ReportStatus } from "../../types/api";
import styles from "./admin-reports-page.module.css";

const statusLabels: Record<ReportStatus, string> = {
  OPEN: "Mới",
  INVESTIGATING: "Đang điều tra",
  RESOLVED: "Đã xử lý",
  DISMISSED: "Đã bác bỏ"
};
const categoryLabels: Record<ReportCategory, string> = {
  PRICE_INCORRECT: "Giá sai",
  LOCATION_INCORRECT: "Vị trí sai",
  IMAGE_INCORRECT: "Ảnh sai",
  ALREADY_RENTED: "Đã cho thuê",
  FRAUD: "Lừa đảo",
  INAPPROPRIATE: "Không phù hợp"
};
const statuses: readonly ReportStatus[] = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"];
const categories: readonly ReportCategory[] = [
  "PRICE_INCORRECT",
  "LOCATION_INCORRECT",
  "IMAGE_INCORRECT",
  "ALREADY_RENTED",
  "FRAUD",
  "INAPPROPRIATE"
];

export function AdminReportsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [mounted, setMounted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReportStatus>("OPEN");
  const [categoryFilter, setCategoryFilter] = useState<ReportCategory | "">("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<AdminListingReport> | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<AdminListingReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!adminReady) return;
    const controller = new AbortController();
    setLoadStatus("loading");
    setError(null);
    setSelected(null);
    void api.admin
      .listReports(
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
      setSelected(await api.admin.getReport(reportId));
    } catch {
      setActionError("Không thể tải chi tiết báo cáo.");
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
      const updated = await api.admin.updateReportStatus(selected.id, { status: next, note: note.trim() || null });
      setSelected(updated);
      setNote("");
      setRetryKey((value) => value + 1);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setActionError(
        apiError?.status === 409 ? "Báo cáo đã thay đổi hoặc thao tác không còn hợp lệ." : "Chưa thể cập nhật báo cáo."
      );
    } finally {
      setActionPending(false);
    }
  };

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous")
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên."
        action={
          <Link className={styles.textLink} href="/admin/login">
            Đăng nhập quản trị
          </Link>
        }
      />
    );
  if (authStatus === "error")
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  if (!adminReady) return <ErrorState message="Trang này dành cho quản trị viên." />;
  if (!mounted) return <LoadingState message="Đang kiểm tra tài khoản…" />;

  return (
    <section className={styles.page} aria-labelledby="reports-heading">
      <header className={styles.header}>
        <span>
          <Icon name="shield" className="h-4 w-4" /> Trust & Safety
        </span>
        <h1 id="reports-heading">
          Hàng đợi <em>báo cáo</em>
        </h1>
        <p>Kiểm tra tín hiệu từ người thuê, xem tài nguyên liên quan và ghi lại từng quyết định xử lý.</p>
      </header>
      <div className={styles.workspace}>
        <div className={styles.filters}>
          <label>
            Trạng thái
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as ReportStatus);
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
          <label>
            Loại báo cáo
            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value as ReportCategory | "");
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabels[category]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loadStatus === "loading" || loadStatus === "idle" ? <LoadingState message="Đang tải báo cáo…" /> : null}
        {loadStatus === "error" ? (
          <ErrorState
            message={error?.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Không thể tải hàng đợi báo cáo."}
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
            <div className={styles.queue} aria-label="Danh sách báo cáo">
              {result.data.map((report) => (
                <article key={report.id} className={styles.card} data-selected={selected?.id === report.id}>
                  <div className={styles.cardMeta}>
                    <span>#{report.id}</span>
                    <span>{statusLabels[report.status]}</span>
                  </div>
                  <h2>{report.listing.title ?? `Tin #${report.listing.id}`}</h2>
                  <p className={styles.category}>{categoryLabels[report.category]}</p>
                  <p>{report.details ?? "Không có mô tả bổ sung."}</p>
                  <div className={styles.cardFooter}>
                    <span>{report.reporter.email}</span>
                    <button type="button" onClick={() => void openDetail(report.id)}>
                      Xem & xử lý
                    </button>
                  </div>
                </article>
              ))}
              <Pagination
                ariaLabel="Phân trang báo cáo"
                page={result.pagination.page}
                hasNextPage={result.pagination.hasNextPage}
                onPrevious={() => setPage((value) => value - 1)}
                onNext={() => setPage((value) => value + 1)}
              />
            </div>
            <aside className={styles.detail} aria-label="Chi tiết xử lý báo cáo">
              {detailLoading ? (
                <LoadingState message="Đang tải chi tiết…" />
              ) : selected ? (
                <>
                  <div className={styles.detailHeading}>
                    <span>{statusLabels[selected.status]}</span>
                    <h2>Báo cáo #{selected.id}</h2>
                    <Link href={`/admin/listings/${selected.listing.id}`}>
                      Mở tin đăng <Icon name="arrowUpRight" className="h-4 w-4" />
                    </Link>
                  </div>
                  <dl>
                    <div>
                      <dt>Người báo cáo</dt>
                      <dd>
                        {selected.reporter.email} · {selected.reporter.isActive ? "đang hoạt động" : "đã vô hiệu hóa"}
                      </dd>
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
                        <time>
                          {new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
                            new Date(event.createdAt)
                          )}
                        </time>
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
                      <label htmlFor="report-resolution-note">
                        Ghi chú {selected.status === "OPEN" ? "khi bác bỏ" : "kết luận"}
                      </label>
                      <textarea
                        id="report-resolution-note"
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
