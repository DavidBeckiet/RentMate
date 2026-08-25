"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { api, ApiError } from "../../lib/api/client";
import type { OwnerListingDetail } from "../../types/api";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

function dateLabel(value: string | null): string {
  return value === null ? "chưa có mốc xác nhận" : dateFormatter.format(new Date(value));
}

function actionError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Chưa thể xác nhận lúc này. Vui lòng thử lại.";
  if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.status === 403) return "Tài khoản hiện không được phép thực hiện thao tác này.";
  if (error.status === 404) return "Tin đăng không còn tồn tại hoặc bạn không có quyền truy cập.";
  if (error.status === 409) return "Tin đăng vừa thay đổi. Hãy tải lại trang rồi thử lại.";
  return "Chưa thể xác nhận lúc này. Vui lòng thử lại.";
}

export function OwnerListingAvailabilityControl({
  detail,
  disabled,
  onDetailChange
}: {
  readonly detail: OwnerListingDetail;
  readonly disabled?: boolean;
  readonly onDetailChange: (detail: OwnerListingDetail) => void;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const tracked = detail.availabilityStatus !== "NOT_APPLICABLE";
  const needsConfirmation = detail.availabilityStatus === "REMINDER_DUE" || detail.availabilityStatus === "AUTO_PAUSED";

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  if (!tracked) return null;

  const confirm = async () => {
    if (pending || disabled) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setFeedback(null);
    try {
      const updated = await api.listings.confirmAvailability(detail.id, controller.signal);
      if (!controller.signal.aborted) onDetailChange(updated);
    } catch (error: unknown) {
      if (!controller.signal.aborted) setFeedback(actionError(error));
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        controllerRef.current = null;
        setPending(false);
      }
    }
  };

  return (
    <section
      aria-labelledby="availability-heading"
      className={`space-y-3 rounded-control border-2 p-4 shadow-glass-sm ${
        needsConfirmation ? "border-heroDark-950 bg-rent-yellow" : "border-rent-line bg-rent-surface"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="availability-heading" className="text-base font-bold text-rent-ink">
            {detail.availabilityStatus === "AUTO_PAUSED"
              ? "Tin đã tạm dừng vì chưa xác nhận"
              : needsConfirmation
                ? "Tin đăng cần xác nhận lại"
                : "Tình trạng phòng đã được xác nhận"}
          </h2>
          <p className="mt-1 text-sm text-rent-secondary">
            {detail.availabilityStatus === "AUTO_PAUSED"
              ? "Xác nhận còn phòng để mở lại trạng thái AVAILABLE và tiếp tục hiển thị công khai."
              : needsConfirmation
                ? "Hãy xác nhận để tin đăng tiếp tục được ưu tiên hiển thị đúng tình trạng."
                : `Xác nhận gần nhất: ${dateLabel(detail.availabilityConfirmedAt)}.`}
          </p>
          {detail.availabilityExpiresAt && detail.availabilityStatus === "CURRENT" ? (
            <p className="mt-1 text-xs font-medium text-rent-subtle">
              Cần xác nhận lại sau: {dateLabel(detail.availabilityExpiresAt)}
            </p>
          ) : null}
        </div>
        {needsConfirmation ? (
          <Button
            type="button"
            pending={pending}
            pendingLabel="Đang xác nhận…"
            disabled={disabled}
            onClick={() => void confirm()}
            className="shrink-0"
          >
            Xác nhận còn phòng
          </Button>
        ) : null}
      </div>
      {feedback ? (
        <p role="alert" className="border-2 border-heroDark-950 bg-rent-coral p-3 text-sm font-bold text-rent-ink">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
