"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, type BadgeVariant } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { AccountStatusBadge } from "../../components/ui/status-badge";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminUserDetail, UserRole } from "../../types/api";
import { adminUserReturnUrl } from "./admin-user-query";
import styles from "./admin-users.module.css";

type DetailState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "success"; readonly detail: AdminUserDetail }
  | { readonly status: "error"; readonly error: ApiError | null };

const rolePresentation: Record<UserRole, { readonly label: string; readonly variant: BadgeVariant }> = {
  TENANT: { label: "Người thuê", variant: "neutral" },
  LANDLORD: { label: "Người cho thuê", variant: "primary" },
  ADMIN: { label: "Quản trị viên", variant: "info" }
};

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short"
});

function parseUserId(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function actionLabel(detail: AdminUserDetail): string {
  return detail.isActive ? "Ngừng hoạt động" : "Kích hoạt lại";
}

function actionDescription(detail: AdminUserDetail): string {
  if (detail.role === "LANDLORD") {
    return detail.isActive
      ? "Tài khoản sẽ mất quyền truy cập. Các tin đang được duyệt vẫn giữ nguyên trạng thái, nhưng tin đã duyệt sẽ ngừng xuất hiện trong tìm kiếm công khai và danh sách yêu thích."
      : "Tài khoản sẽ có thể truy cập lại. Các tin đã duyệt có thể xuất hiện công khai trở lại nếu vẫn đáp ứng các điều kiện hiển thị hiện hành.";
  }
  return detail.isActive
    ? "Tài khoản người thuê sẽ mất quyền truy cập vào các chức năng RentMate yêu cầu đăng nhập."
    : "Tài khoản người thuê sẽ có thể đăng nhập và sử dụng lại các chức năng được bảo vệ.";
}

export function AdminUserDetailPage({ userId: rawUserId }: { readonly userId: string }) {
  const searchParams = useSearchParams();
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const userId = parseUserId(rawUserId);
  const returnHref = adminUserReturnUrl(new URLSearchParams(searchParams.toString()));
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const requestId = useRef(0);
  const actionTriggerRef = useRef<HTMLButtonElement>(null);
  const mutationInFlight = useRef(false);

  useEffect(() => setMounted(true), []);

  const loadDetail = useCallback(async (): Promise<AdminUserDetail | null> => {
    if (!adminReady || userId === null) return null;
    const currentRequest = ++requestId.current;
    setState({ status: "loading" });
    try {
      const detail = await api.admin.getUser(userId);
      if (currentRequest !== requestId.current) return null;
      setState({ status: "success", detail });
      return detail;
    } catch (error) {
      if (currentRequest !== requestId.current) return null;
      const apiError = error instanceof ApiError ? error : null;
      setState({ status: "error", error: apiError });
      if (apiError?.status === 401) void refresh();
      return null;
    }
  }, [adminReady, refresh, userId]);

  useEffect(() => {
    void loadDetail();
    return () => {
      requestId.current += 1;
    };
  }, [loadDetail]);

  const recoverCanonicalState = async (uncertainOutcome: boolean) => {
    const canonical = await loadDetail();
    if (!canonical) {
      setRecoveryRequired(true);
      setWarningMessage(
        "Chưa thể tải lại trạng thái chính thức. Hãy thử tải lại trước khi thực hiện thêm thao tác với tài khoản."
      );
      return;
    }
    setRecoveryRequired(false);
    setWarningMessage(null);
    setSuccessMessage(
      uncertainOutcome
        ? `Đã tải lại trạng thái chính thức: tài khoản hiện ${canonical.isActive ? "đang hoạt động" : "đã ngừng hoạt động"}.`
        : `Đã cập nhật và tải lại trạng thái chính thức: tài khoản hiện ${canonical.isActive ? "đang hoạt động" : "đã ngừng hoạt động"}.`
    );
  };

  const confirmActivation = async (detail: AdminUserDetail) => {
    if (mutationInFlight.current || detail.role === "ADMIN" || recoveryRequired) return;
    mutationInFlight.current = true;
    setMutationPending(true);
    setActionError(null);
    setSuccessMessage(null);
    setWarningMessage(null);
    try {
      await api.admin.setActivation(detail.id, { isActive: !detail.isActive });
      setDialogOpen(false);
      await recoverCanonicalState(false);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      if (apiError?.code === "NETWORK_ERROR") {
        setDialogOpen(false);
        setRecoveryRequired(true);
        setWarningMessage("Kết quả yêu cầu chưa rõ. Đang tải lại trạng thái chính thức của tài khoản…");
        await recoverCanonicalState(true);
      } else {
        setActionError(
          apiError?.status === 403
            ? "Bạn không được phép thay đổi tài khoản này."
            : apiError?.status === 404
              ? "Không còn tìm thấy tài khoản này."
              : "Không thể thay đổi trạng thái tài khoản lúc này."
        );
      }
    } finally {
      mutationInFlight.current = false;
      setMutationPending(false);
    }
  };

  const retryRecovery = async () => {
    setSuccessMessage(null);
    await recoverCanonicalState(true);
  };

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
  if (userId === null)
    return <ErrorState title="Mã tài khoản không hợp lệ" message="Hãy quay lại danh bạ người dùng." />;
  if (!mounted) return <LoadingState message="Đang mở không gian tài khoản…" />;

  const detail = state.status === "success" ? state.detail : null;
  const displayName = detail?.displayName ?? (detail ? "Tài khoản chưa đặt tên" : `Tài khoản #${userId}`);
  const role = detail ? rolePresentation[detail.role] : null;

  return (
    <section aria-labelledby="admin-user-detail-heading" className={styles.page}>
      <header className={styles.detailHeader}>
        <Link href={returnHref} className={styles.backLink}>
          <Icon name="arrow" className={styles.backIcon} />
          Về danh sách người dùng
        </Link>
        <div className={styles.detailIdentity}>
          <span className={styles.detailAvatar} aria-hidden="true">
            {(detail?.displayName ?? detail?.email ?? String(userId)).slice(0, 1).toLocaleUpperCase("vi-VN")}
          </span>
          <div className={styles.detailHeading}>
            <p className={styles.eyebrow}>Không gian tài khoản</p>
            <h1 id="admin-user-detail-heading" className={styles.detailTitle}>
              {displayName}
            </h1>
            {detail ? <p className={styles.detailEmail}>{detail.email}</p> : null}
          </div>
          {detail ? (
            <div className={styles.detailStatus}>
              <AccountStatusBadge isActive={detail.isActive} />
            </div>
          ) : null}
        </div>
      </header>

      {successMessage ? (
        <div role="status" className={styles.successMessage}>
          {successMessage}
        </div>
      ) : null}
      {warningMessage ? (
        <div role="alert" tabIndex={-1} className={styles.warningMessage}>
          <p>{warningMessage}</p>
          {recoveryRequired && state.status === "error" ? (
            <Button size="sm" onClick={() => void retryRecovery()}>
              Tải lại trạng thái
            </Button>
          ) : null}
        </div>
      ) : null}

      {state.status === "idle" || state.status === "loading" ? (
        <LoadingState message="Đang tải thông tin tài khoản…" className={styles.feedback} />
      ) : null}
      {state.status === "error" && !recoveryRequired ? (
        <ErrorState
          title={state.error?.status === 404 ? "Không tìm thấy tài khoản" : "Không thể tải tài khoản"}
          message={
            state.error?.status === 404
              ? "Tài khoản này không tồn tại hoặc không còn khả dụng."
              : state.error?.status === 401
                ? "Phiên đăng nhập không còn hợp lệ."
                : "Thông tin tài khoản chưa thể tải lúc này."
          }
          requestId={state.error?.requestId}
          action={<Button onClick={() => void loadDetail()}>Thử lại</Button>}
          className={styles.feedback}
        />
      ) : null}

      {detail && role ? (
        <div className={`${styles.detailWorkspace} ${detail.role === "ADMIN" ? styles.detailWorkspaceSingle : ""}`}>
          <div className={styles.informationSurface}>
            <section aria-labelledby="account-identity-heading" className={styles.informationSection}>
              <p className={styles.sectionKicker}>Nhận diện tài khoản</p>
              <h2 id="account-identity-heading" className={styles.sectionTitle}>
                Thông tin người dùng
              </h2>
              <dl className={styles.factGrid}>
                <div>
                  <dt>Tên hiển thị</dt>
                  <dd>{detail.displayName ?? "Chưa đặt tên hiển thị"}</dd>
                </div>
                <div>
                  <dt>ID người dùng</dt>
                  <dd>#{detail.id}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{detail.email}</dd>
                </div>
                <div>
                  <dt>Số điện thoại</dt>
                  <dd>{detail.phone ?? "Chưa cung cấp"}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="account-state-heading" className={styles.informationSection}>
              <p className={styles.sectionKicker}>Tài khoản</p>
              <h2 id="account-state-heading" className={styles.sectionTitle}>
                Vai trò và trạng thái
              </h2>
              <dl className={styles.factGrid}>
                <div>
                  <dt>Vai trò</dt>
                  <dd>
                    <Badge variant={role.variant}>{role.label}</Badge>
                  </dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>
                    <AccountStatusBadge isActive={detail.isActive} />
                  </dd>
                </div>
                <div>
                  <dt>Ngày tạo</dt>
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
              </dl>
              {detail.role === "ADMIN" ? (
                <p className={styles.readOnlyNote}>Tài khoản quản trị được hiển thị ở chế độ chỉ xem.</p>
              ) : null}
            </section>

            <section aria-labelledby="account-verification-heading" className={styles.informationSection}>
              <p className={styles.sectionKicker}>Xác minh liên hệ</p>
              <h2 id="account-verification-heading" className={styles.sectionTitle}>
                Trạng thái xác minh
              </h2>
              <div className={styles.verificationList}>
                <VerificationItem label="Email" verified={detail.emailVerified} />
                <VerificationItem label="Điện thoại" verified={detail.phoneVerified} />
              </div>
            </section>
          </div>

          {detail.role !== "ADMIN" ? (
            <aside className={styles.actionPanel} aria-labelledby="account-action-heading">
              <p className={styles.sectionKicker}>Thao tác tài khoản</p>
              <h2 id="account-action-heading" className={styles.actionTitle}>
                Quyền truy cập RentMate
              </h2>
              <div className={styles.actionState}>
                <span>Hiện tại</span>
                <AccountStatusBadge isActive={detail.isActive} />
              </div>
              <p className={styles.actionCopy}>{actionDescription(detail)}</p>
              <Button
                ref={actionTriggerRef}
                variant={detail.isActive ? "danger" : "primary"}
                className={styles.actionButton}
                disabled={recoveryRequired}
                onClick={() => {
                  setActionError(null);
                  setDialogOpen(true);
                }}
              >
                {actionLabel(detail)}
              </Button>
            </aside>
          ) : null}

          <Dialog
            open={dialogOpen}
            title={`${actionLabel(detail)} tài khoản?`}
            description="Kiểm tra tác động trước khi thay đổi quyền truy cập."
            triggerRef={actionTriggerRef}
            onClose={() => {
              if (!mutationPending) setDialogOpen(false);
            }}
            actions={
              <>
                <Button variant="secondary" disabled={mutationPending} onClick={() => setDialogOpen(false)}>
                  Hủy
                </Button>
                <Button
                  variant={detail.isActive ? "danger" : "primary"}
                  pending={mutationPending}
                  pendingLabel="Đang cập nhật…"
                  onClick={() => void confirmActivation(detail)}
                >
                  {actionLabel(detail)}
                </Button>
              </>
            }
          >
            <p className={styles.dialogSummary}>{actionDescription(detail)}</p>
            {actionError ? (
              <p role="alert" className="mt-3 text-sm font-semibold text-danger">
                {actionError}
              </p>
            ) : null}
          </Dialog>
        </div>
      ) : null}
    </section>
  );
}

function VerificationItem({ label, verified }: { readonly label: string; readonly verified: boolean }) {
  return (
    <div className={styles.verificationItem}>
      <span className={styles.verificationLabel}>
        <Icon name={verified ? "check" : "minus"} className={styles.verificationIcon} />
        {label}
      </span>
      <Badge variant={verified ? "verified" : "neutral"}>{verified ? "Đã xác minh" : "Chưa xác minh"}</Badge>
    </div>
  );
}
