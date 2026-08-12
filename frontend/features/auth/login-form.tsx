"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { InputField } from "../../components/ui/form-controls";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import { mapApiErrorToFields } from "../../lib/validation/api-field-errors";
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

  return mapApiErrorToFields(error, ["email", "password"] as const);
}

export function LoginForm() {
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
      setFeedback({
        fieldErrors: validation.errors as Partial<Record<LoginField, string>>,
        formMessage: null,
        requestId: null
      });
      return;
    }

    setPending(true);
    setFeedback(emptyFeedback);
    try {
      await api.auth.login(validation.value);
      await refresh();
      router.replace("/");
    } catch (error) {
      setFeedback(feedbackFor(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <InputField
        id="login-email"
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
        id="login-password"
        name="password"
        label="Mật khẩu"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        error={feedback.fieldErrors.password}
        onChange={(event) => {
          setPassword(event.currentTarget.value);
          clearFieldError("password");
        }}
      />
      {feedback.formMessage ? <ErrorState message={feedback.formMessage} requestId={feedback.requestId} /> : null}
      <Button type="submit" pending={pending} pendingLabel="Đang đăng nhập…" className="w-full">
        Đăng nhập
      </Button>
    </form>
  );
}
