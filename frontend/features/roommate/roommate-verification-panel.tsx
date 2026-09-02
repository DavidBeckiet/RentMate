"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { TenantContactVerificationStatus } from "../../types/api";

type VerificationAction = "email-request" | "email-confirm" | "phone-request" | "phone-confirm" | null;

function verificationErrorMessage(error: unknown, channel: "email" | "phone"): string {
  const apiError = error instanceof ApiError ? error : null;
  if (apiError?.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
  if (apiError?.status === 403) return "Bạn không có quyền cập nhật xác minh liên hệ.";
  if (apiError?.status === 409) return `Kênh ${channel === "email" ? "email" : "số điện thoại"} này đã được xác minh.`;
  if (apiError?.status === 422 || apiError?.code === "VALIDATION_FAILED") {
    return `Mã ${channel === "email" ? "email" : "OTP"} không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới.`;
  }
  if (apiError?.status === 429 || apiError?.code === "RATE_LIMITED") {
    return "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.";
  }
  if (
    apiError?.status === 503 ||
    apiError?.code === "PROVIDER_UNAVAILABLE" ||
    apiError?.code === "DEPENDENCY_UNAVAILABLE"
  ) {
    return `Kênh gửi mã ${channel === "email" ? "email" : "OTP"} hiện chưa khả dụng. Vui lòng thử lại sau.`;
  }
  if (apiError?.code === "NETWORK_ERROR") return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
  return "Không thể cập nhật xác minh lúc này. Vui lòng thử lại.";
}

function channelStatusLabel(channel: "email" | "phone", verified: boolean): string {
  if (channel === "email") return verified ? "Email đã xác minh" : "Email chưa xác minh";
  return verified ? "Số điện thoại đã xác minh" : "Số điện thoại chưa xác minh";
}

function ChannelStatusCard({
  channel,
  status,
  requested,
  value,
  pendingAction,
  error,
  onValueChange,
  onRequest,
  onConfirm
}: Readonly<{
  channel: "email" | "phone";
  status: TenantContactVerificationStatus["email"] | TenantContactVerificationStatus["phone"];
  requested: boolean;
  value: string;
  pendingAction: VerificationAction;
  error: string | null;
  onValueChange: (value: string) => void;
  onRequest: () => void;
  onConfirm: () => void;
}>) {
  const isEmail = channel === "email";
  const destination = isEmail ? ("address" in status ? status.address : "") : "number" in status ? status.number : null;
  const destinationMissing = !isEmail && !destination;
  const requestAction = isEmail ? "email-request" : "phone-request";
  const confirmAction = isEmail ? "email-confirm" : "phone-confirm";
  const requestLabel = requested ? "Gửi lại mã" : "Gửi mã";

  return (
    <article className="rm-roommate-card-static space-y-4" data-verification-channel={channel}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="rm-roommate-section-label">Kênh liên hệ</p>
          <h3 className="mt-1 font-display text-ui-base font-bold">{isEmail ? "Email" : "Số điện thoại"}</h3>
          <p className="mt-1 break-all text-ui-sm text-muted-foreground">
            {destinationMissing ? "Chưa cập nhật số điện thoại" : destination}
          </p>
        </div>
        <Icon name={status.verified ? "check" : isEmail ? "mail" : "phone"} className="h-5 w-5 shrink-0" />
      </div>
      <p className="rm-roommate-chip w-fit" role="status" data-outcome={status.verified ? "ALIGNED" : "NOT_EVALUATED"}>
        {channelStatusLabel(channel, status.verified)}
      </p>
      {!status.verified && !destinationMissing && !status.available ? (
        <p role="note" className="rm-roommate-callout text-ui-sm leading-6" data-tone="info">
          Kênh gửi mã hiện chưa khả dụng. Bạn có thể thử lại sau khi kênh được bật.
        </p>
      ) : null}
      {!status.verified && !destinationMissing && status.available ? (
        <div className="space-y-3">
          <Button
            variant="outline"
            pending={pendingAction === requestAction}
            pendingLabel="Đang gửi…"
            onClick={onRequest}
          >
            {requestLabel} {isEmail ? "email" : "OTP"}
          </Button>
          <p className="text-ui-xs leading-5 text-muted-foreground">
            {isEmail ? "Mã trong email có hiệu lực trong 30 phút." : "Mã OTP có hiệu lực trong 5 phút."}
          </p>
          {requested ? (
            <div className="space-y-3 border-t border-border pt-4">
              <label className="block text-ui-sm font-bold" htmlFor={`roommate-${channel}-verification-code`}>
                {isEmail ? "Mã xác minh trong email" : "Mã OTP 6 số"}
              </label>
              <input
                id={`roommate-${channel}-verification-code`}
                value={value}
                maxLength={isEmail ? 200 : 6}
                inputMode={isEmail ? "text" : "numeric"}
                autoComplete="one-time-code"
                onChange={(event) => onValueChange(event.target.value)}
                className="min-h-11 w-full rounded-control border border-border bg-surface px-3 text-base outline-none transition focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20"
                aria-describedby={`roommate-${channel}-verification-hint`}
              />
              <p id={`roommate-${channel}-verification-hint`} className="text-ui-xs text-muted-foreground">
                Không chia sẻ mã này với người khác.
              </p>
              <Button pending={pendingAction === confirmAction} pendingLabel="Đang xác nhận…" onClick={onConfirm}>
                Xác nhận {isEmail ? "email" : "số điện thoại"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export function RoommateVerificationPanel() {
  const { status: authStatus, user } = useAuth();
  const ready = authStatus === "authenticated" && user?.role === "TENANT" && user.isActive;
  const [verification, setVerification] = useState<TenantContactVerificationStatus | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [emailToken, setEmailToken] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [emailRequested, setEmailRequested] = useState(false);
  const [phoneRequested, setPhoneRequested] = useState(false);
  const [pendingAction, setPendingAction] = useState<VerificationAction>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError(null);
    void api.users
      .getTenantContactVerificationStatus(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setVerification(result);
        setLoadState("success");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(verificationErrorMessage(caught, "email"));
        setLoadState("error");
      });
    return () => controller.abort();
  }, [ready, retryKey]);

  if (!ready) return null;

  const runAction = async (
    action: Exclude<VerificationAction, null>,
    channel: "email" | "phone",
    operation: () => Promise<TenantContactVerificationStatus>
  ) => {
    setPendingAction(action);
    if (channel === "email") setEmailError(null);
    else setPhoneError(null);
    try {
      const result = await operation();
      setVerification(result);
      if (channel === "email") {
        setEmailRequested(action === "email-request" && !result.email.verified);
        if (result.email.verified) setEmailToken("");
      } else {
        setPhoneRequested(action === "phone-request" && !result.phone.verified);
        if (result.phone.verified) setPhoneCode("");
      }
    } catch (caught) {
      const message = verificationErrorMessage(caught, channel);
      if (channel === "email") setEmailError(message);
      else setPhoneError(message);
    } finally {
      setPendingAction(null);
    }
  };

  const requestEmail = () => void runAction("email-request", "email", () => api.users.requestTenantEmailVerification());
  const confirmEmail = () => {
    if (!emailToken.trim()) {
      setEmailError("Hãy nhập mã xác minh trong email.");
      return;
    }
    void runAction("email-confirm", "email", () => api.users.confirmTenantEmailVerification(emailToken.trim()));
  };
  const requestPhone = () => void runAction("phone-request", "phone", () => api.users.requestTenantPhoneVerification());
  const confirmPhone = () => {
    if (!phoneCode.trim()) {
      setPhoneError("Hãy nhập mã OTP 6 số.");
      return;
    }
    void runAction("phone-confirm", "phone", () => api.users.confirmTenantPhoneVerification(phoneCode.trim()));
  };

  return (
    <Card
      aria-labelledby="roommate-verification-heading"
      className="rm-roommate-card-static mx-auto max-w-3xl space-y-5"
    >
      <header>
        <p className="rm-roommate-section-label inline-flex items-center gap-2">
          <Icon name="shield" className="h-4 w-4" /> Xác minh liên hệ
        </p>
        <h2 id="roommate-verification-heading" className="mt-2 font-display text-heading-sm font-bold">
          Xác minh email và số điện thoại
        </h2>
        <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
          Hai kênh được xử lý độc lập. Chỉ trạng thái đã xác minh mới có thể xuất hiện dưới dạng thông tin thực tế trong
          hồ sơ ở ghép.
        </p>
      </header>
      {loadState === "loading" || loadState === "idle" ? (
        <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Đang tải trạng thái xác minh">
          <Skeleton className="h-44 w-full" rounded="card" />
          <Skeleton className="h-44 w-full" rounded="card" />
        </div>
      ) : null}
      {loadState === "error" ? (
        <div className="space-y-3">
          <p role="alert" className="rm-roommate-callout text-ui-sm font-semibold text-danger" data-tone="danger">
            {loadError ?? "Không thể tải trạng thái xác minh."}
          </p>
          <Button variant="outline" onClick={() => setRetryKey((value) => value + 1)}>
            Thử lại
          </Button>
        </div>
      ) : null}
      {loadState === "success" && verification ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <ChannelStatusCard
            channel="email"
            status={verification.email}
            requested={emailRequested}
            value={emailToken}
            pendingAction={pendingAction}
            error={emailError}
            onValueChange={(value) => {
              setEmailToken(value);
              setEmailError(null);
            }}
            onRequest={requestEmail}
            onConfirm={confirmEmail}
          />
          <ChannelStatusCard
            channel="phone"
            status={verification.phone}
            requested={phoneRequested}
            value={phoneCode}
            pendingAction={pendingAction}
            error={phoneError}
            onValueChange={(value) => {
              setPhoneCode(value.replace(/\D/gu, "").slice(0, 6));
              setPhoneError(null);
            }}
            onRequest={requestPhone}
            onConfirm={confirmPhone}
          />
        </div>
      ) : null}
      <p className="rm-roommate-callout text-ui-xs font-semibold leading-5" data-tone="warning">
        Xác minh liên hệ chỉ là thông tin thực tế về trạng thái kênh; không bảo đảm độ an toàn hay kết quả giao dịch.
      </p>
    </Card>
  );
}
