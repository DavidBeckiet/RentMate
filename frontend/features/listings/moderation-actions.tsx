"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { ErrorState } from "../../components/ui/feedback-states";
import { TextareaField } from "../../components/ui/form-controls";
import { api, ApiError } from "../../lib/api/client";
import type { AdminListingDetail, ModerationAction } from "../../types/api";
import styles from "./admin-listing-detail.module.css";

const actionLabels: Record<ModerationAction, string> = {
  APPROVE: "Duyệt tin",
  REJECT: "Từ chối",
  HIDE: "Ẩn tin",
  RESTORE: "Khôi phục"
};
const actionsByStatus = {
  PENDING: ["APPROVE", "REJECT"],
  APPROVED: ["HIDE"],
  HIDDEN: ["RESTORE"],
  DRAFT: [],
  REJECTED: [],
  INACTIVE: []
} as const;

const actionDialogContent: Record<
  ModerationAction,
  Readonly<{ title: string; description: string; confirmLabel: string }>
> = {
  APPROVE: {
    title: "Duyệt tin này?",
    description: "Tin sẽ chuyển sang trạng thái Đã duyệt. Trạng thái này chưa đảm bảo tin đang hiển thị công khai.",
    confirmLabel: "Duyệt tin"
  },
  REJECT: {
    title: "Từ chối tin này?",
    description: "Tin sẽ chuyển sang trạng thái Bị từ chối. Chủ trọ cần chỉnh sửa và gửi lại tin để được kiểm duyệt.",
    confirmLabel: "Từ chối tin"
  },
  HIDE: {
    title: "Ẩn tin này?",
    description: "Tin sẽ chuyển sang trạng thái Đã ẩn và không còn đủ điều kiện hiển thị công khai.",
    confirmLabel: "Ẩn tin"
  },
  RESTORE: {
    title: "Khôi phục tin này?",
    description:
      "Tin sẽ chuyển từ Đã ẩn sang Đã duyệt. Tin chỉ có thể hiển thị công khai khi các điều kiện khác cũng được đáp ứng.",
    confirmLabel: "Khôi phục tin"
  }
};

export interface ModerationActionsProps {
  readonly detail: AdminListingDetail;
  readonly onReloadCanonical: (resetHistory: boolean) => Promise<boolean>;
}

export function ModerationActions({ detail, onReloadCanonical }: ModerationActionsProps) {
  const [selectedAction, setSelectedAction] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const inFlight = useRef(false);
  const actionTriggerRef = useRef<HTMLButtonElement>(null);
  const availableActions = actionsByStatus[detail.status] as readonly ModerationAction[];
  const selectedActionRequiresReason = selectedAction === "REJECT" || selectedAction === "HIDE";

  const submit = async () => {
    if (!selectedAction || inFlight.current) return;
    const normalizedReason = selectedActionRequiresReason ? reason.trim() : "";
    if (selectedActionRequiresReason && normalizedReason.length === 0) {
      setReasonError("Vui lòng nhập lý do.");
      return;
    }
    if ([...normalizedReason].length > 1000) {
      setReasonError("Lý do không được vượt quá 1000 ký tự.");
      return;
    }
    inFlight.current = true;
    setPending(true);
    setMessage(null);
    setRequestId(null);
    try {
      await api.admin.moderate(detail.id, {
        action: selectedAction,
        ...(normalizedReason ? { reason: normalizedReason } : {})
      });
      setRecoveryRequired(true);
      const canonicalReloaded = await onReloadCanonical(true);
      setSelectedAction(null);
      setReason("");
      setReasonError(undefined);
      if (canonicalReloaded) {
        setRecoveryRequired(false);
        setMessage(
          !detail.landlord.isActive && selectedAction === "APPROVE"
            ? "Đã duyệt tin. Tin vẫn chưa xuất hiện công khai vì tài khoản người cho thuê đang ngừng hoạt động."
            : "Hành động kiểm duyệt đã được ghi nhận."
        );
      } else {
        setMessage(
          "Hành động đã được gửi nhưng chưa thể tải đủ trạng thái và lịch sử chính thức. Hãy tải lại trước khi thao tác tiếp."
        );
      }
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setRequestId(apiError?.requestId ?? null);
      if (apiError?.status === 409) {
        setSelectedAction(null);
        setReason("");
        setReasonError(undefined);
        setRecoveryRequired(true);
        const canonicalReloaded = await onReloadCanonical(false);
        if (canonicalReloaded) {
          setRecoveryRequired(false);
          setMessage("Trạng thái tin đã thay đổi. Dữ liệu mới nhất đã được tải lại; hành động không được gửi lại.");
        } else {
          setMessage(
            "Trạng thái tin đã thay đổi nhưng chưa thể tải đủ trạng thái và lịch sử. Hãy tải lại trước khi thao tác tiếp."
          );
        }
      } else if (apiError?.code === "NETWORK_ERROR" || apiError?.category === "network") {
        setSelectedAction(null);
        setReason("");
        setReasonError(undefined);
        setRecoveryRequired(true);
        setMessage(
          "Không xác định được hành động đã được áp dụng hay chưa. Đang tải lại trạng thái và lịch sử trước khi cho phép thao tác tiếp."
        );
        const canonicalReloaded = await onReloadCanonical(false);
        if (canonicalReloaded) {
          setRecoveryRequired(false);
          setMessage("Đã tải lại trạng thái và lịch sử mới nhất. Hãy xem lại hồ sơ trước khi quyết định tiếp.");
        } else {
          setMessage("Không thể tải lại trạng thái tin. Hãy tải lại trạng thái và lịch sử trước khi thao tác tiếp.");
        }
      } else if (apiError?.status === 422) {
        const reasonDetail = apiError.details.find((item) => item.field === "reason");
        if (reasonDetail) setReasonError(reasonDetail.message ?? "Lý do không hợp lệ.");
        else setMessage("Dữ liệu kiểm duyệt không hợp lệ.");
      } else {
        setMessage(
          apiError?.status === 403
            ? "Bạn không được phép thực hiện hành động này."
            : apiError?.status === 404
              ? "Không tìm thấy tin cần kiểm duyệt."
              : "Không thể hoàn tất hành động kiểm duyệt."
        );
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const recover = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const canonicalReloaded = await onReloadCanonical(false);
      setRecoveryRequired(!canonicalReloaded);
      setMessage(
        canonicalReloaded
          ? "Đã tải lại trạng thái và lịch sử mới nhất. Hãy xem lại hồ sơ trước khi quyết định tiếp."
          : "Không thể tải lại đủ trạng thái và lịch sử. Hãy thử lại trước khi thao tác tiếp."
      );
    } catch {
      setRecoveryRequired(true);
      setMessage("Không thể tải lại đủ trạng thái và lịch sử. Hãy thử lại trước khi thao tác tiếp.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const dialog = selectedAction ? actionDialogContent[selectedAction] : null;
  const handleDialogClose = useCallback(() => {
    if (!inFlight.current) setSelectedAction(null);
  }, []);

  if (availableActions.length === 0) {
    return (
      <section aria-labelledby="moderation-outcome-heading" className={styles.readOnlyOutcome}>
        <p className={styles.sectionKicker}>Kết quả kiểm duyệt</p>
        <h2 id="moderation-outcome-heading">
          {detail.status === "REJECTED" ? "Tin bị từ chối" : "Tin đang ngừng hoạt động"}
        </h2>
        <p>
          {detail.status === "REJECTED"
            ? "Tin cần được chỉnh sửa và gửi lại trước khi kiểm duyệt tiếp."
            : "Tin không có quyết định kiểm duyệt tiếp theo ở trạng thái này."}
        </p>
        {detail.currentModerationReason ? (
          <p className={styles.readOnlyReason}>
            <strong>Lý do gần nhất:</strong> {detail.currentModerationReason}
          </p>
        ) : null}
        {message ? (
          <p role="status" className={styles.successMessage}>
            {message}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="moderation-actions-heading" className={styles.actions}>
      <div className={styles.actionsHeader}>
        <h3 id="moderation-actions-heading">Quyết định</h3>
        <p>Hành động sẽ được ghi vào lịch sử kiểm duyệt.</p>
      </div>
      <div className={styles.actionButtons}>
        {availableActions.map((action) => (
          <Button
            key={action}
            ref={actionTriggerRef}
            variant={action === "REJECT" || action === "HIDE" ? "danger" : "primary"}
            disabled={pending || recoveryRequired}
            aria-haspopup="dialog"
            onClick={(event) => {
              actionTriggerRef.current = event.currentTarget;
              setSelectedAction(action);
              setReason("");
              setReasonError(undefined);
              setMessage(null);
            }}
          >
            {actionLabels[action]}
          </Button>
        ))}
      </div>
      {selectedAction && dialog ? (
        <Dialog
          open
          title={dialog.title}
          description={dialog.description}
          triggerRef={actionTriggerRef}
          onClose={handleDialogClose}
          actions={
            <>
              <Button variant="secondary" disabled={pending} onClick={() => setSelectedAction(null)}>
                Hủy
              </Button>
              <Button
                variant={selectedAction === "REJECT" || selectedAction === "HIDE" ? "danger" : "primary"}
                pending={pending}
                pendingLabel="Đang xử lý…"
                onClick={() => void submit()}
              >
                {dialog.confirmLabel}
              </Button>
            </>
          }
        >
          {selectedActionRequiresReason ? (
            <TextareaField
              id="moderation-reason"
              name="reason"
              label="Lý do"
              required
              value={reason}
              error={reasonError}
              hint="Tối đa 1000 ký tự."
              onChange={(event) => {
                setReason(event.currentTarget.value);
                setReasonError(undefined);
              }}
            />
          ) : null}
        </Dialog>
      ) : null}
      {message ? (
        recoveryRequired ? (
          <ErrorState
            message={message}
            requestId={requestId}
            action={
              <Button disabled={pending} onClick={() => void recover()}>
                Tải lại trạng thái và lịch sử
              </Button>
            }
          />
        ) : (
          <div role="status" className={styles.successMessage}>
            {message}
          </div>
        )
      ) : null}
    </section>
  );
}
