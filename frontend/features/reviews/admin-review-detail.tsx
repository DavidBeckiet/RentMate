"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminListingReview, ReviewStatus } from "../../types/api";
import { reviewReturnUrl, reviewStatusLabels } from "./admin-review-query";
import styles from "./admin-review-detail.module.css";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

function parseReviewId(value: string): number | null {
  if (!/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isTerminalError(error: ApiError | null): boolean {
  return error?.status === 401 || error?.status === 403 || error?.status === 404;
}

function statusClass(status: ReviewStatus): string {
  if (status === "PENDING") return styles.statusPending;
  if (status === "APPROVED") return styles.statusApproved;
  return styles.statusRejected;
}

type LoadStatus = "idle" | "loading" | "success" | "error";
type Decision = Exclude<ReviewStatus, "PENDING">;

export function AdminReviewDetail({ reviewId: rawReviewId }: { readonly reviewId: string }) {
  const searchParams = useSearchParams();
  const returnHref = reviewReturnUrl(new URLSearchParams(searchParams.toString()));
  const reviewId = parseReviewId(rawReviewId);
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const approveTriggerRef = useRef<HTMLButtonElement>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement>(null);
  const requestSequence = useRef(0);
  const detailRef = useRef<AdminListingReview | null>(null);
  const focusInitialHeading = useRef(false);
  const [detail, setDetail] = useState<AdminListingReview | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const [recoveryLocked, setRecoveryLocked] = useState(false);
  const [message, setMessage] = useState<{ readonly kind: "success" | "warning"; readonly text: string } | null>(null);

  const loadDetail = useCallback(
    async (preserveVisibleDetail = false, initialLoad = false): Promise<AdminListingReview | null> => {
      if (!adminReady || reviewId === null) return null;
      const sequence = ++requestSequence.current;
      setLoadStatus("loading");
      setLoadError(null);
      try {
        const current = await api.admin.getReview(reviewId);
        if (sequence !== requestSequence.current) return null;
        detailRef.current = current;
        setDetail(current);
        setLoadStatus("success");
        return current;
      } catch (caught: unknown) {
        if (sequence !== requestSequence.current) return null;
        const error = caught instanceof ApiError ? caught : null;
        if (initialLoad) focusInitialHeading.current = false;
        setLoadError(error);
        if (isTerminalError(error)) {
          detailRef.current = null;
          setDetail(null);
          setLoadStatus("error");
          return null;
        }
        setLoadStatus(preserveVisibleDetail && detailRef.current ? "success" : "error");
        return null;
      }
    },
    [adminReady, reviewId]
  );

  useEffect(() => {
    detailRef.current = null;
    setDetail(null);
    setMessage(null);
    setRecoveryLocked(false);
    focusInitialHeading.current = true;
    void loadDetail(false, true);
    return () => {
      requestSequence.current += 1;
    };
  }, [loadDetail]);

  useEffect(() => {
    if (focusInitialHeading.current && loadStatus === "success" && detail) {
      focusInitialHeading.current = false;
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [detail, loadStatus]);

  const recoverCanonicalState = async (kind: "success" | "conflict" | "uncertain" | "retry"): Promise<boolean> => {
    setRecoveryLocked(true);
    const canonical = await loadDetail(true);
    if (!canonical) {
      if (detailRef.current) {
        setMessage({
          kind: "warning",
          text: "Chưa thể xác nhận trạng thái hiện tại. Nội dung dưới đây là lần tải thành công gần nhất; hãy tải lại đánh giá trước khi thực hiện thêm thao tác."
        });
      }
      return false;
    }

    setRecoveryLocked(false);
    if (kind === "success") {
      setMessage({ kind: "success", text: "Đã tải lại trạng thái chính thức của đánh giá." });
    } else if (kind === "conflict") {
      setMessage({ kind: "warning", text: "Đánh giá đã thay đổi. Hãy xem trạng thái mới trước khi thao tác tiếp." });
    } else if (kind === "uncertain") {
      setMessage({ kind: "warning", text: "Đã tải lại trạng thái chính thức của đánh giá." });
    } else {
      setMessage({ kind: "success", text: "Đã tải lại đánh giá theo trạng thái chính thức." });
    }
    return true;
  };

  const transition = async (next: Decision) => {
    if (!detail || mutationPending || recoveryLocked) return;
    const normalizedNote = note.trim();
    if (!normalizedNote) {
      setNoteError("Cần nhập ghi chú nội bộ trước khi đưa ra quyết định.");
      setDecision(null);
      requestAnimationFrame(() => document.getElementById("review-moderation-note")?.focus());
      return;
    }

    setMutationPending(true);
    setMessage(null);
    setNoteError(null);
    try {
      await api.admin.moderateReview(detail.id, { status: next, note: normalizedNote });
      setDecision(null);
      await recoverCanonicalState("success");
    } catch (caught: unknown) {
      const error = caught instanceof ApiError ? caught : null;
      setDecision(null);
      if (error?.status === 409) {
        await recoverCanonicalState("conflict");
      } else if (error?.category === "network") {
        await recoverCanonicalState("uncertain");
      } else if (error?.status === 401 || error?.status === 403 || error?.status === 404) {
        detailRef.current = null;
        setDetail(null);
        setLoadError(error);
        setLoadStatus("error");
        setRecoveryLocked(true);
        setMessage(null);
      } else {
        setMessage({ kind: "warning", text: "Chưa thể lưu quyết định lúc này." });
      }
    } finally {
      setMutationPending(false);
    }
  };

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
    return (
      <ErrorState
        headingLevel="h1"
        title="Đăng nhập quản trị viên để tiếp tục"
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên để tiếp tục."
        action={<Link href="/admin/login">Đăng nhập quản trị</Link>}
      />
    );
  }
  if (authStatus === "error") {
    return (
      <ErrorState
        headingLevel="h1"
        title="Không thể kiểm tra tài khoản"
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!adminReady) {
    return <ErrorState headingLevel="h1" title="Không có quyền truy cập" message="Trang này dành cho quản trị viên." />;
  }
  if (reviewId === null) {
    return (
      <ErrorState
        headingLevel="h1"
        title="Mã đánh giá không hợp lệ"
        message="Hãy quay lại hàng đợi đánh giá để chọn một đánh giá hợp lệ."
        action={<Link href={returnHref}>Về hàng đợi đánh giá</Link>}
      />
    );
  }
  if ((loadStatus === "idle" || loadStatus === "loading") && !detail) {
    return <LoadingState message="Đang tải đánh giá…" />;
  }
  if (loadStatus === "error" && !detail) {
    const status = loadError?.status;
    const notFound = status === 404;
    return (
      <ErrorState
        headingLevel="h1"
        title={
          notFound
            ? "Không tìm thấy đánh giá"
            : status === 401
              ? "Phiên đăng nhập không còn hợp lệ"
              : status === 403
                ? "Không có quyền xem đánh giá"
                : "Không thể tải đánh giá"
        }
        message={
          notFound
            ? "Đánh giá này không tồn tại hoặc không còn khả dụng."
            : status === 401
              ? "Phiên đăng nhập không còn hợp lệ."
              : status === 403
                ? "Tài khoản của bạn không có quyền xem đánh giá này."
                : "Thông tin đánh giá chưa thể tải lúc này."
        }
        requestId={loadError?.requestId}
        action={
          notFound ? (
            <Link href={returnHref}>Về hàng đợi đánh giá</Link>
          ) : (
            <Button onClick={() => void (recoveryLocked ? recoverCanonicalState("retry") : loadDetail())}>
              Thử lại
            </Button>
          )
        }
      />
    );
  }
  if (!detail) return null;

  const actionable = detail.status === "PENDING";
  const controlsLocked = mutationPending || recoveryLocked || loadStatus === "loading";
  const decisionTrigger = decision === "APPROVED" ? approveTriggerRef : rejectTriggerRef;
  const approveDialog = decision === "APPROVED";

  return (
    <section className={styles.page} aria-labelledby="admin-review-detail-heading">
      <header className={styles.header}>
        <Link href={returnHref} className={styles.backLink}>
          <Icon name="arrow" className={styles.backIcon} />
          Về hàng đợi đánh giá
        </Link>
        <div className={styles.identityLine}>
          <span className={styles.eyebrow}>Hồ sơ đánh giá · #{detail.id}</span>
          <span className={`${styles.status} ${statusClass(detail.status)}`}>{reviewStatusLabels[detail.status]}</span>
        </div>
        <h1 ref={headingRef} id="admin-review-detail-heading" tabIndex={-1} className={styles.title}>
          Đánh giá #{detail.id}
        </h1>
        <p className={styles.subline}>
          Gửi lúc <time dateTime={detail.createdAt}>{dateTimeFormatter.format(new Date(detail.createdAt))}</time>
        </p>
      </header>

      {message ? (
        <div
          role={message.kind === "warning" ? "alert" : "status"}
          className={message.kind === "warning" ? styles.warning : styles.success}
        >
          <p>{message.text}</p>
          {recoveryLocked ? (
            <Button size="sm" className={styles.retryButton} onClick={() => void recoverCanonicalState("retry")}>
              Tải lại đánh giá
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.workspace}>
        <div className={styles.evidenceColumn}>
          <section className={styles.evidence} aria-labelledby="review-content-heading">
            <p className={styles.kicker}>Bằng chứng chính</p>
            <h2 id="review-content-heading" className={styles.sectionTitle}>
              Nội dung đánh giá
            </h2>
            <p className={styles.comment}>{detail.comment}</p>
          </section>

          <section className={styles.evidence} aria-labelledby="review-scores-heading">
            <p className={styles.kicker}>Các tiêu chí đã chấm</p>
            <h2 id="review-scores-heading" className={styles.sectionTitle}>
              Điểm đánh giá
            </h2>
            <dl className={styles.scoreGrid}>
              <div>
                <dt>Điểm tổng quan</dt>
                <dd aria-label={`Điểm tổng quan ${detail.overallRating} trên 5`}>{detail.overallRating}/5</dd>
              </div>
              <div>
                <dt>Độ chính xác</dt>
                <dd aria-label={`Độ chính xác ${detail.accuracyRating} trên 5`}>{detail.accuracyRating}/5</dd>
              </div>
              <div>
                <dt>Khả năng phản hồi</dt>
                <dd aria-label={`Khả năng phản hồi ${detail.responsivenessRating} trên 5`}>
                  {detail.responsivenessRating}/5
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className={styles.rail} aria-label="Ngữ cảnh và quyết định đánh giá">
          <section className={styles.context} aria-labelledby="review-context-heading">
            <p className={styles.kicker}>Ngữ cảnh liên quan</p>
            <h2 id="review-context-heading" className={styles.sectionTitle}>
              Thông tin liên quan
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Người thuê</dt>
                <dd>#{detail.tenantId}</dd>
              </div>
              <div>
                <dt>Tin đăng</dt>
                <dd>
                  <Link href={`/admin/listings/${detail.listingId}`} className={styles.inlineLink}>
                    #{detail.listingId} <Icon name="arrowUpRight" />
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Liên hệ</dt>
                <dd>#{detail.inquiryId}</dd>
              </div>
            </dl>
          </section>

          {!actionable ? (
            <section className={styles.outcome} aria-labelledby="review-outcome-heading">
              <p className={styles.kicker}>Kết quả cuối</p>
              <h2 id="review-outcome-heading" className={styles.sectionTitle}>
                Đã hoàn tất kiểm duyệt
              </h2>
              <p className={styles.outcomeStatus}>{reviewStatusLabels[detail.status]}</p>
              <p className={styles.outcomeNote}>{detail.moderationNote}</p>
              <p className={styles.outcomeMeta}>
                Quản trị viên #{detail.reviewedByAdminId ?? "—"}
                {detail.reviewedAt ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <time dateTime={detail.reviewedAt}>{dateTimeFormatter.format(new Date(detail.reviewedAt))}</time>
                  </>
                ) : null}
              </p>
            </section>
          ) : (
            <section className={styles.decision} aria-labelledby="review-decision-heading">
              <p className={styles.kicker}>Quyết định</p>
              <h2 id="review-decision-heading" className={styles.sectionTitle}>
                Xử lý đánh giá đang chờ
              </h2>
              <p className={styles.decisionCopy}>
                Ghi chú chỉ lưu nội bộ để giải thích quyết định, không gửi cho người viết.
              </p>
              <label htmlFor="review-moderation-note" className={styles.noteLabel}>
                Ghi chú kiểm duyệt
                <textarea
                  id="review-moderation-note"
                  value={note}
                  rows={5}
                  maxLength={1000}
                  disabled={controlsLocked}
                  aria-invalid={Boolean(noteError)}
                  aria-describedby={noteError ? "review-moderation-note-error" : undefined}
                  onChange={(event) => {
                    setNote(event.target.value);
                    if (noteError) setNoteError(null);
                  }}
                  className={`${styles.textarea} ${noteError ? styles.textareaError : ""}`}
                />
              </label>
              {noteError ? (
                <p id="review-moderation-note-error" className={styles.fieldError}>
                  {noteError}
                </p>
              ) : null}
              <div className={styles.decisionButtons}>
                <Button
                  ref={approveTriggerRef}
                  disabled={controlsLocked}
                  onClick={() => {
                    if (!note.trim()) {
                      setNoteError("Cần nhập ghi chú nội bộ trước khi đưa ra quyết định.");
                      document.getElementById("review-moderation-note")?.focus();
                      return;
                    }
                    setDecision("APPROVED");
                  }}
                >
                  Duyệt đánh giá
                </Button>
                <Button
                  ref={rejectTriggerRef}
                  variant="danger"
                  disabled={controlsLocked}
                  onClick={() => {
                    if (!note.trim()) {
                      setNoteError("Cần nhập ghi chú nội bộ trước khi đưa ra quyết định.");
                      document.getElementById("review-moderation-note")?.focus();
                      return;
                    }
                    setDecision("REJECTED");
                  }}
                >
                  Từ chối đánh giá
                </Button>
              </div>
            </section>
          )}
        </aside>
      </div>

      <Dialog
        open={decision !== null}
        title={approveDialog ? "Duyệt đánh giá?" : "Từ chối đánh giá?"}
        description={
          approveDialog
            ? "Đây là quyết định cuối cùng cho đánh giá này."
            : "Đây là quyết định cuối cùng cho đánh giá này."
        }
        triggerRef={decisionTrigger}
        onClose={() => setDecision(null)}
        actions={
          <>
            <Button variant="secondary" disabled={mutationPending} onClick={() => setDecision(null)}>
              Quay lại
            </Button>
            <Button
              variant={approveDialog ? "primary" : "danger"}
              pending={mutationPending}
              onClick={() => void transition(decision!)}
            >
              {approveDialog ? "Duyệt đánh giá" : "Từ chối đánh giá"}
            </Button>
          </>
        }
      >
        <p className={styles.dialogCopy}>
          {approveDialog
            ? "Trạng thái sẽ chuyển thành Đã duyệt. Việc duyệt không đảm bảo đánh giá được hiển thị ngay; việc hiển thị còn phụ thuộc trạng thái công khai của tin đăng."
            : "Trạng thái sẽ chuyển thành Đã từ chối. Đánh giá sẽ không xuất hiện công khai và quyết định này là cuối cùng."}
        </p>
      </Dialog>
    </section>
  );
}
