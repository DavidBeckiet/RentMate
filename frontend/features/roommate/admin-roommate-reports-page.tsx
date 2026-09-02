"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  AdminTimeline,
  AdminToolbar
} from "../../components/ui/admin-workspace";
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
  return (
    <AdminEvidence title="Phân tích an toàn bằng AI" icon="sparkles" tone={summary ? "info" : "muted"}>
      {summary ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <AdminPill tone={summary.highestOutcome === "HIGH_CAUTION" ? "attention" : "info"}>
              {summary.highestOutcome === "HIGH_CAUTION" ? "Tín hiệu cần chú ý cao" : "Tín hiệu cần thận trọng"}
            </AdminPill>
            <span className="text-ui-xs">Phân tích hỗ trợ · {summary.analysisVersion}</span>
          </div>
          <p>Tín hiệu: {summary.signalCodes.join(", ") || "Không có mã tín hiệu"}</p>
          <p>Tin nhắn liên quan: {summary.messageIds.map((id) => `#${id}`).join(", ") || "Không có"}</p>
          <p>Đây là thông tin hỗ trợ xem xét, không phải kết luận hoặc quyết định xử lý tự động.</p>
        </div>
      ) : (
        <p>Chưa có phân tích AI cho báo cáo này. Admin vẫn có thể xem bằng chứng và xử lý theo quy trình hiện tại.</p>
      )}
    </AdminEvidence>
  );
}

export function AdminRoommateReportsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [mounted, setMounted] = useState(false);
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

  useEffect(() => setMounted(true), []);

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

  const moderate = async (moderationState: RoommateModerationState) => {
    if (!selected) return;
    if (!note.trim()) {
      setActionError(
        moderationState === "HIDDEN"
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
          state: moderationState,
          note: note.trim(),
          reportId: selected.id
        });
      } else if (selected.targetType === "ROOMMATE_REQUEST") {
        await api.roommates.moderateRequest(selected.subject.requestId, {
          state: moderationState,
          note: note.trim(),
          reportId: selected.id
        });
      } else if (selected.targetType === "ROOMMATE_MESSAGE" && selected.subject.messageId) {
        await api.roommates.moderateMessage(selected.subject.messageId, {
          state: moderationState,
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
  if (!mounted) return <LoadingState message="Đang kiểm tra tài khoản…" />;

  const reports = result?.data ?? [];
  const elevatedCount = reports.filter((report) => report.riskSummary?.reviewPriority === "ELEVATED").length;
  const aiEvidenceCount = reports.filter((report) => Boolean(report.aiSafetySummary)).length;

  return (
    <AdminPage labelledBy="roommate-reports-heading">
      <AdminPageHeader
        eyebrow="Trust & Safety · Roommate"
        title="Báo cáo ở ghép"
        titleId="roommate-reports-heading"
        description="Ưu tiên xem xét theo quy tắc V2 và bằng chứng an toàn AI V3 được trình bày tách biệt. Không hiển thị email, số điện thoại hoặc thông tin ngoài phạm vi được cấp quyền."
        icon="users"
        tone={elevatedCount > 0 ? "attention" : "info"}
      />

      {state === "success" ? (
        <AdminSummaryGrid>
          <AdminSummaryCard
            label="Báo cáo trong trang"
            value={reports.length}
            note={`Trang ${result?.pagination.page ?? page} · không phải tổng hệ thống`}
            icon="flag"
          />
          <AdminSummaryCard
            label="Ưu tiên xem sớm"
            value={elevatedCount}
            note="Phân loại quy tắc V2 hiện có"
            tone={elevatedCount > 0 ? "attention" : "success"}
            icon="target"
          />
          <AdminSummaryCard
            label="Có evidence AI"
            value={aiEvidenceCount}
            note="AI chỉ là bằng chứng hỗ trợ"
            tone="info"
            icon="sparkles"
          />
          <AdminSummaryCard
            label="Bộ lọc trạng thái"
            value={statusLabels[statusFilter]}
            note="Ordering từ API được giữ nguyên"
            tone="muted"
            icon="sliders"
          />
        </AdminSummaryGrid>
      ) : null}

      <AdminToolbar
        summary={result ? `${reports.length} bản ghi · page size ${result.pagination.pageSize}` : undefined}
      >
        <AdminFilter id="roommate-report-status" label="Trạng thái">
          <select
            id="roommate-report-status"
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
        </AdminFilter>
        <AdminFilter id="roommate-report-category" label="Loại báo cáo">
          <select
            id="roommate-report-category"
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
        </AdminFilter>
        <AdminFilter id="roommate-report-priority" label="Ưu tiên xem xét">
          <select
            id="roommate-report-priority"
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
        </AdminFilter>
      </AdminToolbar>

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
        <div className="rm-admin-queue-layout">
          <div className="rm-admin-queue" aria-label="Danh sách báo cáo ở ghép">
            {result.data.map((report) => (
              <AdminQueueCard key={report.id} selected={selected?.id === report.id}>
                <div className="rm-admin-queue-card__meta">
                  <span>#{report.id}</span>
                  <span>{statusLabels[report.status]}</span>
                </div>
                <h2 className="rm-admin-queue-card__title">{targetLabel(report)}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {report.riskSummary ? (
                    <AdminPill tone={report.riskSummary.reviewPriority === "ELEVATED" ? "attention" : "muted"}>
                      {riskPriorityLabels[report.riskSummary.reviewPriority]}
                    </AdminPill>
                  ) : null}
                  <AdminPill tone="muted">{roommateReportCategoryLabels[report.category]}</AdminPill>
                </div>
                <p className="rm-admin-queue-card__body">{report.details ?? "Không có mô tả bổ sung."}</p>
                <div className="rm-admin-queue-card__footer">
                  <span>{report.reporter.displayName ?? "Thành viên RentMate"}</span>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-3 py-2 text-ui-sm font-semibold text-primary-foreground transition-colors duration-fast hover:bg-primary-hover"
                    onClick={() => void openDetail(report.id)}
                  >
                    Xem &amp; xử lý
                  </button>
                </div>
              </AdminQueueCard>
            ))}
            <Pagination
              ariaLabel="Phân trang báo cáo ở ghép"
              page={result.pagination.page}
              hasNextPage={result.pagination.hasNextPage}
              onPrevious={() => setPage((value) => value - 1)}
              onNext={() => setPage((value) => value + 1)}
            />
          </div>
          <aside className="rm-admin-detail p-5 sm:p-6" aria-label="Chi tiết xử lý báo cáo ở ghép">
            {detailPending ? (
              <LoadingState message="Đang tải chi tiết…" />
            ) : selected ? (
              <>
                <div className="rm-admin-detail__header -mx-5 -mt-5 sm:-mx-6 sm:-mt-6">
                  <div className="min-w-0">
                    <AdminPill tone={selected.status === "OPEN" ? "attention" : "info"}>
                      {statusLabels[selected.status]}
                    </AdminPill>
                    <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground">
                      Báo cáo #{selected.id}
                    </h2>
                    <p className="mt-1 text-ui-sm text-muted-foreground">{targetLabel(selected)}</p>
                  </div>
                </div>
                <div className="pt-5">
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

                  {selected.targetType === "ROOMMATE_MESSAGE" && selected.subject.messageId ? (
                    <AdminEvidence title="Bằng chứng tin nhắn được báo cáo" icon="message" tone="attention">
                      <div className="rounded-control border border-info/20 bg-surface p-3">
                        <p className="font-semibold text-foreground">
                          Tin nhắn liên quan #{selected.subject.messageId}
                        </p>
                        <p className="mt-1 text-ui-xs">Chỉ hiển thị message context được API cấp cho Admin.</p>
                      </div>
                    </AdminEvidence>
                  ) : null}

                  <RoommateRiskSummaryPanel summary={selected.riskSummary} />
                  <AiSafetySummaryPanel summary={selected.aiSafetySummary} />

                  <AdminTimeline>
                    <h3 className="font-display text-sm font-bold text-foreground">Lịch sử xử lý</h3>
                    {selected.events?.length ? (
                      selected.events.map((event, index) => (
                        <div className="rm-admin-timeline-item" key={`${event.eventType}-${event.createdAt}-${index}`}>
                          <div className="rm-admin-timeline-item__meta">
                            <span>{event.newStatus}</span>
                            <time>{new Date(event.createdAt).toLocaleString("vi-VN")}</time>
                          </div>
                          <p className="rm-admin-timeline-item__body">{event.note ?? "Không có ghi chú"}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-ui-sm text-muted-foreground">Chưa có sự kiện xử lý khác.</p>
                    )}
                  </AdminTimeline>

                  {selected.status === "OPEN" || selected.status === "INVESTIGATING" ? (
                    <AdminDecisionPanel
                      title="Hành động kiểm duyệt"
                      description="Risk priority và AI safety chỉ hỗ trợ xem xét; quyết định của Admin vẫn là bước riêng."
                    >
                      <div className="space-y-3">
                        {selected.status === "OPEN" ? (
                          <Button pending={pendingAction === "status"} onClick={() => void transition("INVESTIGATING")}>
                            Bắt đầu điều tra
                          </Button>
                        ) : null}
                        <label
                          className="block text-ui-sm font-semibold text-foreground"
                          htmlFor="roommate-report-resolution-note"
                        >
                          Ghi chú xử lý hoặc kiểm duyệt
                        </label>
                        <textarea
                          id="roommate-report-resolution-note"
                          rows={4}
                          maxLength={2000}
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          className="min-h-28 w-full resize-y rounded-control border border-border-strong bg-surface px-4 py-3 text-ui-sm text-foreground outline-none transition-[border-color,box-shadow] duration-fast focus:border-primary focus:ring-[3px] focus:ring-primary/20"
                        />
                        <div className="flex flex-wrap gap-2">
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
                        {actionError ? (
                          <p
                            className="border-l-2 border-danger pl-3 text-ui-sm font-semibold text-danger"
                            role="alert"
                          >
                            {actionError}
                          </p>
                        ) : null}
                      </div>
                    </AdminDecisionPanel>
                  ) : null}
                </div>
              </>
            ) : actionError ? (
              <p className="border-l-2 border-danger pl-3 text-ui-sm font-semibold text-danger" role="alert">
                {actionError}
              </p>
            ) : (
              <EmptyState title="Chọn một báo cáo để xử lý" description="Chi tiết và lịch sử sẽ xuất hiện tại đây." />
            )}
          </aside>
        </div>
      ) : null}
    </AdminPage>
  );
}
