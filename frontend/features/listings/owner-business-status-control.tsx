"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { SelectField } from "../../components/ui/form-controls";
import { ApiError, api } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ListingBusinessStatus, OwnerListingDetail } from "../../types/api";

const options: readonly { readonly value: ListingBusinessStatus; readonly label: string }[] = [
  { value: "AVAILABLE", label: "Còn phòng" },
  { value: "PAUSED", label: "Tạm dừng" },
  { value: "RENTED", label: "Đã thuê" },
  { value: "UNKNOWN", label: "Chưa xác định" }
];

interface OwnerBusinessStatusControlProps {
  readonly detail: OwnerListingDetail;
  readonly disabled?: boolean;
  readonly onDetailChange: (detail: OwnerListingDetail) => void;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Không thể cập nhật trạng thái lúc này. Vui lòng thử lại.";
  if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.status === 403) return "Bạn không có quyền cập nhật trạng thái tin này.";
  if (error.status === 404) return "Tin đăng không tồn tại hoặc bạn không thể truy cập.";
  if (error.status === 409) return "Tin đăng vừa thay đổi. Vui lòng tải lại trang rồi thử lại.";
  if (error.status === 422) return "Trạng thái kinh doanh chưa hợp lệ.";
  return "Không thể cập nhật trạng thái lúc này. Vui lòng thử lại.";
}

export function OwnerBusinessStatusControl({
  detail,
  disabled = false,
  onDetailChange
}: OwnerBusinessStatusControlProps) {
  const { refresh } = useAuth();
  const [value, setValue] = useState<ListingBusinessStatus>(detail.businessStatus);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setValue(detail.businessStatus);
    setFeedback(null);
    setSuccess(null);
  }, [detail.businessStatus]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    []
  );

  const save = async () => {
    if (pending || value === detail.businessStatus) {
      if (value === detail.businessStatus) setSuccess("Trạng thái đã được cập nhật.");
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setFeedback(null);
    setSuccess(null);

    try {
      const updated = await api.listings.updateBusinessStatus(detail.id, { businessStatus: value }, controller.signal);
      if (controller.signal.aborted) return;
      onDetailChange(updated);
      setSuccess("Đã cập nhật trạng thái kinh doanh.");
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setFeedback(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) await refresh().catch(() => undefined);
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        controllerRef.current = null;
        setPending(false);
      }
    }
  };

  return (
    <section className="rm-workspace-card p-4" aria-labelledby="business-status-heading">
      <div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-primary">Trạng thái kinh doanh</p>
          <h2 id="business-status-heading" className="mt-1 font-display text-base font-bold leading-6 text-foreground">
            Tình trạng cho thuê
          </h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-rent-secondary">Hiển thị độc lập với trạng thái duyệt tin.</p>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <SelectField
          id="owner-business-status"
          name="businessStatus"
          label="Tình trạng phòng"
          className="min-h-11 py-2 text-sm"
          value={value}
          disabled={disabled || pending}
          onChange={(event) => {
            setValue(event.target.value as ListingBusinessStatus);
            setFeedback(null);
            setSuccess(null);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          pending={pending}
          pendingLabel="Đang cập nhật…"
          disabled={disabled || value === detail.businessStatus}
          onClick={() => void save()}
        >
          Cập nhật
        </Button>
      </div>
      {feedback ? (
        <p role="alert" className="mt-4 rounded-control border border-red-200 bg-red-50 p-3 text-sm text-red-950">
          {feedback}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="mt-4 rounded-control bg-rent-primary-subtle p-3 text-sm font-medium text-teal-900">
          {success}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-rent-secondary">
        Chỉ tin <strong>Còn phòng</strong> hoặc <strong>Chưa xác định</strong> được hiển thị với người thuê.
      </p>
    </section>
  );
}
