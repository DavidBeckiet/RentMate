"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ContactVerificationStatus, LandlordVerification } from "../../types/api";

const statusLabels = {
  PENDING: "Đang chờ duyệt",
  APPROVED: "Đã xác minh",
  REJECTED: "Cần gửi lại"
} as const;

type PendingAction = "email-request" | "email-confirm" | "phone-request" | "phone-confirm" | "profile" | null;

function contactStatusLabel(verified: boolean): string {
  return verified ? "Đã xác minh" : "Chưa xác minh";
}

function updateProfile(status: ContactVerificationStatus, profile: LandlordVerification): ContactVerificationStatus {
  return Object.freeze({ ...status, profile });
}

export function LandlordVerificationPanel() {
  const { status: authStatus, user } = useAuth();
  const ready = authStatus === "authenticated" && user?.role === "LANDLORD";
  const [verification, setVerification] = useState<ContactVerificationStatus | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [displayName, setDisplayName] = useState("");
  const [note, setNote] = useState("");
  const [emailToken, setEmailToken] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [emailRequested, setEmailRequested] = useState(false);
  const [phoneRequested, setPhoneRequested] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoadState("loading");
    void api.users
      .getContactVerificationStatus(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setVerification(result);
          setDisplayName(result.profile?.displayName ?? "");
          setLoadState("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("error");
      });
    return () => controller.abort();
  }, [ready]);

  if (!ready) return null;

  const runContactAction = async (
    action: Exclude<PendingAction, "profile" | null>,
    operation: () => Promise<ContactVerificationStatus>
  ) => {
    setPendingAction(action);
    setError(null);
    try {
      const result = await operation();
      setVerification(result);
      if (action.startsWith("email")) setEmailRequested(true);
      if (action.startsWith("phone")) setPhoneRequested(true);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(
        apiError?.status === 429
          ? "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút."
          : apiError?.status === 502 || apiError?.status === 503
            ? "Kênh gửi mã đang tạm thời không khả dụng. Vui lòng thử lại sau."
            : "Không thể cập nhật xác minh. Vui lòng kiểm tra lại thông tin."
      );
    } finally {
      setPendingAction(null);
    }
  };

  const submitProfile = async () => {
    const normalizedName = displayName.trim();
    if (normalizedName.length < 2) {
      setError("Tên trong hồ sơ xác minh cần có ít nhất 2 ký tự.");
      return;
    }
    setPendingAction("profile");
    setError(null);
    try {
      const created = await api.users.submitVerification({ displayName: normalizedName, note: note.trim() || null });
      setVerification((current) => (current ? updateProfile(current, created) : current));
      setNote("");
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(
        apiError?.status === 409
          ? "Bạn đã có một yêu cầu đang chờ hoặc hồ sơ đã được xác minh."
          : "Chưa thể gửi yêu cầu xác minh. Vui lòng thử lại."
      );
    } finally {
      setPendingAction(null);
    }
  };

  const profile = verification?.profile ?? null;
  const contactsVerified = verification?.email.verified === true && verification.phone.verified === true;

  return (
    <section
      className="space-y-5 border-2 border-heroDark-950 bg-[#fffdf7] p-5 shadow-glass sm:p-7"
      aria-labelledby="verification-heading"
    >
      <header>
        <span className="rm-eyebrow inline-flex items-center gap-2">
          <Icon name="shield" className="h-4 w-4" /> Độ tin cậy
        </span>
        <h2 id="verification-heading" className="mt-2 font-display text-2xl font-extrabold text-rent-ink">
          Xác minh hồ sơ chủ trọ
        </h2>
        <p className="mt-2 text-sm leading-6 text-rent-secondary">
          Hoàn tất email và số điện thoại trước khi gửi hồ sơ để admin duyệt. RentMate không yêu cầu tải giấy tờ.
        </p>
      </header>

      {loadState === "loading" || loadState === "idle" ? <p role="status">Đang tải trạng thái xác minh…</p> : null}
      {loadState === "error" ? (
        <p role="alert" className="border-l-4 border-red-800 pl-3 text-sm font-bold text-red-800">
          Không thể tải trạng thái xác minh.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="border-l-4 border-red-800 pl-3 text-sm font-bold text-red-800">
          {error}
        </p>
      ) : null}

      {loadState === "success" && verification ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="space-y-2 border-2 border-heroDark-950 bg-[#e5eefc] p-4">
            <p className="text-sm font-extrabold">Email</p>
            <p className="break-all text-sm text-rent-secondary">{verification.email.address}</p>
            <p className="inline-flex items-center gap-2 text-sm font-extrabold">
              <Icon name={verification.email.verified ? "check" : "mail"} className="h-4 w-4" />
              {contactStatusLabel(verification.email.verified)}
            </p>
            {!verification.email.verified ? (
              <div className="space-y-2 pt-1">
                <Button
                  pending={pendingAction === "email-request"}
                  pendingLabel="Đang gửi…"
                  onClick={() => void runContactAction("email-request", () => api.users.requestEmailVerification())}
                >
                  Gửi mã email
                </Button>
                {emailRequested ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-bold" htmlFor="landlord-email-token">
                      Mã xác minh trong email
                    </label>
                    <input
                      id="landlord-email-token"
                      value={emailToken}
                      onChange={(event) => setEmailToken(event.target.value)}
                      className="min-h-11 w-full border-2 border-heroDark-950 bg-white px-3 outline-none focus:ring-4 focus:ring-brandBlue-500/30"
                      autoComplete="one-time-code"
                    />
                    <Button
                      pending={pendingAction === "email-confirm"}
                      pendingLabel="Đang xác nhận…"
                      onClick={() =>
                        void runContactAction("email-confirm", () =>
                          api.users.confirmEmailVerification(emailToken.trim())
                        )
                      }
                    >
                      Xác nhận email
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>

          <article className="space-y-2 border-2 border-heroDark-950 bg-[#e5eefc] p-4">
            <p className="text-sm font-extrabold">Số điện thoại</p>
            <p className="break-all text-sm text-rent-secondary">{verification.phone.number ?? "Chưa cập nhật"}</p>
            <p className="inline-flex items-center gap-2 text-sm font-extrabold">
              <Icon name={verification.phone.verified ? "check" : "phone"} className="h-4 w-4" />
              {contactStatusLabel(verification.phone.verified)}
            </p>
            {!verification.phone.verified && verification.phone.number ? (
              <div className="space-y-2 pt-1">
                <Button
                  pending={pendingAction === "phone-request"}
                  pendingLabel="Đang gửi…"
                  onClick={() => void runContactAction("phone-request", () => api.users.requestPhoneVerification())}
                >
                  Gửi mã OTP
                </Button>
                {phoneRequested ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-bold" htmlFor="landlord-phone-code">
                      Mã OTP 6 số
                    </label>
                    <input
                      id="landlord-phone-code"
                      value={phoneCode}
                      maxLength={6}
                      inputMode="numeric"
                      onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="min-h-11 w-full border-2 border-heroDark-950 bg-white px-3 outline-none focus:ring-4 focus:ring-brandBlue-500/30"
                      autoComplete="one-time-code"
                    />
                    <Button
                      pending={pendingAction === "phone-confirm"}
                      pendingLabel="Đang xác nhận…"
                      onClick={() =>
                        void runContactAction("phone-confirm", () =>
                          api.users.confirmPhoneVerification(phoneCode.trim())
                        )
                      }
                    >
                      Xác nhận số điện thoại
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        </div>
      ) : null}

      {loadState === "success" && profile ? (
        <div className="space-y-3 border-2 border-heroDark-950 bg-[#e5eefc] p-4">
          <p className="inline-flex items-center gap-2 text-sm font-extrabold">
            <Icon name={profile.status === "APPROVED" ? "check" : "shield"} className="h-4 w-4" />
            {statusLabels[profile.status]}
          </p>
          <p className="text-sm font-bold">Tên trong hồ sơ xác minh: {profile.displayName}</p>
          {profile.decisionNote ? <p className="text-sm leading-6">Phản hồi: {profile.decisionNote}</p> : null}
        </div>
      ) : null}

      {loadState === "success" && !contactsVerified ? (
        <p className="border-l-4 border-brandBlue-700 pl-3 text-sm font-bold text-rent-secondary">
          Vui lòng xác minh cả email và số điện thoại để mở bước duyệt hồ sơ.
        </p>
      ) : null}

      {loadState === "success" &&
      contactsVerified &&
      profile?.status !== "PENDING" &&
      profile?.status !== "APPROVED" ? (
        <div className="space-y-4">
          <label className="block text-sm font-extrabold" htmlFor="verification-display-name">
            Tên trong hồ sơ xác minh
          </label>
          <input
            id="verification-display-name"
            value={displayName}
            maxLength={120}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setError(null);
            }}
            className="min-h-11 w-full border-2 border-heroDark-950 bg-white px-3 outline-none focus:ring-4 focus:ring-brandBlue-500/30"
          />
          <label className="block text-sm font-extrabold" htmlFor="verification-note">
            Ghi chú hỗ trợ <span className="font-semibold text-rent-secondary">(không bắt buộc)</span>
          </label>
          <textarea
            id="verification-note"
            value={note}
            maxLength={1000}
            rows={4}
            onChange={(event) => setNote(event.target.value)}
            className="w-full resize-y border-2 border-heroDark-950 bg-white p-3 outline-none focus:ring-4 focus:ring-brandBlue-500/30"
          />
          <Button pending={pendingAction === "profile"} pendingLabel="Đang gửi…" onClick={() => void submitProfile()}>
            {profile?.status === "REJECTED" ? "Gửi lại yêu cầu" : "Gửi yêu cầu xác minh"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
