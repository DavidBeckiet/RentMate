"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { InputField } from "../../components/ui/form-controls";
import { Icon } from "../../components/ui/icon";
import { PasswordField } from "../../components/ui/password-field";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { mapApiErrorToFields } from "../../lib/validation/api-field-errors";
import type { UserRole } from "../../types/api";
import { GoogleAuthSeam } from "./google-auth-seam";
import { validateLoginInput } from "./validation";

type LoginField = "email" | "password";

interface LoginFeedback {
  readonly fieldErrors: Partial<Record<LoginField, string>>;
  readonly formTitle: string | null;
  readonly formMessage: string | null;
}

const emptyFeedback: LoginFeedback = { fieldErrors: {}, formTitle: null, formMessage: null };

function feedbackFor(error: unknown): LoginFeedback {
  if (!(error instanceof ApiError)) {
    return {
      fieldErrors: {},
      formTitle: "Không thể đăng nhập lúc này.",
      formMessage: "Vui lòng thử lại sau."
    };
  }

  if (error.code === "INVALID_CREDENTIALS") {
    return {
      fieldErrors: {},
      formTitle: "Thông tin đăng nhập chưa đúng.",
      formMessage: "Email hoặc mật khẩu chưa đúng. Kiểm tra lại thông tin và thử lại."
    };
  }
  if (error.code === "RATE_LIMITED") {
    return {
      fieldErrors: {},
      formTitle: "Bạn thao tác quá nhanh.",
      formMessage: "Vui lòng thử lại sau ít phút."
    };
  }
  if (error.code === "NETWORK_ERROR") {
    return {
      fieldErrors: {},
      formTitle: "Không thể kết nối.",
      formMessage: "Kiểm tra kết nối mạng rồi thử lại."
    };
  }
  if (error.category === "unexpected" || (error.status !== null && error.status >= 500)) {
    return {
      fieldErrors: {},
      formTitle: "Không thể đăng nhập lúc này.",
      formMessage: "Vui lòng thử lại sau."
    };
  }

  const mapped = mapApiErrorToFields(error, ["email", "password"] as const);
  return {
    formTitle: mapped.formMessage ? "Không thể đăng nhập." : null,
    formMessage: mapped.formMessage ? "Vui lòng kiểm tra email và mật khẩu." : null,
    fieldErrors: {
      ...(mapped.fieldErrors.email ? { email: "Email chưa đúng định dạng." } : {}),
      ...(mapped.fieldErrors.password ? { password: "Mật khẩu chưa hợp lệ. Vui lòng kiểm tra lại." } : {})
    }
  };
}

function focusFirstInvalidField(fieldErrors: LoginFeedback["fieldErrors"]): void {
  const field = (["email", "password"] as const).find((candidate) => fieldErrors[candidate]);
  if (field) document.getElementById(`login-${field}`)?.focus();
}

export interface LoginFormProps {
  readonly requiredRole?: UserRole;
  readonly successDestination?: string;
}

export function LoginForm({ requiredRole, successDestination }: LoginFormProps = {}) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<LoginFeedback>(emptyFeedback);

  const clearFieldError = (field: LoginField) => {
    setFeedback((current) => {
      const fieldErrors = { ...current.fieldErrors };
      delete fieldErrors[field];
      return { fieldErrors, formTitle: null, formMessage: null };
    });
  };

  const validateField = (field: LoginField) => {
    const validation = validateLoginInput({ email, password });
    const message = validation.valid ? undefined : validation.errors[field];
    setFeedback((current) => {
      const fieldErrors = { ...current.fieldErrors };
      if (message) fieldErrors[field] = message;
      else delete fieldErrors[field];
      return { ...current, fieldErrors };
    });
  };

  const updateCapsLockState = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(event.getModifierState("CapsLock"));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const validation = validateLoginInput({ email, password });
    if (!validation.valid) {
      const fieldErrors = validation.errors as Partial<Record<LoginField, string>>;
      setFeedback({
        fieldErrors,
        formTitle: null,
        formMessage: null
      });
      focusFirstInvalidField(fieldErrors);
      return;
    }

    setPending(true);
    setFeedback(emptyFeedback);
    try {
      const profile = await api.auth.login(validation.value);
      await refresh();
      if (requiredRole && profile.role !== requiredRole) {
        setFeedback({
          fieldErrors: {},
          formTitle: "Tài khoản này không có quyền quản trị.",
          formMessage: "Hãy dùng tài khoản quản trị để tiếp tục."
        });
        return;
      }
      router.replace(successDestination ?? (profile.role === "LANDLORD" ? "/landlord" : "/"));
    } catch (error) {
      const nextFeedback = feedbackFor(error);
      setFeedback(nextFeedback);
      focusFirstInvalidField(nextFeedback.fieldErrors);
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate aria-busy={pending} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
      {requiredRole === "ADMIN" ? null : <GoogleAuthSeam mode="login" dividerPosition="after" />}
      <InputField
        id="login-email"
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
      <PasswordField
        id="login-password"
        name="password"
        label="Mật khẩu"
        autoComplete="current-password"
        required
        requiredIndicator="sr-only"
        leadingIcon={<Icon name="lock" className="h-4 w-4" />}
        className="rm-auth-control"
        value={password}
        error={feedback.fieldErrors.password}
        onBlur={() => {
          validateField("password");
          setCapsLockOn(false);
        }}
        onKeyDown={updateCapsLockState}
        onKeyUp={updateCapsLockState}
        onChange={(event) => {
          setPassword(event.currentTarget.value);
          clearFieldError("password");
        }}
      />
      {capsLockOn ? (
        <p className="-mt-2 text-ui-xs font-semibold text-muted-foreground" role="status" aria-live="polite">
          Caps Lock đang bật
        </p>
      ) : null}
      <div className="text-right">
        <Link
          href="/forgot-password"
          className="text-ui-sm font-semibold text-primary-hover underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          Quên mật khẩu?
        </Link>
      </div>
      {feedback.formMessage ? (
        <ErrorState title={feedback.formTitle ?? undefined} message={feedback.formMessage} tone="neutral" />
      ) : null}
      <Button type="submit" pending={pending} pendingLabel="Đang đăng nhập…" className="rm-auth-primary w-full">
        <Icon name="logIn" className="h-4 w-4" />
        Đăng nhập
      </Button>
    </form>
  );
}
