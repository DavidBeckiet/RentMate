"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/ui/feedback-states";
import { api, ApiError } from "../../lib/api/client";
import type { GoogleAuthStartBody } from "../../types/api";

type GoogleRegistrationRole = "TENANT" | "LANDLORD";

interface GoogleAuthSeamProps {
  readonly mode: "login" | "register";
  readonly role?: GoogleRegistrationRole;
  readonly phone?: string;
  readonly enabled?: boolean;
  readonly onRedirect?: (url: string) => void;
}

const googleErrorMessages: Readonly<Record<string, string>> = {
  "account-exists": "Tài khoản Google này đã có trên RentMate. Hãy đăng nhập thay vì đăng ký lại.",
  "account-unavailable": "Tài khoản Google này hiện không thể đăng nhập.",
  "not-configured": "Đăng nhập Google chưa được cấu hình cho môi trường này.",
  "not-registered": "Google chưa được liên kết với tài khoản RentMate. Hãy đăng ký trước.",
  cancelled: "Bạn đã hủy đăng nhập bằng Google.",
  failed: "Không thể hoàn tất đăng nhập bằng Google. Vui lòng thử lại."
};

function startError(error: unknown): { readonly message: string; readonly requestId: string | null } {
  if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
    return { message: "Vui lòng nhập số điện thoại hợp lệ trước khi đăng ký bằng Google.", requestId: error.requestId };
  }
  if (error instanceof ApiError && error.code === "GOOGLE_AUTH_NOT_CONFIGURED") {
    return { message: googleErrorMessages["not-configured"]!, requestId: error.requestId };
  }
  if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
    return { message: "Không thể kết nối đến máy chủ. Vui lòng thử lại.", requestId: null };
  }
  return {
    message: "Không thể bắt đầu đăng nhập bằng Google. Vui lòng thử lại.",
    requestId: error instanceof ApiError ? error.requestId : null
  };
}

export function GoogleAuthSeam({ mode, role, phone, enabled = true, onRedirect }: Readonly<GoogleAuthSeamProps>) {
  const availabilityId = `google-${mode}-availability`;
  const label = mode === "login" ? "Đăng nhập nhanh bằng Google" : "Đăng ký nhanh bằng Google";
  const providerConfigured = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ readonly message: string; readonly requestId: string | null } | null>(
    null
  );
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get("googleError");
    if (!error) return;
    setOauthMessage(googleErrorMessages[error] ?? googleErrorMessages.failed);
    url.searchParams.delete("googleError");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const startGoogleAuth = async () => {
    if (pending || !providerConfigured || !enabled) return;
    if (mode === "register" && !role) return;

    setPending(true);
    setFeedback(null);
    setOauthMessage(null);
    const body: GoogleAuthStartBody =
      mode === "login"
        ? { intent: "LOGIN" }
        : role === "LANDLORD"
          ? { intent: "REGISTER", role, phone: phone?.trim() || undefined }
          : { intent: "REGISTER", role: "TENANT" };

    try {
      const result = await api.auth.startGoogle(body);
      (onRedirect ?? ((url: string) => window.location.assign(url)))(result.redirectUrl);
    } catch (error) {
      setFeedback(startError(error));
      setPending(false);
    }
  };

  return (
    <div className="rm-auth-google-seam space-y-2 pt-1">
      <div className="rm-auth-divider flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-ui-xs font-semibold text-muted-foreground">hoặc</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={!providerConfigured || !enabled}
        pending={pending}
        pendingLabel="Đang chuyển đến Google…"
        aria-describedby={availabilityId}
        onClick={() => void startGoogleAuth()}
        className="rm-auth-google w-full"
      >
        <span
          aria-hidden="true"
          className="rm-google-mark grid h-6 w-6 place-items-center rounded-full font-sans text-ui-sm font-bold"
        >
          G
        </span>
        {label}
      </Button>
      {feedback ? <ErrorState message={feedback.message} requestId={feedback.requestId} /> : null}
      {oauthMessage ? (
        <p className="text-center text-ui-xs font-medium text-red-800" role="alert">
          {oauthMessage}
        </p>
      ) : null}
      <p id={availabilityId} className="rm-auth-google-status text-center text-ui-xs font-medium text-muted-foreground">
        {providerConfigured && enabled ? "Bảo mật bởi Google" : "Google chưa được cấu hình"}
      </p>
    </div>
  );
}
