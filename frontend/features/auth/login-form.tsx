"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
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
  readonly formMessage: string | null;
  readonly requestId: string | null;
}

const emptyFeedback: LoginFeedback = { fieldErrors: {}, formMessage: null, requestId: null };

function feedbackFor(error: unknown): LoginFeedback {
  if (!(error instanceof ApiError)) {
    return { fieldErrors: {}, formMessage: "Không thể đăng nhập lúc này. Vui lòng thử lại sau.", requestId: null };
  }

  if (error.code === "INVALID_CREDENTIALS") {
    return { fieldErrors: {}, formMessage: "Email hoặc mật khẩu không đúng.", requestId: error.requestId };
  }
  if (error.code === "RATE_LIMITED") {
    return {
      fieldErrors: {},
      formMessage: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.",
      requestId: error.requestId
    };
  }
  if (error.code === "NETWORK_ERROR") {
    return { fieldErrors: {}, formMessage: "Không thể kết nối đến máy chủ. Vui lòng thử lại.", requestId: null };
  }
  if (error.category === "unexpected" || (error.status !== null && error.status >= 500)) {
    return {
      fieldErrors: {},
      formMessage: "Không thể đăng nhập lúc này. Vui lòng thử lại sau.",
      requestId: error.requestId
    };
  }

  const mapped = mapApiErrorToFields(error, ["email", "password"] as const);
  return {
    ...mapped,
    formMessage: mapped.formMessage ? "Không thể đăng nhập. Vui lòng kiểm tra email và mật khẩu." : null,
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

export function LoginForm({ requiredRole, successDestination = "/" }: LoginFormProps = {}) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<LoginFeedback>(emptyFeedback);

  const clearFieldError = (field: LoginField) => {
    setFeedback((current) => {
      const fieldErrors = { ...current.fieldErrors };
      delete fieldErrors[field];
      return { fieldErrors, formMessage: null, requestId: null };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    const validation = validateLoginInput({ email, password });
    if (!validation.valid) {
      const fieldErrors = validation.errors as Partial<Record<LoginField, string>>;
      setFeedback({
        fieldErrors,
        formMessage: null,
        requestId: null
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
          formMessage: "Trang này dành cho quản trị viên.",
          requestId: null
        });
        return;
      }
      router.replace(successDestination);
    } catch (error) {
      const nextFeedback = feedbackFor(error);
      setFeedback(nextFeedback);
      focusFirstInvalidField(nextFeedback.fieldErrors);
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate aria-busy={pending} className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
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
        onChange={(event) => {
          setPassword(event.currentTarget.value);
          clearFieldError("password");
        }}
      />
      <div className="text-right">
        <Link
          href="/forgot-password"
          className="text-ui-sm font-semibold text-teal-800 underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
        >
          Quên mật khẩu?
        </Link>
      </div>
      {feedback.formMessage ? <ErrorState message={feedback.formMessage} requestId={feedback.requestId} /> : null}
      <Button type="submit" pending={pending} pendingLabel="Đang đăng nhập…" className="rm-auth-primary w-full">
        <Icon name="logIn" className="h-4 w-4" />
        Đăng nhập
      </Button>
      <GoogleAuthSeam mode="login" />
    </form>
  );
}
