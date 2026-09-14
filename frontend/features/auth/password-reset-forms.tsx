"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { InputField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { PasswordField } from "../../components/ui/password-field";
import { api, ApiError } from "../../lib/api/client";
import { mapApiErrorToFields } from "../../lib/validation/api-field-errors";
import { validatePasswordResetRequestInput } from "./validation";

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
  const [acceptedEmail, setAcceptedEmail] = useState<string | null>(null);
  const [codeResetVersion, setCodeResetVersion] = useState(0);
  const [resendPending, setResendPending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

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
      setAcceptedEmail(validation.value.email);
    } catch (nextError) {
      setError(emailError(nextError));
    } finally {
      setPending(false);
    }
  };

  const handleResend = async () => {
    if (!acceptedEmail || resendPending) return;
    setResendPending(true);
    setResendError(null);
    setResendNotice(null);
    try {
      await api.auth.requestPasswordReset({ email: acceptedEmail });
      setCodeResetVersion((version) => version + 1);
      setResendNotice(
        "Nếu email tồn tại, RentMate đã gửi mã mới. Mã trước đó không còn hiệu lực; hãy kiểm tra hộp thư đến và thư mục spam."
      );
    } catch (nextError) {
      setResendError(emailError(nextError));
    } finally {
      setResendPending(false);
    }
  };

  if (acceptedEmail) {
    return (
      <div className="space-y-4">
        <p
          className="rounded-control border border-primary/20 bg-primary-subtle p-4 text-ui-sm font-semibold text-primary-hover"
          role="status"
          aria-live="polite"
        >
          Nếu email tồn tại, RentMate đã gửi mã đặt lại mật khẩu gồm 6 số. Hãy kiểm tra cả thư mục spam.
        </p>
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            pending={resendPending}
            pendingLabel="Đang gửi lại…"
            onClick={() => void handleResend()}
          >
            Gửi lại mã
          </Button>
          {resendNotice ? (
            <p className="text-ui-xs font-semibold text-primary-hover" role="status" aria-live="polite">
              {resendNotice}
            </p>
          ) : null}
          {resendError ? <ErrorState title="Chưa thể gửi lại mã." message={resendError} tone="neutral" /> : null}
        </div>
        <PasswordResetConfirmationForm initialEmail={acceptedEmail} codeResetVersion={codeResetVersion} />
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
        onBlur={() => {
          const validation = validatePasswordResetRequestInput(email);
          setError(validation.valid ? null : (validation.errors.email ?? "Email chưa đúng định dạng."));
        }}
        onChange={(event) => {
          setEmail(event.currentTarget.value);
          setError(null);
        }}
      />
      <Button type="submit" pending={pending} pendingLabel="Đang gửi…" className="rm-auth-primary w-full">
        <Icon name="mail" className="h-4 w-4" />
        Gửi mã 6 số
      </Button>
    </form>
  );
}

type ResetField = "email" | "code" | "password" | "confirmPassword";

export function PasswordResetConfirmationForm({
  initialEmail = "",
  codeResetVersion = 0
}: {
  readonly initialEmail?: string;
  readonly codeResetVersion?: number;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ResetField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const emailValidationState = validatePasswordResetRequestInput(email);
  const codeIsComplete = /^\d{6}$/u.test(code);
  const activeStep = !emailValidationState.valid ? 1 : codeIsComplete ? 3 : 2;

  useEffect(() => {
    if (codeResetVersion === 0) return;
    setCode("");
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.code;
      return next;
    });
    setFormError(null);
  }, [codeResetVersion]);

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

    const nextErrors: Partial<Record<ResetField, string>> = {};
    const emailValidation = validatePasswordResetRequestInput(email);
    if (!emailValidation.valid) nextErrors.email = emailValidation.errors.email ?? "Email chưa đúng định dạng.";
    if (!/^\d{6}$/u.test(code)) nextErrors.code = "Mã đặt lại mật khẩu phải gồm đúng 6 số.";
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
      if (!emailValidation.valid) return;
      await api.auth.confirmPasswordReset({ email: emailValidation.value.email, code, password });
      setCompleted(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === "RATE_LIMITED") {
        setFormError("Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.");
      } else if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
        setFieldErrors({
          code: "Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy kiểm tra mã mới nhất trong email."
        });
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
        <p className="rounded-control border border-success/25 bg-success-subtle p-4 text-ui-sm font-semibold text-success-foreground shadow-surface">
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
      <ol className="grid grid-cols-3 gap-2" aria-label="Tiến trình đặt lại mật khẩu">
        {["Email", "Mã 6 số", "Mật khẩu mới"].map((label, index) => {
          const step = index + 1;
          const current = step === activeStep;
          const complete = step < activeStep;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={
                current || complete
                  ? "flex min-h-11 items-center gap-2 border-b-2 border-primary px-1 pb-2 text-ui-xs font-bold text-primary-hover sm:text-ui-sm"
                  : "flex min-h-11 items-center gap-2 border-b border-border px-1 pb-2 text-ui-xs font-semibold text-muted-foreground sm:text-ui-sm"
              }
            >
              <span
                className={
                  current || complete
                    ? "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-white"
                    : "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-subtle text-muted-foreground"
                }
              >
                {complete ? <Icon name="check" className="h-3.5 w-3.5" /> : step}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
      <fieldset className="space-y-3">
        <legend className="sr-only">Email và mã xác minh</legend>
        <InputField
          id="password-reset-confirmation-email"
          name="email"
          label="Email tài khoản"
          type="email"
          autoComplete="email"
          required
          requiredIndicator="sr-only"
          leadingIcon={<Icon name="mail" className="h-4 w-4" />}
          className="rm-auth-control"
          value={email}
          error={fieldErrors.email}
          onBlur={() => {
            const validation = validatePasswordResetRequestInput(email);
            if (!validation.valid) setFieldErrors((current) => ({ ...current, email: validation.errors.email }));
          }}
          onChange={(event) => {
            setEmail(event.currentTarget.value);
            clearField("email");
          }}
        />
        <p className="text-ui-xs text-muted-foreground">Mã gồm 6 số, dùng một lần và có hiệu lực trong 30 phút.</p>
        <InputField
          id="password-reset-code"
          name="code"
          label="Mã đặt lại mật khẩu"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          requiredIndicator="sr-only"
          className="rm-auth-control rm-auth-otp-control"
          value={code}
          error={fieldErrors.code}
          onChange={(event) => {
            setCode(event.currentTarget.value.replace(/\D/gu, "").slice(0, 6));
            clearField("code");
          }}
        />
      </fieldset>
      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="pb-1 text-ui-sm font-bold text-foreground">Mật khẩu mới</legend>
        <PasswordField
          id="password-reset-password"
          name="password"
          label="Mật khẩu mới"
          autoComplete="new-password"
          required
          requiredIndicator="sr-only"
          leadingIcon={<Icon name="lock" className="h-4 w-4" />}
          className="rm-auth-control"
          hint="Tối thiểu 8 ký tự."
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
      </fieldset>
      {formError ? <ErrorState message={formError} tone="neutral" /> : null}
      <Button type="submit" pending={pending} pendingLabel="Đang cập nhật…" className="rm-auth-primary w-full">
        Cập nhật mật khẩu
      </Button>
    </form>
  );
}
