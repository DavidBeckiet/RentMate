"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { InputField } from "../../components/ui/form-controls";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { UserProfile } from "../../types/api";
import { validateProfileInput, type ProfileFieldErrors } from "./profile-validation";

interface Feedback extends ProfileFieldErrors {
  readonly message?: string;
  readonly requestId?: string | null;
  readonly success?: string;
}

function friendlyError(error: unknown): Feedback {
  if (!(error instanceof ApiError)) return { message: "Không thể cập nhật hồ sơ lúc này. Vui lòng thử lại sau." };
  if (error.status === 401) return { message: "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại." };
  if (error.status === 403) return { message: "Bạn không có quyền cập nhật hồ sơ này.", requestId: error.requestId };
  if (error.code === "NETWORK_ERROR")
    return { message: "Không thể xác nhận việc cập nhật. Vui lòng kiểm tra lại rồi thử lại." };
  if (error.status !== null && error.status >= 500) {
    return { message: "Không thể cập nhật hồ sơ lúc này. Vui lòng thử lại sau.", requestId: error.requestId };
  }
  const fields = new Set(error.details?.map((detail) => detail.field));
  return {
    displayName: fields.has("displayName") ? "Họ và tên chưa hợp lệ. Vui lòng kiểm tra lại." : undefined,
    phone: fields.has("phone") ? "Số điện thoại chưa đúng. Vui lòng nhập theo ví dụ +84901234567." : undefined,
    message: fields.size === 0 ? "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại." : undefined,
    requestId: error.requestId
  };
}

interface AccountProfileFormProps {
  readonly user: UserProfile;
  readonly onSaved?: (user: UserProfile, noOp: boolean) => void;
  readonly onCancel?: () => void;
  readonly submitLabel?: string;
}

export function AccountProfileForm({ user, onSaved, onCancel, submitLabel = "Lưu hồ sơ" }: AccountProfileFormProps) {
  const { updateUser, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({});
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    setDisplayName(user.displayName ?? "");
    setPhone(user.phone ?? "");
  }, [user.displayName, user.phone]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    const validation = validateProfileInput({ displayName, phone }, user);
    if (!validation.valid) {
      setFeedback(validation.errors);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    pendingRef.current = true;
    setPending(true);
    setFeedback({});
    try {
      const returned = await api.users.updateCurrent(validation.body, controller.signal);
      if (controller.signal.aborted) return;
      const noOp =
        returned.displayName === user.displayName &&
        returned.phone === user.phone &&
        returned.updatedAt === user.updatedAt;
      setDisplayName(returned.displayName ?? "");
      setPhone(returned.phone ?? "");
      updateUser?.(returned);
      onSaved?.(returned, noOp);
      if (!onSaved) setFeedback({ success: noOp ? "Không có thay đổi cần lưu." : "Đã cập nhật hồ sơ." });
    } catch (error) {
      if (controller.signal.aborted) return;
      setFeedback(friendlyError(error));
      if (error instanceof ApiError && error.status === 401) await refresh().catch(() => undefined);
    } finally {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-6">
      <InputField
        id={`${user.role.toLowerCase()}-display-name`}
        name="displayName"
        label="Họ và tên"
        autoComplete="name"
        required={user.displayName !== null}
        placeholder="Nguyễn Văn An"
        value={displayName}
        error={feedback.displayName}
        hint={
          user.displayName === null && !displayName
            ? "Tài khoản cũ chưa có họ và tên; bạn có thể bổ sung tại đây."
            : undefined
        }
        onChange={(event) => {
          setDisplayName(event.currentTarget.value);
          setFeedback({});
        }}
      />
      <InputField
        id={`${user.role.toLowerCase()}-email`}
        name="email"
        label="Email đăng nhập"
        type="email"
        value={user.email}
        readOnly
        hint="Không thể thay đổi email đăng nhập."
      />
      <InputField
        id={`${user.role.toLowerCase()}-phone`}
        name="phone"
        label="Số điện thoại"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={user.role === "LANDLORD"}
        value={phone}
        error={feedback.phone}
        hint={
          user.role === "LANDLORD"
            ? "Dùng để người thuê có thể liên hệ với bạn. Ví dụ: +84901234567."
            : "Không bắt buộc. Ví dụ: +84901234567."
        }
        onChange={(event) => {
          setPhone(event.currentTarget.value);
          setFeedback({});
        }}
      />
      {feedback.message ? (
        <p role="alert" className="rounded-control border border-danger/20 bg-danger-subtle p-3 text-ui-sm text-danger">
          {feedback.message}
          {feedback.requestId ? ` Mã yêu cầu: ${feedback.requestId}` : ""}
        </p>
      ) : null}
      {feedback.success ? (
        <p
          role="status"
          className="rounded-control border border-primary/20 bg-primary-subtle p-3 text-ui-sm font-semibold text-primary-hover"
        >
          {feedback.success}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending} pendingLabel="Đang lưu…">
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Hủy
          </Button>
        ) : null}
      </div>
    </form>
  );
}
