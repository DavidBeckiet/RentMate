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
import type { AdminSupportRequest, SupportRequestStatus } from "../../types/api";
import {
  supportRequestCategoryLabels,
  supportRequesterRoleLabels,
  supportRequestReturnUrl,
  supportRequestStatusLabels
} from "./admin-support-request-query";
import styles from "./admin-support-requests.module.css";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

function parseRequestId(value: string): number | null {
  if (!/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isTerminalDetailError(error: ApiError | null): boolean {
  return error?.status === 401 || error?.status === 403 || error?.status === 404;
}

function statusClassName(status: SupportRequestStatus): string {
  if (status === "OPEN") return styles.statusOpen;
  if (status === "IN_PROGRESS") return styles.statusProgress;
  return styles.statusResolved;
}

type LoadStatus = "idle" | "loading" | "success" | "error";

export function AdminSupportRequestDetail({ requestId: rawRequestId }: { readonly requestId: string }) {
  const searchParams = useSearchParams();
  const returnHref = supportRequestReturnUrl(new URLSearchParams(searchParams.toString()));
  const requestId = parseRequestId(rawRequestId);
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const completionTriggerRef = useRef<HTMLButtonElement>(null);
  const requestSequence = useRef(0);
  const detailRef = useRef<AdminSupportRequest | null>(null);
  const focusInitialHeading = useRef(false);
  const [detail, setDetail] = useState<AdminSupportRequest | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [recoveryLocked, setRecoveryLocked] = useState(false);
  const [message, setMessage] = useState<{ readonly kind: "success" | "warning"; readonly text: string } | null>(null);

  const loadDetail = useCallback(
    async (preserveVisibleDetail = false, initialLoad = false): Promise<AdminSupportRequest | null> => {
      if (!adminReady || requestId === null) return null;
      const sequence = ++requestSequence.current;
      setLoadStatus("loading");
      setLoadError(null);
      try {
        const current = await api.admin.getSupportRequest(requestId);
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
        if (isTerminalDetailError(error)) {
          detailRef.current = null;
          setDetail(null);
          setLoadStatus("error");
          return null;
        }
        setLoadStatus(preserveVisibleDetail && detailRef.current ? "success" : "error");
        return null;
      }
    },
    [adminReady, requestId]
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
          text: "Chưa thể xác nhận trạng thái hiện tại. Nội dung dưới đây là lần tải thành công gần nhất; hãy tải lại hồ sơ trước khi thực hiện thêm thao tác."
        });
      }
      return false;
    }
    setRecoveryLocked(false);
    if (kind === "success") {
      setMessage({ kind: "success", text: "Hồ sơ đã được cập nhật và tải lại theo trạng thái chính thức." });
    } else if (kind === "conflict") {
      setMessage({ kind: "warning", text: "Hồ sơ đã thay đổi. Hãy xem trạng thái mới trước khi thao tác tiếp." });
    } else if (kind === "uncertain") {
      setMessage({ kind: "warning", text: "Đã tải lại trạng thái chính thức của hồ sơ." });
    } else {
      setMessage({ kind: "success", text: "Đã tải lại hồ sơ theo trạng thái chính thức." });
    }
    return true;
  };

  const transition = async (next: Exclude<SupportRequestStatus, "OPEN">) => {
    if (!detail || mutationPending || recoveryLocked) return;
    focusInitialHeading.current = false;
    const normalizedNote = note.trim();
    if (next === "RESOLVED" && !normalizedNote) {
      setNoteError("Cần nhập ghi chú kết luận nội bộ trước khi hoàn tất hồ sơ.");
      setDialogOpen(false);
      requestAnimationFrame(() => document.getElementById("support-resolution-note")?.focus());
      return;
    }

    setMutationPending(true);
    setMessage(null);
    setNoteError(null);
    try {
      await api.admin.updateSupportRequestStatus(detail.id, {
        status: next,
        note: next === "RESOLVED" ? normalizedNote : null
      });
      setDialogOpen(false);
      await recoverCanonicalState("success");
    } catch (caught: unknown) {
      const error = caught instanceof ApiError ? caught : null;
      setDialogOpen(false);
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
        setMessage({
          kind: "warning",
          text:
            error?.status === 403
              ? "Tài khoản của bạn không có quyền cập nhật hồ sơ này."
              : error?.status === 404
                ? "Không còn tìm thấy hồ sơ hỗ trợ này."
                : "Chưa thể cập nhật hồ sơ hỗ trợ lúc này."
        });
      }
    } finally {
      setMutationPending(false);
    }
  };

  const startReview = () => void transition("IN_PROGRESS");
  const openCompletion = () => {
    const normalizedNote = note.trim();
    if (!normalizedNote) {
      setNoteError("Cần nhập ghi chú kết luận nội bộ trước khi hoàn tất hồ sơ.");
      document.getElementById("support-resolution-note")?.focus();
      return;
    }
    setNoteError(null);
    setDialogOpen(true);
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
    return (
      <ErrorState
        headingLevel="h1"
        title="Không có quyền truy cập hồ sơ hỗ trợ"
        message="Trang này dành cho quản trị viên."
      />
    );
  }
  if (requestId === null) {
    return (
      <ErrorState
        headingLevel="h1"
        title="Mã hồ sơ không hợp lệ"
        message="Hãy quay lại danh sách yêu cầu hỗ trợ để chọn một hồ sơ hợp lệ."
        action={<Link href={returnHref}>Về yêu cầu hỗ trợ</Link>}
      />
    );
  }
  if ((loadStatus === "idle" || loadStatus === "loading") && !detail)
    return <LoadingState message="Đang tải hồ sơ hỗ trợ…" />;
  if (loadStatus === "error" && !detail) {
    const isNotFound = loadError?.status === 404;
    return (
      <ErrorState
        headingLevel="h1"
        title={
          isNotFound
            ? "Không tìm thấy hồ sơ hỗ trợ"
            : loadError?.status === 401
              ? "Phiên đăng nhập không còn hợp lệ"
              : loadError?.status === 403
                ? "Không có quyền xem hồ sơ hỗ trợ"
                : "Không thể tải hồ sơ hỗ trợ"
        }
        message={
          isNotFound
            ? "Hồ sơ này không tồn tại hoặc không còn khả dụng."
            : loadError?.status === 401
              ? "Phiên đăng nhập không còn hợp lệ."
              : loadError?.status === 403
                ? "Tài khoản của bạn không có quyền xem hồ sơ này."
                : "Thông tin hồ sơ chưa thể tải lúc này."
        }
        requestId={loadError?.requestId}
        action={
          isNotFound ? (
            <Link href={returnHref}>Về yêu cầu hỗ trợ</Link>
          ) : (
            <Button onClick={() => void loadDetail()}>Thử lại</Button>
          )
        }
      />
    );
  }
  if (!detail) return null;

  const actionable = detail.status !== "RESOLVED";
  const controlsLocked = mutationPending || recoveryLocked || loadStatus === "loading";

  return (
    <section aria-labelledby="admin-support-detail-heading" className={styles.detailPage}>
      <header className={styles.detailHeader}>
        <Link href={returnHref} className={styles.backLink}>
          <Icon name="arrow" className={styles.backIcon} />
          Về yêu cầu hỗ trợ
        </Link>
        <p className={styles.eyebrow}>Hồ sơ hỗ trợ · #{detail.id}</p>
        <h1 ref={headingRef} id="admin-support-detail-heading" tabIndex={-1} className={styles.detailTitle}>
          {detail.subject}
        </h1>
        <div className={styles.identityMeta}>
          <span className={`${styles.status} ${statusClassName(detail.status)}`}>
            {supportRequestStatusLabels[detail.status]}
          </span>
          <span>{supportRequestCategoryLabels[detail.category]}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={detail.createdAt}>Tiếp nhận {dateTimeFormatter.format(new Date(detail.createdAt))}</time>
        </div>
      </header>

      {message ? (
        <div
          role={message.kind === "warning" ? "alert" : "status"}
          className={message.kind === "warning" ? styles.warningMessage : styles.statusMessage}
        >
          <p className="m-0">{message.text}</p>
          {recoveryLocked ? (
            <Button className="mt-3" size="sm" onClick={() => void recoverCanonicalState("retry")}>
              Tải lại hồ sơ
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.detailWorkspace}>
        <div className={styles.mainColumn}>
          <article className={styles.requestSurface} aria-labelledby="original-request-heading">
            <p className={styles.sectionKicker}>Nội dung người gửi</p>
            <h2 id="original-request-heading" className={styles.sectionTitle}>
              Yêu cầu ban đầu
            </h2>
            <p className={styles.message}>{detail.message}</p>
          </article>
        </div>

        <aside className={styles.sideColumn} aria-label="Ngữ cảnh và thao tác hồ sơ">
          <section className={styles.surface} aria-labelledby="support-requester-heading">
            <p className={styles.sectionKicker}>Người gửi</p>
            <h2 id="support-requester-heading" className={styles.sectionTitle}>
              Thông tin tài khoản
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>ID người dùng</dt>
                <dd>#{detail.requester.id}</dd>
              </div>
              <div>
                <dt>Vai trò</dt>
                <dd>{supportRequesterRoleLabels[detail.requester.role]}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{detail.requester.email}</dd>
              </div>
              <div>
                <dt>Trạng thái</dt>
                <dd>{detail.requester.isActive ? "Đang hoạt động" : "Ngừng hoạt động"}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.surface} aria-labelledby="support-metadata-heading">
            <p className={styles.sectionKicker}>Thông tin hồ sơ</p>
            <h2 id="support-metadata-heading" className={styles.sectionTitle}>
              Thời điểm
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Tiếp nhận</dt>
                <dd>
                  <time dateTime={detail.createdAt}>{dateTimeFormatter.format(new Date(detail.createdAt))}</time>
                </dd>
              </div>
              <div>
                <dt>Cập nhật gần nhất</dt>
                <dd>
                  <time dateTime={detail.updatedAt}>{dateTimeFormatter.format(new Date(detail.updatedAt))}</time>
                </dd>
              </div>
              {detail.resolvedAt ? (
                <div>
                  <dt>Hoàn tất</dt>
                  <dd>
                    <time dateTime={detail.resolvedAt}>{dateTimeFormatter.format(new Date(detail.resolvedAt))}</time>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {detail.status === "OPEN" ? (
            <section className={styles.actionSurface} aria-labelledby="support-actions-heading">
              <p className={styles.sectionKicker}>Thao tác hồ sơ</p>
              <h2 id="support-actions-heading" className={styles.sectionTitle}>
                Bắt đầu xem xét
              </h2>
              <div className={styles.actionGroup}>
                <Button variant="secondary" pending={mutationPending} disabled={controlsLocked} onClick={startReview}>
                  Bắt đầu xem xét
                </Button>
              </div>
            </section>
          ) : null}

          {actionable ? (
            <section className={styles.actionSurface} aria-labelledby="support-completion-heading">
              <p className={styles.sectionKicker}>Kết luận nội bộ</p>
              <h2 id="support-completion-heading" className={styles.sectionTitle}>
                Hoàn tất xem xét
              </h2>
              <div className={styles.actionGroup}>
                <div>
                  <p className={styles.actionCopy}>
                    Ghi chú được lưu trong hồ sơ nội bộ. Thao tác này không gửi phản hồi cho người gửi.
                  </p>
                  <label htmlFor="support-resolution-note" className={styles.resolutionLabel}>
                    Ghi chú kết luận nội bộ
                    <textarea
                      id="support-resolution-note"
                      className={`${styles.textarea} ${noteError ? styles.textareaError : ""}`}
                      value={note}
                      rows={4}
                      maxLength={2000}
                      disabled={controlsLocked}
                      aria-invalid={Boolean(noteError)}
                      aria-describedby={noteError ? "support-resolution-note-error" : undefined}
                      onChange={(event) => {
                        setNote(event.target.value);
                        if (noteError) setNoteError(null);
                      }}
                    />
                  </label>
                  {noteError ? (
                    <p id="support-resolution-note-error" className={styles.fieldError}>
                      {noteError}
                    </p>
                  ) : null}
                </div>
                <Button ref={completionTriggerRef} disabled={controlsLocked} onClick={openCompletion}>
                  Hoàn tất hồ sơ
                </Button>
              </div>
            </section>
          ) : null}
        </aside>

        {detail.status === "RESOLVED" ? (
          <section className={styles.outcomeSurface} aria-labelledby="support-outcome-heading">
            <p className={styles.sectionKicker}>Kết quả nội bộ</p>
            <h2 id="support-outcome-heading" className={styles.sectionTitle}>
              Hồ sơ đã kết thúc
            </h2>
            <p className={styles.outcomeNote}>{detail.resolutionNote}</p>
            <p className={styles.timestampLine}>
              <span>Quản trị viên hoàn tất #{detail.assignedAdminId}</span>
              {detail.resolvedAt ? (
                <>
                  <span aria-hidden="true">·</span>
                  <time dateTime={detail.resolvedAt}>{dateTimeFormatter.format(new Date(detail.resolvedAt))}</time>
                </>
              ) : null}
            </p>
          </section>
        ) : null}
      </div>

      <Dialog
        open={dialogOpen}
        title="Hoàn tất hồ sơ?"
        description="Hồ sơ sẽ chuyển sang trạng thái đã kết thúc."
        triggerRef={completionTriggerRef}
        onClose={() => {
          if (!mutationPending) setDialogOpen(false);
        }}
        actions={
          <>
            <Button variant="secondary" disabled={mutationPending} onClick={() => setDialogOpen(false)}>
              Quay lại
            </Button>
            <Button pending={mutationPending} pendingLabel="Đang hoàn tất…" onClick={() => void transition("RESOLVED")}>
              Hoàn tất hồ sơ
            </Button>
          </>
        }
      >
        <p className={styles.dialogCopy}>
          Đây là kết luận nội bộ, không gửi phản hồi cho người gửi. Trạng thái đã kết thúc là cuối cùng.
        </p>
      </Dialog>
    </section>
  );
}
