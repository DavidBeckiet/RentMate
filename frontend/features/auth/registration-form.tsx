"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { InputField } from "../../components/ui/form-controls";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { mapApiErrorToFields } from "../../lib/validation/api-field-errors";
import { validateRegistrationInput, type AuthField, type AuthFieldErrors, type RegistrationMode } from "./validation";

interface RegistrationFeedback {
  readonly fieldErrors: AuthFieldErrors;
  readonly formMessage: string | null;
  readonly requestId: string | null;
  readonly duplicateEmail: boolean;
}

const emptyFeedback: RegistrationFeedback = {
  fieldErrors: {},
  formMessage: null,
  requestId: null,
  duplicateEmail: false
};

function feedbackFor(error: unknown): RegistrationFeedback {
  if (!(error instanceof ApiError)) {
    return {
      fieldErrors: {},
      formMessage: "Không thể đăng ký lúc này. Vui lòng thử lại sau.",
      requestId: null,
      duplicateEmail: false
    };
  }

  if (error.code === "EMAIL_ALREADY_EXISTS") {
    return {
      fieldErrors: {},
      formMessage: "Email này đã được đăng ký. Bạn có thể đăng nhập bằng tài khoản hiện có.",
      requestId: error.requestId,
      duplicateEmail: true
    };
  }
  if (error.code === "RATE_LIMITED") {
    return {
      fieldErrors: {},
      formMessage: "Bạn đã thử đăng ký quá nhiều lần. Vui lòng thử lại sau.",
      requestId: error.requestId,
      duplicateEmail: false
    };
  }
  if (error.code === "NETWORK_ERROR") {
    return {
      fieldErrors: {},
      formMessage: "Không thể xác nhận kết quả đăng ký. Hãy thử đăng nhập trước khi gửi lại đăng ký.",
      requestId: null,
      duplicateEmail: false
    };
  }
  if (error.category === "unexpected" || (error.status !== null && error.status >= 500)) {
    return {
      fieldErrors: {},
      formMessage: "Không thể đăng ký lúc này. Vui lòng thử lại sau.",
      requestId: error.requestId,
      duplicateEmail: false
    };
  }

  const mapped = mapApiErrorToFields(error, ["email", "password", "phone"] as const);
  return { ...mapped, duplicateEmail: false };
}

export function RegistrationForm({ mode }: { readonly mode: RegistrationMode }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<RegistrationFeedback>(emptyFeedback);

  const clearFieldError = (field: AuthField) => {
    setFeedback((current) => {
      const fieldErrors = { ...current.fieldErrors };
      delete fieldErrors[field];
      return { fieldErrors, formMessage: null, requestId: null, duplicateEmail: false };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const validation = validateRegistrationInput({ email, password, phone }, mode);
    if (!validation.valid) {
      setFeedback({ fieldErrors: validation.errors, formMessage: null, requestId: null, duplicateEmail: false });
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
      router.replace("/");
    } catch (error) {
      setFeedback(feedbackFor(error));
    } finally {
      setPending(false);
    }
  };

  const submitLabel = mode === "tenant" ? "Đăng ký tìm phòng" : "Đăng ký cho thuê";

  return (
    <form noValidate className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <InputField
        id={`${mode}-registration-email`}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        error={feedback.fieldErrors.email}
        onChange={(event) => {
          setEmail(event.currentTarget.value);
          clearFieldError("email");
        }}
      />
      <InputField
        id={`${mode}-registration-password`}
        name="password"
        label="Mật khẩu"
        type="password"
        autoComplete="new-password"
        required
        hint="Ít nhất 8 ký tự và không quá 72 byte UTF-8."
        value={password}
        error={feedback.fieldErrors.password}
        onChange={(event) => {
          setPassword(event.currentTarget.value);
          clearFieldError("password");
        }}
      />
      <InputField
        id={`${mode}-registration-phone`}
        name="phone"
        label={mode === "tenant" ? "Số điện thoại (không bắt buộc)" : "Số điện thoại"}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={mode === "landlord"}
        hint="Định dạng E.164, ví dụ +84901234567."
        value={phone}
        error={feedback.fieldErrors.phone}
        onChange={(event) => {
          setPhone(event.currentTarget.value);
          clearFieldError("phone");
        }}
      />
      {feedback.formMessage ? (
        <ErrorState
          message={feedback.formMessage}
          requestId={feedback.requestId}
          action={
            feedback.duplicateEmail ? (
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center font-semibold text-red-900 underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
              >
                Đi đến trang đăng nhập
              </Link>
            ) : undefined
          }
        />
      ) : null}
      <Button type="submit" pending={pending} pendingLabel="Đang đăng ký…" className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
