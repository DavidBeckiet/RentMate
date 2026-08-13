"use client";

import { useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { TextareaField } from "../../components/ui/form-controls";
import { api, ApiError } from "../../lib/api/client";
import type { AdminListingDetail, ModerationAction } from "../../types/api";

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

export interface ModerationActionsProps {
  readonly detail: AdminListingDetail;
  readonly onReloadDetail: () => Promise<void>;
  readonly onRefreshHistory: (resetToFirstPage: boolean) => void;
}

export function ModerationActions({ detail, onReloadDetail, onRefreshHistory }: ModerationActionsProps) {
  const [selectedAction, setSelectedAction] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const inFlight = useRef(false);
  const availableActions = actionsByStatus[detail.status] as readonly ModerationAction[];

  const submit = async () => {
    if (!selectedAction || inFlight.current) return;
    const normalizedReason = reason.trim();
    const requiresReason = selectedAction === "REJECT" || selectedAction === "HIDE";
    if (requiresReason && normalizedReason.length === 0) {
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
      await onReloadDetail();
      setSelectedAction(null);
      setReason("");
      setReasonError(undefined);
      setMessage(
        !detail.landlord.isActive && selectedAction === "APPROVE"
          ? "Đã duyệt tin. Tin vẫn chưa xuất hiện công khai vì tài khoản người cho thuê đang ngừng hoạt động."
          : "Hành động kiểm duyệt đã được ghi nhận."
      );
      onRefreshHistory(true);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setRequestId(apiError?.requestId ?? null);
      if (apiError?.status === 409) {
        setMessage("Trạng thái tin đã thay đổi. Dữ liệu mới nhất đang được tải lại; hành động không được gửi lại.");
        await onReloadDetail();
        onRefreshHistory(false);
      } else if (apiError?.code === "NETWORK_ERROR" || apiError?.category === "network") {
        setRecoveryRequired(true);
        setMessage(
          "Không xác định được hành động đã được áp dụng hay chưa. Hãy tải lại trạng thái và lịch sử trước khi thao tác tiếp."
        );
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
    await onReloadDetail();
    onRefreshHistory(false);
    setRecoveryRequired(false);
    setMessage(null);
  };

  return (
    <section
      aria-labelledby="moderation-actions-heading"
      className="space-y-4 rounded-xl border border-stone-200 bg-white p-6"
    >
      <div>
        <h2 id="moderation-actions-heading" className="text-xl font-semibold text-slate-950">
          Hành động kiểm duyệt
        </h2>
        <p className="mt-1 text-sm text-slate-600">Mỗi hành động sẽ được ghi vào lịch sử bất biến.</p>
      </div>
      {availableActions.length === 0 ? (
        <p className="text-sm text-slate-600">Không có hành động kiểm duyệt phù hợp với trạng thái hiện tại.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {availableActions.map((action) => (
            <Button
              key={action}
              variant={action === "REJECT" || action === "HIDE" ? "danger" : "primary"}
              disabled={pending || recoveryRequired}
              onClick={() => {
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
      )}
      {selectedAction ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-950">Xác nhận: {actionLabels[selectedAction]}</h3>
          <div className="mt-4">
            <TextareaField
              id="moderation-reason"
              name="reason"
              label="Lý do"
              required={selectedAction === "REJECT" || selectedAction === "HIDE"}
              value={reason}
              error={reasonError}
              hint="Tối đa 1000 ký tự."
              onChange={(event) => {
                setReason(event.currentTarget.value);
                setReasonError(undefined);
              }}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant={selectedAction === "REJECT" || selectedAction === "HIDE" ? "danger" : "primary"}
              pending={pending}
              onClick={() => void submit()}
            >
              Xác nhận hành động
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setSelectedAction(null)}>
              Hủy
            </Button>
          </div>
        </div>
      ) : null}
      {message ? (
        recoveryRequired ? (
          <ErrorState
            message={message}
            requestId={requestId}
            action={<Button onClick={() => void recover()}>Tải lại trạng thái và lịch sử</Button>}
          />
        ) : (
          <div role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
            {message}
          </div>
        )
      ) : null}
    </section>
  );
}
