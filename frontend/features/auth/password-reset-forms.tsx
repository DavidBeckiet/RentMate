"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { InputField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { PasswordField } from "../../components/ui/password-field";
import { api, ApiError } from "../../lib/api/client";
import { mapApiErrorToFields } from "../../lib/validation/api-field-errors";
import { validatePasswordResetRequestInput } from "./validation";

const secondaryLinkClasses =
  "font-semibold text-teal-800 underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2";

function emailError(error: unknown): string | null {
  if (!(error instanceof ApiError)) return "Không thể gửi yêu cầu lúc này. Vui lòng thử lại sau.";
  if (error.code === "RATE_LIMITED") return "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau.";
  if (error.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
  return mapApiErrorToFields(error, ["email"] as const).fieldErrors.email
    ? "Email chưa đúng định dạng."
    : "Không thể gửi yêu cầu lúc này. Vui lòng thử lại sau.";
}

export function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const validation = validatePasswordResetRequestInput(email);
    if (!validation.valid) {
      setError(validation.errors.email ?? "Email chưa đúng định dạng.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await api.auth.requestPasswordReset({ email: validation.value.email });
      setAccepted(true);
    } catch (nextError) {
      setError(emailError(nextError));
    } finally {
      setPending(false);
    }
  };

  if (accepted) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <p className="border-2 border-heroDark-950 bg-rent-accent p-4 text-ui-sm font-semibold text-heroDark-950 shadow-glass-sm">
          Nếu email tồn tại, RentMate đã gửi hướng dẫn đặt lại mật khẩu. Hãy kiểm tra cả thư mục spam.
        </p>
        <Link href="/login" className={secondaryLinkClasses}>
          Quay lại đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form noValidate aria-busy={pending} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
      <InputField
        id="password-reset-email"
        name="email"
        label="Email tài khoản"
        type="email"
        autoComplete="email"
        required
        requiredIndicator="sr-only"
        leadingIcon={<Icon name="mail" className="h-4 w-4" />}
        className="rm-auth-control"
        value={email}
        error={error ?? undefined}
        onChange={(event) => {
          setEmail(event.currentTarget.value);
          setError(null);
        }}
      />
      <Button type="submit" pending={pending} pendingLabel="Đang gửi…" className="rm-auth-primary w-full">
        <Icon name="mail" className="h-4 w-4" />
        Gửi hướng dẫn
      </Button>
      <Link href="/login" className={secondaryLinkClasses}>
        Quay lại đăng nhập
      </Link>
    </form>
  );
}

type ResetField = "token" | "password" | "confirmPassword";

export function PasswordResetConfirmationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ResetField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const clearField = (field: ResetField) => {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const token = searchParams.get("token") ?? "";
    const nextErrors: Partial<Record<ResetField, string>> = {};
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(token)) nextErrors.token = "Liên kết đặt lại mật khẩu không hợp lệ.";
    if ([...password].length < 8) nextErrors.password = "Mật khẩu phải có ít nhất 8 ký tự.";
    else if (new TextEncoder().encode(password).length > 72)
      nextErrors.password = "Mật khẩu không được dài quá 72 byte.";
    if (!confirmPassword) nextErrors.confirmPassword = "Vui lòng nhập lại mật khẩu.";
    else if (confirmPassword !== password) nextErrors.confirmPassword = "Mật khẩu nhập lại chưa khớp.";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setPending(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await api.auth.confirmPasswordReset({ token, password });
      setCompleted(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === "RATE_LIMITED") {
        setFormError("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.");
      } else if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
        setFormError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      } else {
        setFormError("Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.");
      }
    } finally {
      setPending(false);
    }
  };

  if (completed) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <p className="border-2 border-heroDark-950 bg-rent-accent p-4 text-ui-sm font-semibold text-heroDark-950 shadow-glass-sm">
          Mật khẩu đã được cập nhật. Bạn có thể đăng nhập bằng mật khẩu mới.
        </p>
        <Button type="button" className="w-full" onClick={() => router.replace("/login")}>
          Đến trang đăng nhập
        </Button>
      </div>
    );
  }

  return (
    <form noValidate aria-busy={pending} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
      <p className="text-ui-sm text-rent-secondary">Liên kết chỉ dùng một lần và có hiệu lực trong thời gian ngắn.</p>
      <PasswordField
        id="password-reset-password"
        name="password"
        label="Mật khẩu mới"
        autoComplete="new-password"
        required
        requiredIndicator="sr-only"
        leadingIcon={<Icon name="lock" className="h-4 w-4" />}
        className="rm-auth-control"
        value={password}
        error={fieldErrors.password}
        onChange={(event) => {
          setPassword(event.currentTarget.value);
          clearField("password");
        }}
      />
      <PasswordField
        id="password-reset-confirm"
        name="confirmPassword"
        label="Nhập lại mật khẩu mới"
        autoComplete="new-password"
        required
        requiredIndicator="sr-only"
        leadingIcon={<Icon name="lock" className="h-4 w-4" />}
        className="rm-auth-control"
        value={confirmPassword}
        error={fieldErrors.confirmPassword}
        onChange={(event) => {
          setConfirmPassword(event.currentTarget.value);
          clearField("confirmPassword");
        }}
      />
      {fieldErrors.token ? <p className="text-sm font-semibold text-rose-800">{fieldErrors.token}</p> : null}
      {formError ? <ErrorState message={formError} /> : null}
      <Button type="submit" pending={pending} pendingLabel="Đang cập nhật…" className="rm-auth-primary w-full">
        Cập nhật mật khẩu
      </Button>
    </form>
  );
}
