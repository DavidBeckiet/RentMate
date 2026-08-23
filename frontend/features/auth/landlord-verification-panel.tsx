"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Icon } from "../../components/ui/icon";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { LandlordVerification } from "../../types/api";

const statusLabels = {
  PENDING: "Đang chờ duyệt",
  APPROVED: "Đã xác minh",
  REJECTED: "Cần gửi lại"
} as const;

export function LandlordVerificationPanel() {
  const { status, user } = useAuth();
  const ready = status === "authenticated" && user?.role === "LANDLORD";
  const [verification, setVerification] = useState<LandlordVerification | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [displayName, setDisplayName] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoadState("loading");
    void api.users
      .getCurrentVerification(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setVerification(result);
          setDisplayName(result?.displayName ?? "");
          setLoadState("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("error");
      });
    return () => controller.abort();
  }, [ready]);

  if (!ready) return null;

  const submit = async () => {
    const normalizedName = displayName.trim();
    if (normalizedName.length < 2) {
      setError("Tên hiển thị cần có ít nhất 2 ký tự.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await api.users.submitVerification({ displayName: normalizedName, note: note.trim() || null });
      setVerification(created);
      setNote("");
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(
        apiError?.status === 409
          ? "Bạn đã có một yêu cầu đang chờ hoặc hồ sơ đã được xác minh."
          : "Chưa thể gửi yêu cầu xác minh. Vui lòng thử lại."
      );
    } finally {
      setPending(false);
    }
  };

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
          RentMate chỉ duyệt hồ sơ và thông tin liên hệ hiện có. Luồng này không phải eKYC và không yêu cầu tải giấy tờ.
        </p>
      </header>

      {loadState === "loading" || loadState === "idle" ? <p role="status">Đang tải trạng thái xác minh…</p> : null}
      {loadState === "error" ? (
        <p role="alert" className="border-l-4 border-red-800 pl-3 text-sm font-bold text-red-800">
          Không thể tải trạng thái xác minh.
        </p>
      ) : null}

      {loadState === "success" && verification ? (
        <div className="space-y-3 border-2 border-heroDark-950 bg-[#e5eefc] p-4">
          <p className="inline-flex items-center gap-2 text-sm font-extrabold">
            <Icon name={verification.status === "APPROVED" ? "check" : "shield"} className="h-4 w-4" />
            {statusLabels[verification.status]}
          </p>
          <p className="text-sm font-bold">Tên hiển thị: {verification.displayName}</p>
          {verification.decisionNote ? (
            <p className="text-sm leading-6">Phản hồi: {verification.decisionNote}</p>
          ) : null}
        </div>
      ) : null}

      {loadState === "success" && verification?.status !== "PENDING" && verification?.status !== "APPROVED" ? (
        <div className="space-y-4">
          <label className="block text-sm font-extrabold" htmlFor="verification-display-name">
            Tên chủ trọ muốn hiển thị
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
          {error ? (
            <p role="alert" className="border-l-4 border-red-800 pl-3 text-sm font-bold text-red-800">
              {error}
            </p>
          ) : null}
          <Button pending={pending} pendingLabel="Đang gửi…" onClick={() => void submit()}>
            {verification?.status === "REJECTED" ? "Gửi lại yêu cầu" : "Gửi yêu cầu xác minh"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
