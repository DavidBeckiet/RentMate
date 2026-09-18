"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { InputField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { PasswordField } from "../../components/ui/password-field";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { mapApiErrorToFields } from "../../lib/validation/api-field-errors";
import { GoogleAuthSeam } from "./google-auth-seam";
import { validateRegistrationInput, type AuthField, type AuthFieldErrors, type RegistrationMode } from "./validation";

interface RegistrationFeedback {
  readonly fieldErrors: AuthFieldErrors;
  readonly formMessage: string | null;
  readonly duplicateEmail: boolean;
}

const emptyFeedback: RegistrationFeedback = {
  fieldErrors: {},
  formMessage: null,
  duplicateEmail: false
};

function feedbackFor(error: unknown): RegistrationFeedback {
  if (!(error instanceof ApiError)) {
    return {
      fieldErrors: {},
      formMessage: "Không thể đăng ký lúc này. Vui lòng thử lại sau.",
      duplicateEmail: false
    };
  }

  if (error.code === "EMAIL_ALREADY_EXISTS") {
    return {
      fieldErrors: {},
      formMessage: "Bạn có thể đăng nhập bằng tài khoản hiện có hoặc sử dụng email khác.",
      duplicateEmail: true
    };
  }
  if (error.code === "RATE_LIMITED") {
    return {
      fieldErrors: {},
      formMessage: "Bạn đã thử đăng ký quá nhiều lần. Vui lòng thử lại sau.",
      duplicateEmail: false
    };
  }
  if (error.code === "NETWORK_ERROR") {
    return {
      fieldErrors: {},
      formMessage: "Không thể xác nhận kết quả đăng ký. Hãy thử đăng nhập trước khi gửi lại đăng ký.",
      duplicateEmail: false
    };
  }
  if (error.category === "unexpected" || (error.status !== null && error.status >= 500)) {
    return {
      fieldErrors: {},
      formMessage: "Không thể đăng ký lúc này. Vui lòng thử lại sau.",
      duplicateEmail: false
    };
  }

  const mapped = mapApiErrorToFields(error, ["displayName", "email", "password", "phone"] as const);
  const fieldErrors: AuthFieldErrors = { ...mapped.fieldErrors };
  if (fieldErrors.displayName) fieldErrors.displayName = "Họ và tên chưa hợp lệ. Vui lòng kiểm tra lại.";
  if (fieldErrors.email) fieldErrors.email = "Email chưa hợp lệ. Vui lòng kiểm tra lại.";
  if (fieldErrors.password) fieldErrors.password = "Mật khẩu chưa hợp lệ. Vui lòng chọn mật khẩu khác.";
  if (fieldErrors.phone) fieldErrors.phone = "Số điện thoại chưa đúng. Vui lòng kiểm tra lại.";
  return {
    fieldErrors,
    formMessage: mapped.formMessage ? "Không thể tạo tài khoản. Vui lòng kiểm tra thông tin và thử lại." : null,
    duplicateEmail: false
  };
}

function focusFirstInvalidField(mode: RegistrationMode, fieldErrors: AuthFieldErrors): void {
  const field = (["displayName", "email", "password", "confirmPassword", "phone"] as const).find(
    (candidate) => fieldErrors[candidate]
  );
  if (!field) return;
  const idField = field === "confirmPassword" ? "confirm-password" : field === "displayName" ? "display-name" : field;
  document.getElementById(`${mode}-registration-${idField}`)?.focus();
}

export function RegistrationForm({ mode }: { readonly mode: RegistrationMode }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<RegistrationFeedback>(emptyFeedback);

  const clearFieldError = (field: AuthField) => {
    setFeedback((current) => {
      const fieldErrors = { ...current.fieldErrors };
      delete fieldErrors[field];
      const duplicateStillApplies = current.duplicateEmail && field !== "email";
      return {
        fieldErrors,
        formMessage: duplicateStillApplies ? current.formMessage : null,
        duplicateEmail: duplicateStillApplies
      };
    });
  };

  const validateField = (field: AuthField) => {
    const validation = validateRegistrationInput({ displayName, email, password, confirmPassword, phone }, mode);
    const message = validation.valid ? undefined : validation.errors[field];
    setFeedback((current) => {
      const fieldErrors = { ...current.fieldErrors };
      if (message) fieldErrors[field] = message;
      else delete fieldErrors[field];
      return { fieldErrors, formMessage: current.formMessage, duplicateEmail: current.duplicateEmail };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const validation = validateRegistrationInput({ displayName, email, password, confirmPassword, phone }, mode);
    if (!validation.valid) {
      setFeedback({ fieldErrors: validation.errors, formMessage: null, duplicateEmail: false });
      focusFirstInvalidField(mode, validation.errors);
      return;
    }

    setPending(true);
    setFeedback(emptyFeedback);
    try {
      if (validation.value.mode === "tenant") {
        await api.auth.registerTenant(validation.value.body);
      } else {
        await api.auth.registerLandlord(validation.value.body);
      }
      await refresh();
      router.replace(mode === "landlord" ? "/landlord" : "/");
    } catch (error) {
      const nextFeedback = feedbackFor(error);
      setFeedback(nextFeedback);
      focusFirstInvalidField(mode, nextFeedback.fieldErrors);
    } finally {
      setPending(false);
    }
  };

  const submitLabel = mode === "tenant" ? "Đăng ký tìm phòng" : "Đăng ký cho thuê";

  return (
    <form noValidate aria-busy={pending} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
      <GoogleAuthSeam mode="register" role={mode === "landlord" ? "LANDLORD" : "TENANT"} dividerPosition="after" />
      <fieldset className="grid gap-3 sm:grid-cols-2 sm:items-start">
        <legend className="col-span-full pb-1 text-ui-sm font-bold text-foreground">Thông tin cá nhân</legend>
        <InputField
          id={`${mode}-registration-display-name`}
          name="displayName"
          label="Họ và tên"
          type="text"
          autoComplete="name"
          required
          requiredIndicator="sr-only"
          leadingIcon={<Icon name="user" className="h-4 w-4" />}
          className="rm-auth-control"
          placeholder="Nguyễn Văn A"
          value={displayName}
          error={feedback.fieldErrors.displayName}
          onBlur={() => validateField("displayName")}
          onChange={(event) => {
            setDisplayName(event.currentTarget.value);
            clearFieldError("displayName");
          }}
        />
        <InputField
          id={`${mode}-registration-phone`}
          name="phone"
          label="Số điện thoại"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required={mode === "landlord"}
          requiredIndicator="sr-only"
          leadingIcon={<Icon name="phone" className="h-4 w-4" />}
          className="rm-auth-control"
          placeholder="0912345678"
          hint={mode === "tenant" ? "Không bắt buộc" : "Dùng để người thuê có thể liên hệ với bạn."}
          value={phone}
          error={feedback.fieldErrors.phone}
          onBlur={() => validateField("phone")}
          onChange={(event) => {
            setPhone(event.currentTarget.value);
            clearFieldError("phone");
          }}
        />
      </fieldset>
      <fieldset className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 sm:items-start">
        <legend className="col-span-full pb-1 text-ui-sm font-bold text-foreground">Tài khoản</legend>
        <div className="sm:col-span-2">
          <InputField
            id={`${mode}-registration-email`}
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            required
            requiredIndicator="sr-only"
            leadingIcon={<Icon name="mail" className="h-4 w-4" />}
            className="rm-auth-control"
            value={email}
            error={feedback.fieldErrors.email}
            onBlur={() => validateField("email")}
            onChange={(event) => {
              setEmail(event.currentTarget.value);
              clearFieldError("email");
            }}
          />
        </div>
        <PasswordField
          id={`${mode}-registration-password`}
          name="password"
          label="Mật khẩu"
          autoComplete="new-password"
          required
          requiredIndicator="sr-only"
          leadingIcon={<Icon name="lock" className="h-4 w-4" />}
          className="rm-auth-control"
          hint="Tối thiểu 8 ký tự."
          value={password}
          error={feedback.fieldErrors.password}
          onBlur={() => validateField("password")}
          onChange={(event) => {
            setPassword(event.currentTarget.value);
            clearFieldError("password");
          }}
        />
        <PasswordField
          id={`${mode}-registration-confirm-password`}
          name="confirmPassword"
          label="Nhập lại mật khẩu"
          autoComplete="new-password"
          required
          requiredIndicator="sr-only"
          leadingIcon={<Icon name="lock" className="h-4 w-4" />}
          className="rm-auth-control"
          value={confirmPassword}
          error={feedback.fieldErrors.confirmPassword}
          onBlur={() => validateField("confirmPassword")}
          onChange={(event) => {
            setConfirmPassword(event.currentTarget.value);
            clearFieldError("confirmPassword");
          }}
        />
      </fieldset>
      {feedback.formMessage ? (
        <ErrorState
          title={feedback.duplicateEmail ? "Email này đã được sử dụng." : undefined}
          message={feedback.formMessage}
          tone="neutral"
          action={
            feedback.duplicateEmail ? (
              <>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center font-semibold text-primary-hover underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                >
                  Đăng nhập
                </Link>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-control px-3 font-semibold text-primary-hover underline decoration-2 underline-offset-4 hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  onClick={() => {
                    const emailInput = document.getElementById(`${mode}-registration-email`);
                    emailInput?.focus();
                    if (emailInput instanceof HTMLInputElement) emailInput.select();
                  }}
                >
                  Đổi email
                </button>
              </>
            ) : undefined
          }
        />
      ) : null}
      <Button type="submit" pending={pending} pendingLabel="Đang đăng ký…" className="rm-auth-primary w-full">
        <Icon name="userPlus" className="h-4 w-4" />
        {submitLabel}
      </Button>
    </form>
  );
}
