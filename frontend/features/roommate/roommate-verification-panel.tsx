"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { Icon } from "../../components/ui/icon";
import { cx } from "../../components/ui/class-names";
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

function channelName(channel: "email" | "phone"): string {
  return channel === "email" ? "Email" : "Số điện thoại";
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
                Mã OTP 6 số
              </label>
              <input
                id={`roommate-${channel}-verification-code`}
                value={value}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                onChange={(event) => onValueChange(event.target.value.replace(/\D/gu, "").slice(0, 6))}
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

function CompactChannelStatusCard({
  channel,
  status,
  requested,
  value,
  pendingAction,
  error,
  onValueChange,
  onRequest,
  onConfirm,
  onEditProfile
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
  onEditProfile?: () => void;
}>) {
  const isEmail = channel === "email";
  const destination = isEmail ? ("address" in status ? status.address : "") : "number" in status ? status.number : null;
  const destinationMissing = !isEmail && !destination;
  const requestAction = isEmail ? "email-request" : "phone-request";
  const confirmAction = isEmail ? "email-confirm" : "phone-confirm";
  const labelId = `tenant-${channel}-verification-label`;

  return (
    <article className="rounded-control border border-border bg-surface p-4" data-verification-channel={channel}>
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-ui-base font-bold text-foreground">{channelName(channel)}</h3>
            <p className="mt-1 break-all text-ui-sm text-muted-foreground">
              {destinationMissing ? "Chưa cập nhật số điện thoại" : destination}
            </p>
          </div>
          <Icon
            name={status.verified ? "check" : isEmail ? "mail" : "phone"}
            className="h-5 w-5 shrink-0 text-primary"
          />
        </div>
        <span
          className={cx(
            "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-ui-xs font-bold",
            status.verified
              ? "border-success/30 bg-success-subtle text-success"
              : "border-border-strong bg-surface-subtle text-muted-foreground"
          )}
          role="status"
        >
          <Icon name={status.verified ? "check" : "shield"} className="h-3.5 w-3.5" />
          {channelStatusLabel(channel, status.verified)}
        </span>
      </div>

      {!status.verified && destinationMissing ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-ui-xs leading-5 text-muted-foreground">Thêm số điện thoại để xác minh.</p>
          {onEditProfile ? (
            <Button type="button" variant="ghost" size="sm" onClick={onEditProfile}>
              Thêm số điện thoại
            </Button>
          ) : null}
        </div>
      ) : null}

      {!status.verified && !destinationMissing && !status.available ? (
        <p role="note" className="mt-3 border-t border-border pt-3 text-ui-xs leading-5 text-muted-foreground">
          Kênh gửi mã hiện chưa khả dụng. Vui lòng thử lại sau.
        </p>
      ) : null}

      {!status.verified && !destinationMissing && status.available ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            pending={pendingAction === requestAction}
            pendingLabel="Đang gửi…"
            onClick={onRequest}
          >
            {requested ? "Gửi lại mã" : `Xác minh ${isEmail ? "email" : "số điện thoại"}`}
          </Button>
          <p className="text-ui-xs leading-5 text-muted-foreground">
            {isEmail ? "Mã trong email có hiệu lực trong 30 phút." : "Mã OTP có hiệu lực trong 5 phút."}
          </p>
          {requested ? (
            <div className="space-y-2">
              <label className="block text-ui-xs font-bold text-foreground" htmlFor={labelId}>
                Mã OTP 6 số
              </label>
              <input
                id={labelId}
                value={value}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                onChange={(event) => onValueChange(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                className="min-h-11 w-full rounded-control border border-border bg-surface px-3 text-base outline-none transition focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20"
              />
              <Button
                type="button"
                size="sm"
                pending={pendingAction === confirmAction}
                pendingLabel="Đang xác nhận…"
                onClick={onConfirm}
              >
                Xác nhận {isEmail ? "email" : "số điện thoại"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-ui-xs font-semibold leading-5 text-danger">
          {error}
        </p>
      ) : null}
    </article>
  );
}

interface RoommateVerificationPanelProps {
  readonly className?: string;
  readonly presentation?: "roommate" | "compact";
  readonly refreshKey?: number;
  readonly onStatusChange?: (status: TenantContactVerificationStatus) => void;
  readonly onEditProfile?: () => void;
}

export function RoommateVerificationPanel({
  className = "",
  presentation = "roommate",
  refreshKey = 0,
  onStatusChange,
  onEditProfile
}: RoommateVerificationPanelProps = {}) {
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
        onStatusChange?.(result);
        setLoadState("success");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(verificationErrorMessage(caught, "email"));
        setLoadState("error");
      });
    return () => controller.abort();
  }, [onStatusChange, ready, refreshKey, retryKey]);

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
      onStatusChange?.(result);
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
    if (!/^\d{6}$/u.test(emailToken)) {
      setEmailError("Hãy nhập đúng mã OTP email gồm 6 số.");
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

  if (presentation === "compact") {
    return (
      <Card
        padding="none"
        aria-labelledby="tenant-verification-heading"
        className={cx("min-w-0 p-4 sm:p-5", className)}
      >
        <header>
          <p className="rm-workspace-eyebrow">Bảo vệ thông tin liên hệ</p>
          <h2 id="tenant-verification-heading" className="mt-2 font-display text-heading-sm font-bold text-foreground">
            Xác minh liên hệ
          </h2>
          <p className="mt-2 text-ui-sm leading-6 text-muted-foreground">
            Xác minh từng kênh để thông tin liên hệ của bạn rõ ràng hơn.
          </p>
        </header>
        {loadState === "loading" || loadState === "idle" ? (
          <p className="mt-4 rounded-control bg-surface-subtle p-3 text-ui-sm text-muted-foreground" role="status">
            Đang tải trạng thái xác minh…
          </p>
        ) : null}
        {loadState === "error" ? (
          <div className="mt-4 space-y-3">
            <p role="alert" className="rounded-control bg-danger-subtle p-3 text-ui-sm font-semibold text-danger">
              {loadError ?? "Không thể tải trạng thái xác minh."}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => setRetryKey((value) => value + 1)}>
              Thử lại
            </Button>
          </div>
        ) : null}
        {loadState === "success" && verification ? (
          <div className="mt-4 grid gap-3">
            <CompactChannelStatusCard
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
              onEditProfile={onEditProfile}
            />
            <CompactChannelStatusCard
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
              onEditProfile={onEditProfile}
            />
          </div>
        ) : null}
        <p className="mt-4 text-ui-xs leading-5 text-muted-foreground">
          Xác minh email hoặc số điện thoại chỉ xác nhận kênh liên hệ, không đảm bảo an toàn giao dịch.
        </p>
      </Card>
    );
  }

  return (
    <Card
      aria-labelledby="roommate-verification-heading"
      className={cx("rm-roommate-card-static mx-auto max-w-3xl space-y-5", className)}
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
