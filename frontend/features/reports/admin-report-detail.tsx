"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import {
  roommateCleanlinessLabels,
  roommateNoiseLabels,
  roommateSleepScheduleLabels
} from "../roommate/roommate-content";
import type {
  AdminContactReport,
  AdminListingReport,
  AdminReviewReport,
  AdminRoommateReport,
  ListingStatus,
  RoommateModerationState
} from "../../types/api";
import { reportReturnUrl, reportStatusLabels, type AnyReportStatus, type ReportSource } from "./admin-report-query";
import styles from "./admin-report-detail.module.css";

type ReportDetail = AdminListingReport | AdminContactReport | AdminReviewReport | AdminRoommateReport;
type LifecycleStatus = "RESOLVED" | "DISMISSED";
type DecisionBranch = "handle";

function roommatePreferenceLabel<Value extends string>(value: string, labels: Record<Value, string>): string {
  return labels[value as Value] ?? value;
}

const listingCategories: Record<AdminListingReport["category"], string> = {
  PRICE_INCORRECT: "Giá sai",
  LOCATION_INCORRECT: "Vị trí sai",
  IMAGE_INCORRECT: "Ảnh sai",
  ALREADY_RENTED: "Đã cho thuê",
  FRAUD: "Lừa đảo",
  INAPPROPRIATE: "Không phù hợp"
};
const contactCategories: Record<AdminContactReport["category"], string> = {
  SPAM: "Spam",
  FRAUD: "Lừa đảo",
  HARASSMENT: "Quấy rối",
  INAPPROPRIATE: "Không phù hợp",
  OTHER: "Khác"
};
const reviewCategories: Record<AdminReviewReport["category"], string> = {
  INACCURATE: "Không chính xác",
  OFFENSIVE: "Xúc phạm",
  HARASSMENT: "Quấy rối",
  SPAM: "Spam",
  OTHER: "Khác"
};
const roommateCategories: Record<AdminRoommateReport["category"], string> = {
  FRAUD: "Lừa đảo",
  PAYMENT_SCAM: "Lừa đảo thanh toán",
  SPAM: "Spam",
  HARASSMENT: "Quấy rối",
  IMPERSONATION: "Giả mạo",
  INAPPROPRIATE_CONTENT: "Nội dung không phù hợp",
  OTHER: "Khác"
};
const listingStatusLabels: Record<ListingStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
  HIDDEN: "Đã ẩn",
  DRAFT: "Bản nháp",
  INACTIVE: "Ngừng hoạt động"
};
const reviewStatusLabels = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối"
} as const;
const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

function validId(value: string): number | null {
  return /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}
function statusOf(detail: ReportDetail): AnyReportStatus {
  return detail.status;
}
function categoryLabel(source: ReportSource, detail: ReportDetail): string {
  if (source === "listing") return listingCategories[(detail as AdminListingReport).category];
  if (source === "contact") return contactCategories[(detail as AdminContactReport).category];
  if (source === "review") return reviewCategories[(detail as AdminReviewReport).category];
  return roommateCategories[(detail as AdminRoommateReport).category];
}
function sourceName(source: ReportSource): string {
  return { listing: "tin đăng", contact: "liên hệ", roommate: "ở ghép", review: "đánh giá" }[source];
}

async function fetchDetail(source: ReportSource, id: number, signal?: AbortSignal): Promise<ReportDetail> {
  if (source === "listing") return api.admin.getReport(id, signal);
  if (source === "contact") return api.admin.getContactReport(id, signal);
  if (source === "review") return api.admin.getReviewReport(id, signal);
  return api.roommates.getAdminReport(id, signal);
}
async function updateLifecycle(
  source: ReportSource,
  id: number,
  status: LifecycleStatus,
  note: string
): Promise<ReportDetail> {
  const body = { status, note: note.trim() || null };
  if (source === "listing") return api.admin.updateReportStatus(id, body);
  if (source === "contact") return api.admin.updateContactReportStatus(id, body);
  if (source === "review") return api.admin.updateReviewReportStatus(id, body);
  return api.roommates.updateAdminReportStatus(id, body);
}

export function AdminReportDetail({
  source,
  reportId: rawReportId
}: {
  readonly source: ReportSource;
  readonly reportId: string;
}) {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const reportId = validId(rawReportId);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [confirmationNote, setConfirmationNote] = useState("");
  const [branch, setBranch] = useState<DecisionBranch | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [recoveryLocked, setRecoveryLocked] = useState(false);
  const [confirm, setConfirm] = useState<LifecycleStatus | RoommateModerationState | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  const confirmationNoteRef = useRef<HTMLTextAreaElement>(null);
  const requestVersion = useRef(0);
  const actionTrigger = useRef<HTMLButtonElement>(null);
  const returnHref =
    typeof window === "undefined"
      ? source === "listing"
        ? "/admin/reports"
        : `/admin/${source}-reports`
      : reportReturnUrl(source, new URLSearchParams(window.location.search));

  const reload = useCallback(async (): Promise<ReportDetail | null> => {
    if (!adminReady || reportId === null) return null;
    const current = ++requestVersion.current;
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();
    try {
      const value = await fetchDetail(source, reportId, controller.signal);
      if (current === requestVersion.current) {
        setDetail(value);
        return value;
      }
      return null;
    } catch (caught) {
      if (current === requestVersion.current) setLoadError(caught instanceof ApiError ? caught : null);
      return null;
    } finally {
      if (current === requestVersion.current) setLoading(false);
    }
  }, [adminReady, reportId, source]);

  useEffect(() => {
    void reload();
    return () => {
      requestVersion.current += 1;
    };
  }, [reload]);
  useEffect(() => {
    if (detail && !loading) headingRef.current?.focus();
  }, [detail, loading]);
  useEffect(() => {
    if (actionError?.startsWith("Hồ sơ đã thay đổi")) conflictRef.current?.focus();
  }, [actionError]);

  const recoverCanonicalState = async (kind: "conflict" | "uncertain" | "retry"): Promise<boolean> => {
    setRecoveryLocked(true);
    const recovered = await reload();
    if (!recovered) {
      setActionError(
        "Chưa thể xác nhận trạng thái hiện tại. Nội dung bên dưới là lần tải thành công gần nhất; hãy tải lại hồ sơ trước khi thực hiện thêm thao tác."
      );
      return false;
    }

    setRecoveryLocked(false);
    setActionError(
      kind === "conflict"
        ? "Hồ sơ đã thay đổi. Hãy xem lại trạng thái mới trước khi quyết định lại."
        : kind === "uncertain"
          ? "Trạng thái hồ sơ đã được tải lại. Hãy xem lại trước khi quyết định tiếp."
          : null
    );
    return true;
  };

  const openConfirm = (
    action: LifecycleStatus | RoommateModerationState,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (pending || recoveryLocked) return;
    setActionError(null);
    setConfirmationNote("");
    actionTrigger.current = event.currentTarget;
    setConfirm(action);
  };
  const apply = async () => {
    if (!detail || !confirm || reportId === null || recoveryLocked) return;
    const decisionNote = confirmationNote.trim();
    if (!decisionNote) {
      setActionError(
        confirm === "HIDDEN" || confirm === "VISIBLE"
          ? "Cần nhập ghi chú kiểm duyệt trước khi thay đổi hiển thị."
          : "Cần nhập ghi chú kết luận trước khi hoàn tất."
      );
      confirmationNoteRef.current?.focus();
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      if (confirm === "HIDDEN" || confirm === "VISIBLE") {
        if (source !== "roommate") return;
        const roommate = detail as AdminRoommateReport;
        const body = { state: confirm, note: decisionNote, reportId };
        if (roommate.targetType === "ROOMMATE_PROFILE" && roommate.subject.profileTenantId)
          await api.roommates.moderateProfile(roommate.subject.profileTenantId, body);
        else if (roommate.targetType === "ROOMMATE_REQUEST")
          await api.roommates.moderateRequest(roommate.subject.requestId, body);
        else if (roommate.targetType === "ROOMMATE_MESSAGE" && roommate.subject.messageId)
          await api.roommates.moderateMessage(roommate.subject.messageId, body);
        else throw new Error("Thiếu ngữ cảnh để kiểm duyệt nội dung.");
        setMessage(
          confirm === "HIDDEN"
            ? "Đã ghi nhận thao tác ẩn nội dung. Báo cáo vẫn đang mở để tiếp tục xem xét."
            : "Đã ghi nhận thao tác khôi phục hiển thị. Báo cáo vẫn đang mở để tiếp tục xem xét."
        );
        setConfirmationNote("");
        await reload();
      } else {
        const updated = await updateLifecycle(source, reportId, confirm, decisionNote);
        setDetail(updated);
        setMessage(
          confirm === "RESOLVED"
            ? "Đã hoàn tất xem xét báo cáo. Việc này không tự thay đổi nội dung hoặc tài khoản."
            : "Đã kết luận báo cáo không cần xử lý thêm."
        );
        setConfirmationNote("");
      }
      setConfirm(null);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setConfirm(null);
      if (apiError?.status === 409) {
        await recoverCanonicalState("conflict");
      } else {
        await recoverCanonicalState("uncertain");
      }
    } finally {
      setPending(false);
    }
  };
  const closeConfirmation = useCallback(() => {
    if (pending) return;
    setConfirm(null);
    setConfirmationNote("");
    setActionError(null);
  }, [pending]);

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
  if (reportId === null)
    return (
      <ErrorState
        headingLevel="h1"
        title="Mã báo cáo không hợp lệ"
        message="Hãy quay lại hàng đợi báo cáo để chọn một hồ sơ hợp lệ."
      />
    );
  if (loading) return <LoadingState message="Đang tải chi tiết báo cáo…" />;
  if (!detail && loadError?.status === 404)
    return (
      <ErrorState
        headingLevel="h1"
        title={`Không tìm thấy báo cáo ${sourceName(source)}`}
        message="Báo cáo này không tồn tại hoặc không còn khả dụng."
        action={
          <Link className="font-semibold text-primary-hover underline" href={returnHref}>
            Về hàng đợi {sourceName(source)}
          </Link>
        }
      />
    );
  if (!detail)
    return (
      <ErrorState
        headingLevel="h1"
        title="Không thể tải báo cáo"
        message="Không thể tải chi tiết báo cáo lúc này."
        requestId={loadError?.requestId}
        action={<Button onClick={() => void reload()}>Thử lại</Button>}
      />
    );

  const status = statusOf(detail);
  const actionable = status === "OPEN" || status === "INVESTIGATING";
  return (
    <section className={styles.page} aria-labelledby="report-detail-heading">
      <header className={styles.caseHeader}>
        <div className={styles.caseHeaderTop}>
          <Link className={styles.back} href={returnHref}>
            <Icon name="arrow" className={styles.backIcon} />
            Hàng đợi {sourceName(source)}
          </Link>
          <span className={styles.caseNumber}>RM-{String(detail.id).padStart(4, "0")}</span>
        </div>
        <div className={styles.detailHeader}>
          <div className={styles.caseIdentity}>
            <p className={styles.eyebrow}>Hồ sơ kiểm duyệt · {sourceName(source)}</p>
            <h1 ref={headingRef} tabIndex={-1} id="report-detail-heading" className={styles.title}>
              {categoryLabel(source, detail)}
            </h1>
          </div>
          <span className={`${styles.status} ${styles[`status${status}`]}`}>{reportStatusLabels[status]}</span>
        </div>
        <div className={styles.detailMeta}>
          <div>
            <span>Tiếp nhận</span>
            <time dateTime={detail.createdAt}>{dateFormatter.format(new Date(detail.createdAt))}</time>
          </div>
          <div>
            <span>Phạm vi</span>
            <strong>Báo cáo {sourceName(source)}</strong>
          </div>
          <div>
            <span>Việc cần làm</span>
            <strong>{actionable ? "Đối chiếu bằng chứng và kết luận" : "Xem kết quả đã lưu"}</strong>
          </div>
        </div>
      </header>
      {message ? (
        <div className={styles.notice} role="status" tabIndex={-1}>
          {message}
        </div>
      ) : null}
      {actionError ? (
        <div ref={conflictRef} className={`${styles.notice} ${styles.error}`} role="alert" tabIndex={-1}>
          <p>{actionError}</p>
          {recoveryLocked ? (
            <Button size="sm" variant="secondary" onClick={() => void recoverCanonicalState("retry")}>
              Tải lại hồ sơ
            </Button>
          ) : null}
        </div>
      ) : null}
      <ReportSummary source={source} detail={detail} />
      <div className={styles.caseLayout}>
        <div className={styles.casePrimary}>
          <Evidence source={source} detail={detail} />
          {source === "roommate" ? (
            <div className={styles.caseAssistance} aria-label="Tín hiệu hỗ trợ xem xét">
              <RoommateAssistance detail={detail as AdminRoommateReport} />
            </div>
          ) : null}
        </div>
        <aside className={styles.caseDecision} aria-label={actionable ? "Quyết định xử lý" : "Kết quả xử lý"}>
          {actionable ? (
            <Decision
              status={status}
              source={source}
              detail={detail}
              branch={branch}
              pending={pending || recoveryLocked}
              onBranch={() => {
                setBranch("handle");
                setActionError(null);
              }}
              onAction={openConfirm}
            />
          ) : (
            <FinalResult detail={detail} />
          )}
        </aside>
        <div className={styles.caseFollowUp}>
          <History detail={detail} />
        </div>
      </div>
      <Dialog
        open={confirm !== null}
        title={
          confirm === "HIDDEN"
            ? "Ẩn nội dung được báo cáo?"
            : confirm === "VISIBLE"
              ? "Khôi phục hiển thị?"
              : confirm === "DISMISSED"
                ? "Kết luận không có căn cứ?"
                : "Hoàn tất xem xét báo cáo?"
        }
        description={
          confirm === "RESOLVED"
            ? "Kết luận sẽ được lưu vào lịch sử. Hoàn tất xem xét không tự thay đổi nội dung hoặc tài khoản."
            : "Quyết định này sẽ được lưu vào lịch sử xử lý. Hãy kiểm tra lại bằng chứng trước khi xác nhận."
        }
        triggerRef={actionTrigger}
        onClose={closeConfirmation}
        actions={
          <>
            <Button variant="secondary" disabled={pending} onClick={closeConfirmation}>
              Hủy
            </Button>
            <Button
              variant={confirm === "DISMISSED" || confirm === "HIDDEN" ? "danger" : "primary"}
              pending={pending}
              onClick={() => void apply()}
            >
              Xác nhận
            </Button>
          </>
        }
      >
        <label className={styles.confirmationLabel} htmlFor="report-confirmation-note">
          {confirm === "DISMISSED"
            ? "Lý do không cần xử lý"
            : confirm === "HIDDEN" || confirm === "VISIBLE"
              ? "Ghi chú thao tác với nội dung"
              : "Ghi chú kết luận"}
        </label>
        <textarea
          ref={confirmationNoteRef}
          id="report-confirmation-note"
          className={styles.confirmationNote}
          maxLength={2000}
          value={confirmationNote}
          onChange={(event) => setConfirmationNote(event.target.value)}
          placeholder={
            confirm === "DISMISSED"
              ? "Nêu lý do báo cáo không cần xử lý"
              : confirm === "HIDDEN" || confirm === "VISIBLE"
                ? "Nêu lý do thay đổi hiển thị"
                : "Tóm tắt kết quả xem xét và thao tác đã thực hiện, nếu có"
          }
        />
        {actionError ? <p className={styles.confirmationError}>{actionError}</p> : null}
      </Dialog>
    </section>
  );
}

function ReportSummary({ source, detail }: { readonly source: ReportSource; readonly detail: ReportDetail }) {
  const listing = source === "listing" ? (detail as AdminListingReport) : null;
  const contact = source === "contact" ? (detail as AdminContactReport) : null;
  const review = source === "review" ? (detail as AdminReviewReport) : null;
  const roommate = source === "roommate" ? (detail as AdminRoommateReport) : null;
  const target = listing
    ? (listing.listing.title ?? `Tin đăng #${listing.listing.id}`)
    : contact
      ? `Liên hệ về tin #${contact.listingId}`
      : review
        ? `Đánh giá #${review.reviewId}`
        : roommate?.targetType === "ROOMMATE_PROFILE"
          ? "Hồ sơ ở ghép"
          : roommate?.targetType === "ROOMMATE_MESSAGE"
            ? `Tin nhắn #${roommate.subject.messageId ?? "—"}`
            : `Yêu cầu ở ghép #${roommate?.subject.requestId}`;
  const reporter =
    listing?.reporter.email ??
    contact?.reporter.email ??
    (review ? `Người dùng #${review.reporterId}` : (roommate?.reporter.displayName ?? "Thành viên RentMate"));
  return (
    <section className={styles.summarySection} aria-labelledby="report-summary-heading">
      <div className={styles.summaryTarget}>
        <span className={styles.kicker}>Đối tượng được báo cáo</span>
        <h2 id="report-summary-heading">{target}</h2>
        <span className={styles.sourceLabel}>{sourceName(source)}</span>
      </div>
      <dl className={styles.summaryFacts}>
        <div>
          <dt>Người báo cáo</dt>
          <dd>{reporter}</dd>
        </div>
        <div>
          <dt>Lý do</dt>
          <dd>{categoryLabel(source, detail)}</dd>
        </div>
      </dl>
      <blockquote className={styles.reporterStatement}>
        <Icon name="note" className={styles.statementIcon} />
        <div>
          <span>Lời trình bày</span>
          <p>{detail.details ?? "Người báo cáo không cung cấp mô tả bổ sung."}</p>
        </div>
      </blockquote>
    </section>
  );
}

function Evidence({ source, detail }: { readonly source: ReportSource; readonly detail: ReportDetail }) {
  const [review, setReview] = useState<Awaited<ReturnType<typeof api.admin.getReview>> | null>(null);
  const [reviewError, setReviewError] = useState(false);
  const reviewReport = source === "review" ? (detail as AdminReviewReport) : null;
  const loadReview = useCallback(() => {
    if (!reviewReport) return;
    setReviewError(false);
    void api.admin
      .getReview(reviewReport.reviewId)
      .then(setReview)
      .catch(() => setReviewError(true));
  }, [reviewReport]);
  useEffect(() => {
    loadReview();
  }, [loadReview]);
  if (source === "listing") {
    const report = detail as AdminListingReport;
    return (
      <section className={styles.evidenceSection} aria-labelledby="report-evidence-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Không gian bằng chứng</p>
            <h2 id="report-evidence-heading" className={styles.sectionTitle}>
              Tin đăng hiện tại
            </h2>
          </div>
          <span className={styles.evidenceTag}>Tin đăng</span>
        </div>
        <div className={`${styles.evidenceFrame} ${styles.listingEvidence}`}>
          <div className={styles.evidenceLead}>
            <strong>{report.listing.title ?? `Tin đăng #${report.listing.id}`}</strong>
            <span>Thông tin đang hiển thị tại thời điểm mở hồ sơ</span>
          </div>
          <dl className={styles.evidenceFacts}>
            <div>
              <dt>Khu vực</dt>
              <dd>{report.listing.areaName ?? "Chưa có"}</dd>
            </div>
            <div>
              <dt>Trạng thái</dt>
              <dd>{listingStatusLabels[report.listing.status]}</dd>
            </div>
          </dl>
          <Link className={styles.evidenceLink} href={`/admin/listings/${report.listing.id}`}>
            Mở tin đăng trong Admin
            <Icon name="arrowUpRight" className="h-4 w-4" />
          </Link>
          <p className={styles.evidenceFootnote}>
            Dữ liệu phản ánh trạng thái hiện tại, không phải bản chụp lúc gửi báo cáo.
          </p>
        </div>
      </section>
    );
  }
  if (source === "contact") {
    const report = detail as AdminContactReport;
    return (
      <section className={styles.evidenceSection} aria-labelledby="report-evidence-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Không gian bằng chứng</p>
            <h2 id="report-evidence-heading" className={styles.sectionTitle}>
              Tin nhắn liên quan
            </h2>
          </div>
          <span className={styles.evidenceTag}>Liên hệ</span>
        </div>
        <div className={`${styles.evidenceFrame} ${styles.contactEvidence}`}>
          {report.message ? (
            <>
              <div className={styles.evidenceLead}>
                <strong>{report.message.senderRole === "TENANT" ? "Người thuê" : "Chủ trọ"}</strong>
                <time dateTime={report.message.createdAt}>
                  {dateFormatter.format(new Date(report.message.createdAt))}
                </time>
              </div>
              <blockquote className={styles.messageBody}>{report.message.body}</blockquote>
            </>
          ) : (
            <p className={styles.emptyEvidence}>Báo cáo này không gắn với một tin nhắn cụ thể.</p>
          )}
        </div>
      </section>
    );
  }
  if (source === "review")
    return (
      <section className={styles.evidenceSection} aria-labelledby="report-evidence-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Không gian bằng chứng</p>
            <h2 id="report-evidence-heading" className={styles.sectionTitle}>
              Đánh giá hiện tại
            </h2>
          </div>
          <span className={styles.evidenceTag}>Đánh giá</span>
        </div>
        {review ? (
          <div className={`${styles.evidenceFrame} ${styles.reviewEvidence}`}>
            <div className={styles.reviewRating}>
              <strong>{review.overallRating}</strong>
              <span>/ 5 sao</span>
            </div>
            <blockquote className={styles.messageBody}>{review.comment}</blockquote>
            <p className={styles.evidenceFootnote}>
              Trạng thái hiện tại:{" "}
              {reviewStatusLabels[review.status as keyof typeof reviewStatusLabels] ?? review.status}
            </p>
          </div>
        ) : reviewError ? (
          <div className={`${styles.notice} ${styles.error}`} role="alert">
            Không thể tải nội dung đánh giá.{" "}
            <Button variant="secondary" size="sm" onClick={loadReview}>
              Thử lại
            </Button>
          </div>
        ) : (
          <LoadingState message="Đang tải nội dung đánh giá…" />
        )}
      </section>
    );
  return <RoommateEvidence detail={detail as AdminRoommateReport} />;
}

function RoommateEvidence({ detail }: { readonly detail: AdminRoommateReport }) {
  const snapshot = detail.evidenceSnapshot;
  const kind = snapshot?.kind;
  const data: Readonly<Record<string, unknown>> = snapshot ?? {};
  const text = (key: string, fallback = "Chưa có"): string =>
    typeof data[key] === "string" || typeof data[key] === "number" ? String(data[key]) : fallback;
  let content: React.ReactNode = "Không thể hiển thị bản ghi nội dung của báo cáo này.";
  if (kind === "ROOMMATE_MESSAGE" && typeof data.body === "string")
    content = (
      <div className={styles.messageEvidence}>
        <div className={styles.evidenceLead}>
          <strong>Tin nhắn được báo cáo</strong>
          {typeof data.createdAt === "string" ? (
            <time dateTime={data.createdAt}>{dateFormatter.format(new Date(data.createdAt))}</time>
          ) : null}
        </div>
        <blockquote className={styles.messageBody}>{data.body}</blockquote>
      </div>
    );
  if (kind === "ROOMMATE_PROFILE")
    content = (
      <>
        <div className={styles.evidenceIntro}>{text("intro")}</div>
        <dl className={styles.evidenceFacts}>
          <div>
            <dt>Nhịp sinh hoạt</dt>
            <dd>{roommatePreferenceLabel(text("sleepSchedule"), roommateSleepScheduleLabels)}</dd>
          </div>
          <div>
            <dt>Mức độ gọn gàng</dt>
            <dd>{roommatePreferenceLabel(text("cleanlinessLevel"), roommateCleanlinessLabels)}</dd>
          </div>
          <div>
            <dt>Ưu tiên không gian</dt>
            <dd>{roommatePreferenceLabel(text("noisePreference"), roommateNoiseLabels)}</dd>
          </div>
        </dl>
      </>
    );
  if (kind === "ROOMMATE_REQUEST")
    content = (
      <>
        <div className={styles.evidenceLead}>
          <strong>
            {Array.isArray(data.preferredAreaKeys)
              ? data.preferredAreaKeys.filter((value): value is string => typeof value === "string").join(", ") ||
                "Chưa có khu vực"
              : "Chưa có khu vực"}
          </strong>
          <span>Khu vực mong muốn</span>
        </div>
        <dl className={styles.evidenceFacts}>
          <div>
            <dt>Ngân sách</dt>
            <dd>
              {text("budgetMinPerPerson", "—")} – {text("budgetMaxPerPerson", "—")}
            </dd>
          </div>
          <div>
            <dt>Thời điểm chuyển vào</dt>
            <dd>
              {text("moveInFrom")} – {text("moveInUntil")}
            </dd>
          </div>
          <div>
            <dt>Ghi chú</dt>
            <dd>{text("note", "Không có")}</dd>
          </div>
        </dl>
      </>
    );
  const evidenceVariant =
    kind === "ROOMMATE_PROFILE"
      ? styles.profileEvidence
      : kind === "ROOMMATE_MESSAGE"
        ? styles.roommateMessageEvidence
        : styles.requestEvidence;
  return (
    <section className={styles.evidenceSection} aria-labelledby="report-evidence-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Không gian bằng chứng</p>
          <h2 id="report-evidence-heading" className={styles.sectionTitle}>
            Nội dung ở ghép được báo cáo
          </h2>
        </div>
        <span className={styles.evidenceTag}>
          {kind === "ROOMMATE_PROFILE" ? "Hồ sơ" : kind === "ROOMMATE_MESSAGE" ? "Tin nhắn" : "Yêu cầu"}
        </span>
      </div>
      <div className={`${styles.evidenceFrame} ${evidenceVariant}`}>{content}</div>
    </section>
  );
}

function RoommateAssistance({ detail }: { readonly detail: AdminRoommateReport }) {
  const risk = detail.riskSummary;
  const elevated = risk?.reviewPriority === "ELEVATED";
  return (
    <section className={styles.assistancePanel} aria-labelledby="assistance-heading">
      <div className={styles.assistanceHeader}>
        <div>
          <p className={styles.kicker}>Thông tin hỗ trợ</p>
          <h2 id="assistance-heading" className={styles.assistanceTitle}>
            Tín hiệu an toàn
          </h2>
        </div>
        <p className={styles.assistanceFootnote}>Tham khảo khi xem xét, không tự quyết định kết quả.</p>
      </div>
      <div className={styles.assistanceRows}>
        <details className={styles.signalGroup}>
          <summary className={styles.signalHeading}>
            <span className={styles.signalLabel}>
              <Icon name="shield" className={styles.signalIcon} />
              <span>
                <strong>Quy tắc V2</strong>
                <small>Đánh giá xác định từ dữ liệu hệ thống</small>
              </span>
            </span>
            <span className={elevated ? styles.elevatedPriority : styles.standardPriority}>
              {elevated ? "Ưu tiên xem sớm" : "Ưu tiên tiêu chuẩn"}
            </span>
            <Icon name="chevronDown" className={styles.signalChevron} />
          </summary>
          <div className={styles.signalBody}>
            {risk ? (
              <>
                <p>
                  {risk.partialEvaluation ? "Đã đánh giá một phần dữ liệu hiện có." : "Đã đánh giá dữ liệu hiện có."}
                </p>
                {risk.flags.length ? (
                  <div className={styles.signalCodes}>
                    {risk.flags.map((flag) => (
                      <span key={flag.code}>{flag.code}</span>
                    ))}
                  </div>
                ) : (
                  <p>Không có tín hiệu bổ sung.</p>
                )}
              </>
            ) : (
              <p>Chưa có dữ liệu tín hiệu.</p>
            )}
          </div>
        </details>
        <details className={styles.signalGroup}>
          <summary className={styles.signalHeading}>
            <span className={styles.signalLabel}>
              <Icon name="sparkles" className={styles.signalIcon} />
              <span>
                <strong>AI V3</strong>
                <small>Phân tích hỗ trợ, cần quản trị viên đối chiếu</small>
              </span>
            </span>
            <span className={styles.assistanceState}>{detail.aiSafetySummary ? "Có phân tích" : "Chưa phân tích"}</span>
            <Icon name="chevronDown" className={styles.signalChevron} />
          </summary>
          <div className={styles.signalBody}>
            {detail.aiSafetySummary ? (
              detail.aiSafetySummary.signalCodes.length ? (
                <div className={styles.signalCodes}>
                  {detail.aiSafetySummary.signalCodes.map((code) => (
                    <span key={code}>{code}</span>
                  ))}
                </div>
              ) : (
                <p>Không có tín hiệu được ghi nhận.</p>
              )
            ) : (
              <p>Chưa có phân tích AI cho hồ sơ này.</p>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}

function History({ detail }: { readonly detail: ReportDetail }) {
  const events = detail.events ?? [];
  return (
    <section className={styles.historySection} aria-labelledby="case-activity-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Dấu vết xử lý</p>
          <h2 id="case-activity-heading" className={styles.sectionTitle}>
            Hoạt động hồ sơ
          </h2>
        </div>
        <span className={styles.eventCount}>{events.length} sự kiện</span>
      </div>
      <div className={styles.timeline} role="list">
        {events.length ? (
          <div className={styles.ledgerHeader} aria-hidden="true">
            <span>Thời gian</span>
            <span>Sự kiện</span>
            <span>Người thực hiện</span>
            <span>Ghi chú</span>
          </div>
        ) : null}
        {events.length ? (
          events.map((event, index) => (
            <article
              key={`${event.createdAt}-${index}`}
              className={`${styles.event} ${index === events.length - 1 ? styles.eventLatest : ""}`}
              role="listitem"
            >
              <div className={styles.eventTime}>
                <time dateTime={event.createdAt}>{dateFormatter.format(new Date(event.createdAt))}</time>
                {index === events.length - 1 ? <span>Mới nhất</span> : null}
              </div>
              <div className={styles.eventHead}>
                <strong>
                  {event.previousStatus
                    ? `${reportStatusLabels[event.previousStatus as AnyReportStatus] ?? event.previousStatus} → ${reportStatusLabels[event.newStatus as AnyReportStatus] ?? event.newStatus}`
                    : (reportStatusLabels[event.newStatus as AnyReportStatus] ?? event.newStatus)}
                </strong>
              </div>
              <span className={styles.eventActor}>
                {"actorRole" in event
                  ? event.actorRole === "ADMIN"
                    ? "Quản trị viên"
                    : event.actorRole === "LANDLORD"
                      ? "Chủ trọ"
                      : "Người thuê"
                  : "Hệ thống"}
              </span>
              <p className={styles.eventNote}>{event.note ?? "Không có ghi chú."}</p>
            </article>
          ))
        ) : (
          <div className={styles.emptyActivity}>
            <Icon name="clipboard" className={styles.emptyActivityIcon} />
            <p>Chưa có sự kiện xử lý bổ sung.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Decision({
  status,
  source,
  detail,
  branch,
  pending,
  onBranch,
  onAction
}: {
  readonly status: AnyReportStatus;
  readonly source: ReportSource;
  readonly detail: ReportDetail;
  readonly branch: DecisionBranch | null;
  readonly pending: boolean;
  readonly onBranch: (value: DecisionBranch) => void;
  readonly onAction: (
    action: LifecycleStatus | RoommateModerationState,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void;
}) {
  return (
    <section className={styles.decisionSection} aria-labelledby="case-decision-heading">
      <div className={styles.decisionHeading}>
        <div>
          <p className={styles.kicker}>Bước tiếp theo</p>
          <h2 id="case-decision-heading" className={styles.sectionTitle}>
            Chọn kết luận
          </h2>
        </div>
        <Icon name="target" className={styles.decisionIcon} />
      </div>
      <div className={styles.decision}>
        <p className={styles.decisionContext}>
          {status === "INVESTIGATING"
            ? "Hồ sơ này đã được chuyển sang xem xét trước đây. Hãy chọn kết luận sau khi kiểm tra bằng chứng."
            : "Chọn hướng xử lý sau khi kiểm tra bằng chứng. Chưa đủ thông tin thì giữ báo cáo trong hàng chờ."}
        </p>
        <div className={styles.decisionActions}>
          <div className={styles.decisionOption}>
            <Button
              className={styles.decisionButton}
              variant="secondary"
              disabled={pending}
              onClick={(event) => onAction("DISMISSED", event)}
            >
              Không có căn cứ
            </Button>
            <span>Ghi lý do và đóng hồ sơ.</span>
          </div>
          <div className={`${styles.decisionOption} ${branch === "handle" ? styles.decisionOptionSelected : ""}`}>
            <Button
              className={styles.decisionButton}
              variant={branch === "handle" ? "primary" : "secondary"}
              aria-pressed={branch === "handle"}
              disabled={pending}
              onClick={() => onBranch("handle")}
            >
              Cần xử lý
            </Button>
            <span>Xem thao tác được hỗ trợ.</span>
          </div>
        </div>
        {branch === "handle" ? (
          <div className={styles.decisionPath} aria-label="Các bước xử lý được hỗ trợ">
            <div className={styles.pathHeading}>
              <span>Thao tác nguồn</span>
              <strong>Tùy chọn theo loại báo cáo</strong>
            </div>
            <SourceActions source={source} detail={detail} pending={pending} onAction={onAction} />
            <div className={styles.completionBlock}>
              <div>
                <span>Kết thúc hồ sơ</span>
                <p>Thao tác nội dung và kết luận được lưu riêng.</p>
              </div>
              <Button
                className={styles.completionButton}
                disabled={pending}
                onClick={(event) => onAction("RESOLVED", event)}
              >
                Hoàn tất xem xét
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SourceActions({
  source,
  detail,
  pending,
  onAction
}: {
  readonly source: ReportSource;
  readonly detail: ReportDetail;
  readonly pending: boolean;
  readonly onAction: (
    action: LifecycleStatus | RoommateModerationState,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void;
}) {
  if (source === "roommate") {
    const report = detail as AdminRoommateReport;
    const hasTarget =
      (report.targetType === "ROOMMATE_PROFILE" && report.subject.profileTenantId != null) ||
      (report.targetType === "ROOMMATE_REQUEST" && report.subject.requestId != null) ||
      (report.targetType === "ROOMMATE_MESSAGE" && report.subject.messageId != null);
    return hasTarget ? (
      <TargetActions pending={pending} onAction={onAction} />
    ) : (
      <div className={styles.actionOptions}>
        <strong>Chưa có thao tác trực tiếp</strong>
        <p>Không tìm thấy đối tượng để thay đổi hiển thị. Bạn vẫn có thể ghi lại kết luận và hoàn tất xem xét.</p>
      </div>
    );
  }
  if (source === "listing") {
    const listing = (detail as AdminListingReport).listing;
    if (listing.status !== "APPROVED" && listing.status !== "HIDDEN") {
      return (
        <div className={styles.actionOptions}>
          <strong>Chưa có thao tác trực tiếp</strong>
          <p>Trạng thái hiện tại của tin không cho phép ẩn hoặc khôi phục. Hoàn tất xem xét không thay đổi tin đăng.</p>
        </div>
      );
    }
    return (
      <div className={styles.actionOptions}>
        <strong>Thao tác với tin đăng</strong>
        <p>
          Trang kiểm duyệt tin có các thao tác phù hợp với trạng thái hiện tại của tin. Báo cáo vẫn mở sau thao tác đó.
        </p>
        <Link href={`/admin/listings/${listing.id}`}>Mở trang kiểm duyệt tin</Link>
      </div>
    );
  }
  return (
    <div className={styles.actionOptions}>
      <strong>Chưa có thao tác trực tiếp</strong>
      <p>
        {source === "contact"
          ? "Hồ sơ này chưa có thao tác trực tiếp lên tin nhắn hoặc tài khoản. Hoàn tất xem xét không chặn liên hệ hay thay đổi tài khoản."
          : "Hồ sơ này chưa có thao tác trực tiếp lên đánh giá đã công khai. Hoàn tất xem xét không thay đổi đánh giá."}
      </p>
    </div>
  );
}

function TargetActions({
  pending,
  onAction
}: {
  readonly pending: boolean;
  readonly onAction: (action: RoommateModerationState, event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className={styles.actionOptions}>
      <strong>Hiển thị đối tượng được báo cáo</strong>
      <p>
        Ẩn hoặc khôi phục hiển thị không tự đóng báo cáo. Trạng thái hiển thị hiện tại không có trong dữ liệu hồ sơ này.
      </p>
      <div className={styles.decisionActions}>
        <Button variant="danger" disabled={pending} onClick={(event) => onAction("HIDDEN", event)}>
          Ẩn nội dung
        </Button>
        <Button variant="secondary" disabled={pending} onClick={(event) => onAction("VISIBLE", event)}>
          Khôi phục hiển thị
        </Button>
      </div>
    </div>
  );
}
function FinalResult({ detail }: { readonly detail: ReportDetail }) {
  const assignedAdminId = "assignedAdminId" in detail ? detail.assignedAdminId : null;
  return (
    <section className={styles.resultSection} aria-labelledby="case-result-heading">
      <div className={styles.resultHeader}>
        <div>
          <p className={styles.kicker}>Kết quả đã lưu</p>
          <h2 id="case-result-heading" className={styles.sectionTitle}>
            Hồ sơ đã kết thúc
          </h2>
        </div>
        <Icon name="check" className={styles.resultIcon} />
      </div>
      <div
        className={`${styles.result} ${detail.status === "RESOLVED" ? styles.resultResolved : styles.resultDismissed}`}
      >
        <span className={`${styles.status} ${styles[`status${detail.status}`]}`}>
          {reportStatusLabels[detail.status]}
        </span>
        <strong>{detail.status === "RESOLVED" ? "Đã hoàn tất xem xét" : "Không cần xử lý"}</strong>
        <p>{detail.resolutionNote ?? "Không có ghi chú kết luận."}</p>
        <div className={styles.resultMeta}>
          {assignedAdminId ? <span>Quản trị viên #{assignedAdminId}</span> : null}
          {detail.resolvedAt ? (
            <time dateTime={detail.resolvedAt}>{dateFormatter.format(new Date(detail.resolvedAt))}</time>
          ) : null}
        </div>
      </div>
    </section>
  );
}
