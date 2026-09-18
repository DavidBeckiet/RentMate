"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { Toast, ToastViewport } from "../../components/ui/toast";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { mapApiErrorToFields } from "../../lib/validation/api-field-errors";
import type { OwnerListingDetail } from "../../types/api";
import { ownerEditorFields, type OwnerEditorFeedback } from "./owner-listing-editor";

type LifecycleAction = "submit" | "deactivate" | "reactivate" | "delete";

interface OwnerLifecycleActionsProps {
  readonly detail: OwnerListingDetail;
  readonly blocked: boolean;
  readonly onDetailChange: (detail: OwnerListingDetail) => void;
  readonly onEditorFeedback: (feedback: OwnerEditorFeedback | null) => void;
  readonly onRefresh: () => void;
}

interface ActionFeedback {
  readonly message: string;
  readonly requestId: string | null;
  readonly refreshSuggested: boolean;
}

const genericUnavailable = "Tin đăng không tồn tại hoặc bạn không thể truy cập.";
const staleMessage = "Trạng thái tin đã thay đổi. Hãy tải lại tin trước khi tiếp tục.";
const ambiguousLifecycle = "Không thể xác nhận trạng thái mới. Hãy tải lại tin trước khi thử lại.";

function actionError(action: LifecycleAction, error: unknown): ActionFeedback {
  if (!(error instanceof ApiError)) {
    return {
      message: "Không thể hoàn tất tác vụ lúc này. Vui lòng thử lại sau.",
      requestId: null,
      refreshSuggested: false
    };
  }
  if (error.status === 401) {
    return {
      message: "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.",
      requestId: error.requestId,
      refreshSuggested: false
    };
  }
  if (error.status === 403) {
    return {
      message: "Bạn không có quyền thực hiện tác vụ này.",
      requestId: error.requestId,
      refreshSuggested: false
    };
  }
  if (error.status === 404) {
    return { message: genericUnavailable, requestId: error.requestId, refreshSuggested: false };
  }
  if (error.status === 409) {
    if (action === "delete" && error.code === "LISTING_DELETE_NOT_ALLOWED") {
      return {
        message: "Tin này không thể xóa vĩnh viễn vì đã có lịch sử kiểm duyệt hoặc không còn đủ điều kiện.",
        requestId: error.requestId,
        refreshSuggested: false
      };
    }
    return { message: staleMessage, requestId: error.requestId, refreshSuggested: true };
  }
  if (error.code === "NETWORK_ERROR") {
    return {
      message:
        action === "delete"
          ? "Không thể xác nhận tin đã được xóa. Hãy kiểm tra lại danh sách hoặc tải lại tin."
          : ambiguousLifecycle,
      requestId: null,
      refreshSuggested: true
    };
  }
  return {
    message: "Không thể hoàn tất tác vụ lúc này. Vui lòng thử lại sau.",
    requestId: error.requestId,
    refreshSuggested: false
  };
}

export function OwnerLifecycleActions({
  detail,
  blocked,
  onDetailChange,
  onEditorFeedback,
  onRefresh
}: OwnerLifecycleActionsProps) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [submitNotice, setSubmitNotice] = useState(false);
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (detail.status !== "DRAFT") setConfirmingDelete(false);
  }, [detail.status]);

  useEffect(() => {
    if (!submitNotice) return;
    const timeout = window.setTimeout(() => setSubmitNotice(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [submitNotice]);

  const run = async (action: LifecycleAction) => {
    if (pendingRef.current || blocked) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPendingAction(action);
    setFeedback(null);
    setSubmitNotice(false);
    onEditorFeedback(null);

    try {
      if (action === "delete") {
        await api.listings.deleteOwned(detail.id, controller.signal);
        if (!controller.signal.aborted) router.replace("/landlord");
        return;
      }

      const returned =
        action === "submit"
          ? await api.listings.submit(detail.id, controller.signal)
          : action === "deactivate"
            ? await api.listings.deactivate(detail.id, controller.signal)
            : await api.listings.reactivate(detail.id, controller.signal);
      if (!controller.signal.aborted) {
        onDetailChange(returned);
        if (action === "submit" && returned.status === "PENDING") setSubmitNotice(true);
      }
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 422 && action === "submit") {
        const mapped = mapApiErrorToFields(caught, ownerEditorFields);
        const imageMissing = caught.details.some((item) => /image/i.test(item.field) || /image/i.test(item.code));
        const formMessage = imageMissing
          ? "Cần ít nhất một ảnh trước khi gửi duyệt."
          : (mapped.formMessage ?? "Tin chưa đủ thông tin để gửi duyệt. Hãy kiểm tra các mục được đánh dấu.");
        onEditorFeedback({ ...mapped, formMessage, requestId: null });
        setFeedback({ message: formMessage, requestId: null, refreshSuggested: false });
      } else {
        const nextFeedback = actionError(action, caught);
        setFeedback(nextFeedback);
        if (caught instanceof ApiError && caught.status === 401) await refresh().catch(() => undefined);
      }
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        pendingRef.current = false;
        setPendingAction(null);
      }
    }
  };

  const pending = pendingAction !== null;
  const actionDisabled = blocked || pending;
  const completeness = [
    { label: "Nội dung", ready: Boolean(detail.title && detail.description) },
    { label: "Giá & diện tích", ready: detail.monthlyRent !== null && detail.roomAreaSqm !== null },
    {
      label: "Địa chỉ & tọa độ",
      ready: Boolean(detail.addressText && detail.areaName && detail.latitude !== null && detail.longitude !== null)
    },
    { label: "Loại phòng", ready: detail.propertyType !== null },
    { label: "Ảnh", ready: detail.images.length > 0 }
  ];

  return (
    <section aria-labelledby="owner-actions-heading" className="rm-workspace-card space-y-5 p-5 sm:p-6">
      {submitNotice ? (
        <ToastViewport>
          <Toast
            variant="success"
            title="Đã gửi duyệt"
            description="Tin của bạn đang chờ kiểm duyệt."
            onDismiss={() => setSubmitNotice(false)}
          />
        </ToastViewport>
      ) : null}
      <div>
        <h2 id="owner-actions-heading" className="rm-workspace-section-title">
          Trạng thái &amp; tác vụ
        </h2>
        <p className="mt-1 text-sm text-rent-secondary">
          Mọi thay đổi trạng thái chỉ được hiển thị sau phản hồi từ máy chủ.
        </p>
      </div>

      {(detail.status === "DRAFT" || detail.status === "HIDDEN") && (
        <div className="rounded-control border border-rent-line bg-rent-surface-muted p-4">
          <p className="text-sm font-medium text-rent-ink">Kiểm tra trước khi gửi duyệt</p>
          <ul className="mt-2 grid gap-1 text-sm text-rent-secondary sm:grid-cols-2">
            {completeness.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span
                  className={`grid h-5 w-5 place-items-center border border-heroDark-950 ${item.ready ? "bg-rent-accent" : "bg-white"}`}
                >
                  {item.ready ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                </span>
                {item.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-600">Đây là gợi ý; máy chủ quyết định điều kiện gửi duyệt.</p>
        </div>
      )}

      {blocked ? (
        <p className="rounded-control border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Bạn có thay đổi chưa lưu. Hãy lưu hoặc hoàn tác trước.
        </p>
      ) : null}

      {feedback ? (
        <div role="alert" className="rounded-control border border-red-200 bg-red-50 p-4 text-sm text-red-950">
          <p>{feedback.message}</p>
          {feedback.requestId ? <p className="mt-1 text-xs">Mã yêu cầu: {feedback.requestId}</p> : null}
          {feedback.refreshSuggested ? (
            <Button className="mt-3" variant="secondary" onClick={onRefresh}>
              Tải lại tin
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="rm-workspace-action-bar">
        {(detail.status === "DRAFT" || detail.status === "HIDDEN") && (
          <Button
            disabled={actionDisabled}
            pending={pendingAction === "submit"}
            pendingLabel="Đang gửi duyệt…"
            onClick={() => void run("submit")}
          >
            Gửi duyệt
          </Button>
        )}
        {detail.status === "APPROVED" ? (
          <Button
            variant="secondary"
            disabled={actionDisabled}
            pending={pendingAction === "deactivate"}
            pendingLabel="Đang ngừng hiển thị…"
            onClick={() => void run("deactivate")}
          >
            Ngừng hiển thị
          </Button>
        ) : null}
        {detail.status === "INACTIVE" ? (
          <Button
            disabled={actionDisabled}
            pending={pendingAction === "reactivate"}
            pendingLabel="Đang kích hoạt lại…"
            onClick={() => void run("reactivate")}
          >
            Kích hoạt lại
          </Button>
        ) : null}
      </div>

      {detail.status === "DRAFT" ? (
        <div className="border-t border-rent-line pt-5">
          <h3 className="font-semibold text-red-800">Vùng nguy hiểm</h3>
          <p className="mt-1 text-sm text-slate-600">
            Máy chủ sẽ kiểm tra tin có đủ điều kiện xóa vĩnh viễn hay không.
          </p>
          {confirmingDelete ? (
            <div
              className="mt-4 rounded-control border border-red-200 bg-red-50 p-4"
              role="group"
              aria-label="Xác nhận xóa tin"
            >
              <p className="font-medium text-red-950">Xóa vĩnh viễn tin này?</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  variant="danger"
                  disabled={actionDisabled}
                  pending={pendingAction === "delete"}
                  pendingLabel="Đang xóa…"
                  onClick={() => void run("delete")}
                >
                  Xác nhận xóa
                </Button>
                <Button variant="secondary" disabled={pending} onClick={() => setConfirmingDelete(false)}>
                  Hủy
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="mt-4"
              variant="danger"
              disabled={actionDisabled}
              onClick={() => setConfirmingDelete(true)}
            >
              Xóa tin
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
