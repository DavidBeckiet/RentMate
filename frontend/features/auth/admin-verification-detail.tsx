"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminLandlordVerification } from "../../types/api";
import { adminVerificationReturnUrl } from "./admin-verification-query";
import styles from "./admin-verification-detail.module.css";

type DetailState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "success"; readonly detail: AdminLandlordVerification }
  | { readonly status: "error"; readonly error: ApiError | null };

type DecisionStatus = "APPROVED" | "REJECTED";

const statusLabels = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã xác minh",
  REJECTED: "Đã từ chối"
} as const;

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short"
});

function parseVerificationId(rawVerificationId: string): number | null {
  if (!/^[1-9][0-9]*$/.test(rawVerificationId)) return null;
  const value = Number(rawVerificationId);
  return Number.isSafeInteger(value) ? value : null;
}

export function AdminVerificationDetail({ verificationId: rawVerificationId }: { readonly verificationId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const verificationId = parseVerificationId(rawVerificationId);
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const returnHref = adminVerificationReturnUrl(new URLSearchParams(searchParams.toString()));
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const [pageWarning, setPageWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const requestId = useRef(0);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageWarningRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const loadDetail = useCallback(async (): Promise<AdminLandlordVerification | null> => {
    if (!adminReady || verificationId === null) return null;
    const currentRequest = ++requestId.current;
    setState((current) =>
      current.status === "success" && current.detail.id === verificationId ? current : { status: "loading" }
    );
    try {
      const detail = await api.admin.getVerification(verificationId);
      if (currentRequest === requestId.current) setState({ status: "success", detail });
      return currentRequest === requestId.current ? detail : null;
    } catch (error) {
      if (currentRequest !== requestId.current) return null;
      const apiError = error instanceof ApiError ? error : null;
      setState({ status: "error", error: apiError });
      if (apiError?.status === 401) void refresh();
      return null;
    }
  }, [adminReady, refresh, verificationId]);

  useEffect(() => {
    void loadDetail();
    return () => {
      requestId.current += 1;
    };
  }, [loadDetail]);

  useEffect(
    () => () => {
      if (returnTimer.current) clearTimeout(returnTimer.current);
    },
    []
  );

  useEffect(() => {
    if (pageWarning) pageWarningRef.current?.focus();
  }, [pageWarning]);

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
  if (verificationId === null) return <ErrorState message="Mã yêu cầu xác minh không hợp lệ." />;
  if (!mounted) return <LoadingState message="Đang kiểm tra tài khoản…" />;

  const detail = state.status === "success" ? state.detail : null;

  const handleDecisionSuccess = (updated: AdminLandlordVerification) => {
    setState({ status: "success", detail: updated });
    setPageWarning(null);
    setSuccessMessage(
      updated.status === "APPROVED"
        ? "Đã duyệt hồ sơ. Đang quay lại hàng đợi xác minh…"
        : "Đã từ chối hồ sơ. Đang quay lại hàng đợi xác minh…"
    );
    if (returnTimer.current) clearTimeout(returnTimer.current);
    returnTimer.current = setTimeout(() => router.push(returnHref), 1_200);
  };

  return (
    <section aria-labelledby="verification-detail-heading" className={styles.page}>
      <header className={styles.header}>
        <Link href={returnHref} className={styles.backLink}>
          <Icon name="arrow" className={styles.backIcon} />
          Quay lại hàng đợi xác minh
        </Link>
        <div className={styles.headerMain}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>Chi tiết xác minh chủ trọ</p>
            <h1 id="verification-detail-heading" className={styles.title}>
              {detail?.displayName ?? `Yêu cầu #${verificationId}`}
            </h1>
            <div className={styles.headerMeta}>
              <span>Yêu cầu #{verificationId}</span>
              {detail ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Gửi lúc{" "}
                    <time dateTime={detail.submittedAt}>{dateTimeFormatter.format(new Date(detail.submittedAt))}</time>
                  </span>
                </>
              ) : null}
            </div>
            <p className={styles.scopeNote}>Duyệt hồ sơ và thông tin liên hệ hiện có — không phải eKYC.</p>
          </div>
          {detail ? (
            <span className={styles.status} data-status={detail.status}>
              {statusLabels[detail.status]}
            </span>
          ) : null}
        </div>
      </header>

      {successMessage ? (
        <div className={styles.successMessage} role="status" data-tone="success">
          {successMessage}
        </div>
      ) : null}
      {pageWarning ? (
        <div ref={pageWarningRef} className={styles.warningMessage} role="alert" data-tone="warning" tabIndex={-1}>
          {pageWarning}
        </div>
      ) : null}

      {state.status === "idle" || state.status === "loading" ? (
        <LoadingState message="Đang tải hồ sơ xác minh…" />
      ) : null}
      {state.status === "error" ? (
        <ErrorState
          message={
            state.error?.status === 404
              ? "Không tìm thấy yêu cầu xác minh."
              : state.error?.status === 401
                ? "Phiên đăng nhập không còn hợp lệ."
                : "Không thể tải hồ sơ xác minh."
          }
          requestId={state.error?.requestId}
          action={<Button onClick={() => void loadDetail()}>Thử lại hồ sơ</Button>}
        />
      ) : null}

      {detail ? (
        <div className={`${styles.workspace} ${detail.status === "PENDING" ? "" : styles.workspaceSingle}`}>
          <div className={styles.evidenceColumn}>
            <SubmittedVerificationEvidence detail={detail} />
            <CurrentAccountEvidence detail={detail} />
            {detail.status === "PENDING" ? null : <VerificationResult detail={detail} />}
          </div>

          {detail.status === "PENDING" ? (
            <aside className={styles.decisionColumn} aria-labelledby="verification-decision-heading">
              <VerificationDecisionPanel
                key={detail.id}
                detail={detail}
                onReloadDetail={loadDetail}
                onConflict={(message) => {
                  setSuccessMessage(null);
                  setPageWarning(message);
                }}
                onSuccess={handleDecisionSuccess}
              />
            </aside>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SubmittedVerificationEvidence({ detail }: { readonly detail: AdminLandlordVerification }) {
  return (
    <section aria-labelledby="submitted-profile-heading" className={styles.evidenceSection}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Dữ liệu người dùng khai</p>
        <h2 id="submitted-profile-heading" className={styles.sectionTitle}>
          Hồ sơ được gửi
        </h2>
      </div>
      <dl className={styles.factGrid}>
        <div className={styles.primaryFact}>
          <dt>Tên khai trong hồ sơ</dt>
          <dd>{detail.displayName}</dd>
        </div>
        <div>
          <dt>Thời điểm gửi</dt>
          <dd>
            <time dateTime={detail.submittedAt}>{dateTimeFormatter.format(new Date(detail.submittedAt))}</time>
          </dd>
        </div>
        <div>
          <dt>Cập nhật gần nhất</dt>
          <dd>
            <time dateTime={detail.updatedAt}>{dateTimeFormatter.format(new Date(detail.updatedAt))}</time>
          </dd>
        </div>
      </dl>
      <div className={styles.noteBlock}>
        <h3>Ghi chú của chủ trọ</h3>
        <p>{detail.requestNote ?? "Không có ghi chú bổ sung."}</p>
      </div>
    </section>
  );
}

function CurrentAccountEvidence({ detail }: { readonly detail: AdminLandlordVerification }) {
  return (
    <section aria-labelledby="current-account-heading" className={styles.evidenceSection}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Dữ liệu tài khoản hiện tại</p>
        <h2 id="current-account-heading" className={styles.sectionTitle}>
          Tài khoản chủ trọ
        </h2>
      </div>
      <dl className={styles.accountFacts}>
        <div>
          <dt>Mã chủ trọ</dt>
          <dd>#{detail.landlord.id}</dd>
        </div>
        <div>
          <dt>Email hiện tại</dt>
          <dd>{detail.landlord.email}</dd>
        </div>
        <div>
          <dt>Điện thoại hiện tại</dt>
          <dd>{detail.landlord.phone ?? "Không còn số điện thoại"}</dd>
        </div>
        <div>
          <dt>Trạng thái tài khoản</dt>
          <dd>{detail.landlord.isActive ? "Đang hoạt động" : "Đã vô hiệu hóa"}</dd>
        </div>
      </dl>
      {!detail.landlord.isActive || !detail.landlord.phone ? (
        <div className={styles.accountWarning} role="note">
          <strong>Cần lưu ý dữ liệu tài khoản hiện tại</strong>
          {!detail.landlord.isActive ? <p>Tài khoản chủ trọ hiện đã bị vô hiệu hóa.</p> : null}
          {!detail.landlord.phone ? <p>Tài khoản hiện không còn số điện thoại.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function VerificationResult({ detail }: { readonly detail: AdminLandlordVerification }) {
  return (
    <section aria-labelledby="verification-result-heading" className={styles.evidenceSection}>
      <div className={styles.resultHeader}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionKicker}>Kết quả của yêu cầu này</p>
          <h2 id="verification-result-heading" className={styles.sectionTitle}>
            Kết quả quản trị
          </h2>
        </div>
        <span className={styles.status} data-status={detail.status}>
          {statusLabels[detail.status]}
        </span>
      </div>
      <div className={styles.lifecycle} aria-label="Vòng đời yêu cầu">
        <span>Đã gửi</span>
        <Icon name="arrow" className={styles.lifecycleArrow} />
        <strong>Đã xử lý</strong>
      </div>
      <dl className={styles.resultFacts}>
        <div className={styles.resultNote}>
          <dt>Ghi chú quyết định</dt>
          <dd>{detail.decisionNote ?? "Không có ghi chú quyết định."}</dd>
        </div>
        <div>
          <dt>Quản trị viên xử lý</dt>
          <dd>{detail.reviewedByAdminId === null ? "Không có dữ liệu" : `#${detail.reviewedByAdminId}`}</dd>
        </div>
        <div>
          <dt>Thời điểm xử lý</dt>
          <dd>
            {detail.reviewedAt ? (
              <time dateTime={detail.reviewedAt}>{dateTimeFormatter.format(new Date(detail.reviewedAt))}</time>
            ) : (
              "Không có dữ liệu"
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function VerificationDecisionPanel({
  detail,
  onReloadDetail,
  onConflict,
  onSuccess
}: {
  readonly detail: AdminLandlordVerification;
  readonly onReloadDetail: () => Promise<AdminLandlordVerification | null>;
  readonly onConflict: (message: string) => void;
  readonly onSuccess: (updated: AdminLandlordVerification) => void;
}) {
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<DecisionStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState<{
    readonly kind: "error" | "warning" | "status";
    readonly message: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  const approveButtonRef = useRef<HTMLButtonElement>(null);
  const rejectButtonRef = useRef<HTMLButtonElement>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusAction = useRef<DecisionStatus | null>(null);
  const hintId = "verification-decision-note-hint";
  const errorId = "verification-decision-note-error";

  useEffect(() => {
    if (selectedAction) confirmationRef.current?.focus();
    if (!selectedAction && restoreFocusAction.current) {
      const action = restoreFocusAction.current;
      restoreFocusAction.current = null;
      (action === "APPROVED" ? approveButtonRef : rejectButtonRef).current?.focus();
    }
  }, [selectedAction]);

  useEffect(() => {
    if (uncertain) refreshButtonRef.current?.focus();
  }, [uncertain]);

  const prepareDecision = (status: DecisionStatus) => {
    const normalizedNote = note.trim();
    if (!normalizedNote) {
      setNoteError("Vui lòng nhập ghi chú quyết định.");
      textareaRef.current?.focus();
      return;
    }
    setNoteError(null);
    setFeedback(null);
    setSelectedAction(status);
  };

  const submitDecision = async () => {
    if (!selectedAction || pending || uncertain) return;
    const normalizedNote = note.trim();
    if (!normalizedNote) {
      setSelectedAction(null);
      setNoteError("Vui lòng nhập ghi chú quyết định.");
      textareaRef.current?.focus();
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const updated = await api.admin.reviewVerification(detail.id, {
        status: selectedAction,
        note: normalizedNote
      });
      setSelectedAction(null);
      onSuccess(updated);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      if (apiError?.status === 409) {
        setSelectedAction(null);
        const refreshed = await onReloadDetail();
        if (refreshed) {
          onConflict("Yêu cầu đã thay đổi. Dữ liệu mới nhất đã được tải lại; quyết định cũ không được gửi lại.");
        }
      } else if (apiError?.category === "network") {
        setSelectedAction(null);
        setUncertain(true);
        setFeedback({
          kind: "warning",
          message:
            "Không xác định được quyết định đã được áp dụng hay chưa. Hãy tải lại trạng thái trước khi thao tác tiếp."
        });
      } else if (apiError?.status === 422) {
        const noteDetail = apiError.details.find((item) => item.field === "note");
        setSelectedAction(null);
        setNoteError(noteDetail?.message ?? "Ghi chú quyết định không hợp lệ.");
        textareaRef.current?.focus();
      } else {
        setFeedback({ kind: "error", message: "Chưa thể lưu quyết định xác minh. Vui lòng thử lại." });
      }
    } finally {
      setPending(false);
    }
  };

  const cancelConfirmation = () => {
    restoreFocusAction.current = selectedAction;
    setSelectedAction(null);
  };

  const recover = async () => {
    setRecovering(true);
    const refreshed = await onReloadDetail();
    if (refreshed) {
      setUncertain(false);
      setFeedback(
        refreshed.status === "PENDING"
          ? { kind: "status", message: "Đã tải lại trạng thái. Bạn có thể tiếp tục đưa ra quyết định." }
          : null
      );
    }
    setRecovering(false);
  };

  const actionLabel = selectedAction === "APPROVED" ? "Duyệt hồ sơ" : "Từ chối hồ sơ";

  return (
    <div className={styles.decisionPanel}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionKicker}>Trạng thái và xử lý</p>
        <h2 id="verification-decision-heading" className={styles.sectionTitle}>
          Quyết định xác minh
        </h2>
      </div>
      <div className={styles.currentState}>
        <span>Trạng thái hiện tại</span>
        <span className={styles.status} data-status={detail.status}>
          {statusLabels[detail.status]}
        </span>
      </div>
      {!detail.landlord.isActive ? (
        <div className={styles.decisionWarning} role="note">
          Tài khoản chủ trọ hiện đã bị vô hiệu hóa. Điều này không tự động xác định kết quả hồ sơ.
        </div>
      ) : null}
      <p className={styles.decisionScope}>
        Quyết định dựa trên hồ sơ được gửi và thông tin tài khoản hiện có. Đây không phải quy trình eKYC.
      </p>

      <div className={styles.field}>
        <label htmlFor="verification-decision-note">Ghi chú quyết định (bắt buộc)</label>
        <textarea
          ref={textareaRef}
          id="verification-decision-note"
          name="note"
          rows={5}
          maxLength={1000}
          required
          aria-invalid={noteError ? "true" : undefined}
          aria-describedby={`${hintId}${noteError ? ` ${errorId}` : ""}`}
          disabled={selectedAction !== null || pending || uncertain}
          value={note}
          onChange={(event) => {
            setNote(event.currentTarget.value);
            setNoteError(null);
          }}
        />
        <div className={styles.fieldMeta}>
          <span id={hintId}>Tối đa 1.000 ký tự.</span>
          <span aria-hidden="true">{note.length}/1.000</span>
        </div>
        {noteError ? (
          <p id={errorId} className={styles.fieldError} role="alert">
            {noteError}
          </p>
        ) : null}
      </div>

      <div className={styles.actionButtons}>
        <Button
          ref={approveButtonRef}
          disabled={pending || uncertain || selectedAction !== null}
          onClick={() => prepareDecision("APPROVED")}
        >
          Duyệt hồ sơ
        </Button>
        <Button
          ref={rejectButtonRef}
          variant="danger"
          disabled={pending || uncertain || selectedAction !== null}
          onClick={() => prepareDecision("REJECTED")}
        >
          Từ chối
        </Button>
      </div>

      {selectedAction ? (
        <div className={styles.confirmation}>
          <h3 ref={confirmationRef} tabIndex={-1}>
            Xác nhận: {actionLabel}
          </h3>
          <dl>
            <div>
              <dt>Hồ sơ</dt>
              <dd>{detail.displayName}</dd>
            </div>
            <div>
              <dt>Ghi chú quyết định</dt>
              <dd>{note.trim()}</dd>
            </div>
          </dl>
          <div className={styles.confirmationButtons}>
            <Button
              variant={selectedAction === "REJECTED" ? "danger" : "primary"}
              pending={pending}
              onClick={() => void submitDecision()}
            >
              Xác nhận {selectedAction === "APPROVED" ? "duyệt hồ sơ" : "từ chối"}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={cancelConfirmation}>
              Hủy
            </Button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <div
          className={
            feedback.kind === "status"
              ? styles.successMessage
              : feedback.kind === "warning"
                ? styles.warningMessage
                : styles.alertMessage
          }
          role={feedback.kind === "status" ? "status" : "alert"}
          data-tone={feedback.kind === "status" ? "success" : feedback.kind}
        >
          <p>{feedback.message}</p>
          {uncertain ? (
            <Button ref={refreshButtonRef} pending={recovering} onClick={() => void recover()}>
              Tải lại trạng thái
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
