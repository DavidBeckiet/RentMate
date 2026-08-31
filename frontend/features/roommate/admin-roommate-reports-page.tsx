"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type {
  AdminRoommateReport,
  ApiPage,
  RoommateModerationState,
  RoommateReportCategory,
  RoommateReportStatus,
  RoommateRiskPriority
} from "../../types/api";
import { formatMemberSince, roommateReportCategoryLabels } from "./roommate-content";
import { RoommateRiskSummaryPanel } from "./roommate-risk-summary";
import styles from "../reports/admin-reports-page.module.css";

const statusLabels: Record<RoommateReportStatus, string> = {
  OPEN: "Mới",
  INVESTIGATING: "Đang điều tra",
  RESOLVED: "Đã xử lý",
  DISMISSED: "Đã bác bỏ"
};

const statuses: readonly RoommateReportStatus[] = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"];
const categories = Object.keys(roommateReportCategoryLabels) as readonly RoommateReportCategory[];
const riskPriorities: readonly RoommateRiskPriority[] = ["ELEVATED", "STANDARD"];

const riskPriorityLabels: Record<RoommateRiskPriority, string> = {
  ELEVATED: "Ưu tiên xem sớm",
  STANDARD: "Ưu tiên tiêu chuẩn"
};

function targetLabel(report: AdminRoommateReport): string {
  if (report.targetType === "ROOMMATE_PROFILE") return "Hồ sơ ở ghép";
  if (report.targetType === "ROOMMATE_MESSAGE") return `Tin nhắn #${report.subject.messageId ?? "—"}`;
  return `Yêu cầu #${report.subject.requestId}`;
}

function AiSafetySummaryPanel({ summary }: Readonly<{ summary: AdminRoommateReport["aiSafetySummary"] }>) {
  if (!summary) return null;
  return (
    <section className={styles.timeline} aria-labelledby="roommate-ai-safety-heading">
      <h3 id="roommate-ai-safety-heading">Phân tích an toàn bằng AI</h3>
      <p>{summary.highestOutcome === "HIGH_CAUTION" ? "Tín hiệu cần chú ý cao" : "Tín hiệu cần thận trọng"}</p>
      <p>Tín hiệu: {summary.signalCodes.join(", ")}</p>
      <p>Tin nhắn liên quan: {summary.messageIds.map((id) => `#${id}`).join(", ")}</p>
      <p>Đây là thông tin hỗ trợ xem xét, không phải kết luận hoặc quyết định xử lý tự động.</p>
    </section>
  );
}

export function AdminRoommateReportsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [statusFilter, setStatusFilter] = useState<RoommateReportStatus>("OPEN");
  const [categoryFilter, setCategoryFilter] = useState<RoommateReportCategory | "">("");
  const [reviewPriorityFilter, setReviewPriorityFilter] = useState<RoommateRiskPriority | "">("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<AdminRoommateReport> | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<AdminRoommateReport | null>(null);
  const [detailPending, setDetailPending] = useState(false);
  const [note, setNote] = useState("");
  const [pendingAction, setPendingAction] = useState<"status" | "moderation" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!adminReady) return;
    const controller = new AbortController();
    setState("loading");
    setError(null);
    setSelected(null);
    void api.roommates
      .listAdminReports(
        {
          status: statusFilter,
          ...(categoryFilter ? { category: categoryFilter } : {}),
          ...(reviewPriorityFilter ? { reviewPriority: reviewPriorityFilter } : {}),
          page,
          pageSize: 20
        },
        controller.signal
      )
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setState("success");
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [adminReady, categoryFilter, page, refreshKey, reviewPriorityFilter, statusFilter]);

  const openDetail = async (reportId: number) => {
    setDetailPending(true);
    setActionError(null);
    setNote("");
    try {
      setSelected(await api.roommates.getAdminReport(reportId));
    } catch {
      setActionError("Không thể tải chi tiết báo cáo ở ghép.");
    } finally {
      setDetailPending(false);
    }
  };

  const transition = async (next: Exclude<RoommateReportStatus, "OPEN">) => {
    if (!selected) return;
    if ((next === "RESOLVED" || next === "DISMISSED") && !note.trim()) {
      setActionError("Cần nhập ghi chú kết luận trước khi hoàn tất.");
      return;
    }
    setPendingAction("status");
    setActionError(null);
    try {
      setSelected(
        await api.roommates.updateAdminReportStatus(selected.id, { status: next, note: note.trim() || null })
      );
      setNote("");
      setRefreshKey((value) => value + 1);
    } catch {
      setActionError("Chưa thể cập nhật báo cáo.");
    } finally {
      setPendingAction(null);
    }
  };

  const moderate = async (state: RoommateModerationState) => {
    if (!selected) return;
    if (!note.trim()) {
      setActionError(
        state === "HIDDEN"
          ? "Cần nhập ghi chú kiểm duyệt trước khi ẩn nội dung."
          : "Cần nhập ghi chú kiểm duyệt trước khi khôi phục hiển thị."
      );
      return;
    }
    setPendingAction("moderation");
    setActionError(null);
    try {
      if (selected.targetType === "ROOMMATE_PROFILE" && selected.subject.profileTenantId) {
        await api.roommates.moderateProfile(selected.subject.profileTenantId, {
          state,
          note: note.trim(),
          reportId: selected.id
        });
      } else if (selected.targetType === "ROOMMATE_REQUEST") {
        await api.roommates.moderateRequest(selected.subject.requestId, {
          state,
          note: note.trim(),
          reportId: selected.id
        });
      } else if (selected.targetType === "ROOMMATE_MESSAGE" && selected.subject.messageId) {
        await api.roommates.moderateMessage(selected.subject.messageId, {
          state,
          note: note.trim(),
          reportId: selected.id
        });
      } else {
        setActionError("Chi tiết báo cáo này hiện không đủ ngữ cảnh để kiểm duyệt nội dung.");
        return;
      }
      setNote("");
      setRefreshKey((value) => value + 1);
    } catch {
      setActionError("Chưa thể kiểm duyệt nội dung được báo cáo.");
    } finally {
      setPendingAction(null);
    }
  };

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous")
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên."
        action={<Link href="/admin/login">Đăng nhập quản trị</Link>}
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

  return (
    <section className={styles.page} aria-labelledby="roommate-reports-heading">
      <header className={styles.header}>
        <span>TRUST &amp; SAFETY · ROOMMATE</span>
        <h1 id="roommate-reports-heading">
          Báo cáo <em>ở ghép</em>
        </h1>
        <p>
          Hiển thị ngữ cảnh tối thiểu cần thiết để xử lý báo cáo. Không hiển thị email, số điện thoại hoặc địa chỉ chính
          xác.
        </p>
      </header>
      <div className={styles.workspace}>
        <div className={styles.filters}>
          <label>
            Trạng thái
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as RoommateReportStatus);
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
                setCategoryFilter(event.target.value as RoommateReportCategory | "");
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {roommateReportCategoryLabels[category]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ưu tiên xem xét
            <select
              value={reviewPriorityFilter}
              onChange={(event) => {
                setReviewPriorityFilter(event.target.value as RoommateRiskPriority | "");
                setPage(1);
              }}
            >
              <option value="">Tất cả</option>
              {riskPriorities.map((priority) => (
                <option key={priority} value={priority}>
                  {riskPriorityLabels[priority]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {state === "idle" || state === "loading" ? <LoadingState message="Đang tải báo cáo ở ghép…" /> : null}
        {state === "error" ? (
          <ErrorState
            message={error?.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Không thể tải hàng đợi báo cáo ở ghép."}
            requestId={error?.requestId}
            action={<Button onClick={() => setRefreshKey((value) => value + 1)}>Thử lại</Button>}
          />
        ) : null}
        {state === "success" && result?.data.length === 0 ? (
          <EmptyState
            title="Không có báo cáo ở trạng thái này"
            description="Hãy chọn trạng thái hoặc loại báo cáo khác."
          />
        ) : null}
        {state === "success" && result && result.data.length > 0 ? (
          <div className={styles.layout}>
            <div className={styles.queue} aria-label="Danh sách báo cáo ở ghép">
              {result.data.map((report) => (
                <article key={report.id} className={styles.card} data-selected={selected?.id === report.id}>
                  <div className={styles.cardMeta}>
                    <span>#{report.id}</span>
                    <span>{statusLabels[report.status]}</span>
                  </div>
                  <h2>{targetLabel(report)}</h2>
                  {report.riskSummary ? (
                    <p className={styles.priority}>
                      {report.riskSummary.reviewPriority === "ELEVATED" ? "Ưu tiên xem sớm" : "Ưu tiên tiêu chuẩn"}
                    </p>
                  ) : null}
                  <p className={styles.category}>{roommateReportCategoryLabels[report.category]}</p>
                  <p>{report.details ?? "Không có mô tả bổ sung."}</p>
                  <div className={styles.cardFooter}>
                    <span>{report.reporter.displayName ?? "Thành viên RentMate"}</span>
                    <button type="button" onClick={() => void openDetail(report.id)}>
                      Xem &amp; xử lý
                    </button>
                  </div>
                </article>
              ))}
              <Pagination
                ariaLabel="Phân trang báo cáo ở ghép"
                page={result.pagination.page}
                hasNextPage={result.pagination.hasNextPage}
                onPrevious={() => setPage((value) => value - 1)}
                onNext={() => setPage((value) => value + 1)}
              />
            </div>
            <aside className={styles.detail} aria-label="Chi tiết xử lý báo cáo ở ghép">
              {detailPending ? (
                <LoadingState message="Đang tải chi tiết…" />
              ) : selected ? (
                <>
                  <div className={styles.detailHeading}>
                    <span>{statusLabels[selected.status]}</span>
                    <h2>Báo cáo #{selected.id}</h2>
                  </div>
                  <dl>
                    <div>
                      <dt>Người báo cáo</dt>
                      <dd>
                        {selected.reporter.displayName ?? "Không nêu tên"}
                        {formatMemberSince(selected.reporter.memberSince)
                          ? ` · Thành viên từ ${formatMemberSince(selected.reporter.memberSince)}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Đối tượng</dt>
                      <dd>{targetLabel(selected)}</dd>
                    </div>
                    <div>
                      <dt>Lý do</dt>
                      <dd>{roommateReportCategoryLabels[selected.category]}</dd>
                    </div>
                    <div>
                      <dt>Chi tiết</dt>
                      <dd>{selected.details ?? "Không có"}</dd>
                    </div>
                  </dl>
                  <RoommateRiskSummaryPanel summary={selected.riskSummary} />
                  <AiSafetySummaryPanel summary={selected.aiSafetySummary} />
                  <section className={styles.timeline}>
                    <h3>Lịch sử xử lý</h3>
                    {selected.events?.map((event) => (
                      <div key={`${event.eventType}-${event.createdAt}`}>
                        <span>{event.newStatus}</span>
                        <p>{event.note ?? "Không có ghi chú"}</p>
                        <time>{new Date(event.createdAt).toLocaleString("vi-VN")}</time>
                      </div>
                    ))}
                  </section>
                  {selected.status === "OPEN" || selected.status === "INVESTIGATING" ? (
                    <div className={styles.actions}>
                      {selected.status === "OPEN" ? (
                        <Button pending={pendingAction === "status"} onClick={() => void transition("INVESTIGATING")}>
                          Bắt đầu điều tra
                        </Button>
                      ) : null}
                      <label htmlFor="roommate-report-resolution-note">Ghi chú xử lý hoặc kiểm duyệt</label>
                      <textarea
                        id="roommate-report-resolution-note"
                        rows={4}
                        maxLength={2000}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                      <div>
                        <Button
                          variant="outline"
                          pending={pendingAction === "moderation"}
                          pendingLabel="Đang ẩn…"
                          onClick={() => void moderate("HIDDEN")}
                        >
                          Ẩn nội dung được báo cáo
                        </Button>
                        <Button
                          variant="secondary"
                          pending={pendingAction === "moderation"}
                          pendingLabel="Đang khôi phục…"
                          onClick={() => void moderate("VISIBLE")}
                        >
                          Khôi phục hiển thị
                        </Button>
                        {selected.status === "OPEN" ? (
                          <Button
                            variant="danger"
                            pending={pendingAction === "status"}
                            onClick={() => void transition("DISMISSED")}
                          >
                            Bác bỏ report
                          </Button>
                        ) : (
                          <Button pending={pendingAction === "status"} onClick={() => void transition("RESOLVED")}>
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
