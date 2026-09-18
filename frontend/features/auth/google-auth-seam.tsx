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
  readonly enabled?: boolean;
  readonly dividerPosition?: "before" | "after";
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

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.35 12.2c0-.64-.06-1.25-.16-1.84H12v3.48h5.25a4.49 4.49 0 0 1-1.95 2.94v2.9h3.16c1.85-1.7 2.89-4.22 2.89-7.48Z"
      />
      <path
        fill="#34A853"
        d="M12 21.72c2.64 0 4.85-.87 6.46-2.36l-3.16-2.9c-.88.59-2 .94-3.3.94-2.55 0-4.71-1.72-5.48-4.03H3.26v3c1.6 3.18 4.9 5.35 8.74 5.35Z"
      />
      <path
        fill="#FBBC05"
        d="M6.52 13.37A5.72 5.72 0 0 1 6.22 12c0-.48.1-.94.3-1.37v-3H3.26A9.72 9.72 0 0 0 2.22 12c0 1.57.38 3.05 1.04 4.37l3.26-3Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.6c1.44 0 2.73.5 3.75 1.47l2.78-2.78C16.84 3.72 14.64 2.28 12 2.28c-3.84 0-7.14 2.2-8.74 5.35l3.26 3C7.29 8.32 9.45 6.6 12 6.6Z"
      />
    </svg>
  );
}

function startError(error: unknown): string {
  if (error instanceof ApiError && error.code === "GOOGLE_AUTH_NOT_CONFIGURED") {
    return googleErrorMessages["not-configured"]!;
  }
  if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
    return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
  }
  return "Không thể bắt đầu đăng nhập bằng Google. Vui lòng thử lại.";
}

export function GoogleAuthSeam({
  mode,
  role,
  enabled = true,
  onRedirect,
  dividerPosition = "before"
}: Readonly<GoogleAuthSeamProps>) {
  const availabilityId = `google-${mode}-availability`;
  const label = "Tiếp tục với Google";
  const providerConfigured = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
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
          ? { intent: "REGISTER", role }
          : { intent: "REGISTER", role: "TENANT" };

    try {
      const result = await api.auth.startGoogle(body);
      (onRedirect ?? ((url: string) => window.location.assign(url)))(result.redirectUrl);
    } catch (error) {
      setFeedback(startError(error));
      setPending(false);
    }
  };

  const divider = (
    <div className="rm-auth-divider flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-ui-xs font-semibold text-muted-foreground">hoặc</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );

  return (
    <div className="rm-auth-google-seam space-y-2 pt-1">
      {dividerPosition === "before" ? divider : null}
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
          <GoogleMark />
        </span>
        {label}
      </Button>
      {feedback ? <ErrorState message={feedback} tone="neutral" /> : null}
      {oauthMessage ? (
        <p className="text-center text-ui-xs font-medium text-danger" role="alert">
          {oauthMessage}
        </p>
      ) : null}
      <p
        id={availabilityId}
        className={
          providerConfigured && enabled
            ? "sr-only"
            : "rm-auth-google-status text-center text-ui-xs font-medium text-muted-foreground"
        }
      >
        {providerConfigured && enabled
          ? "Bạn sẽ tiếp tục trên trang xác thực của Google."
          : "Google chưa được cấu hình."}
      </p>
      {dividerPosition === "after" ? divider : null}
    </div>
  );
}
