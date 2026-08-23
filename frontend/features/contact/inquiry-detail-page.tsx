"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { api, ApiError } from "../../lib/api/client";
import { connectInquiryRealtime, type InquiryRealtimeConnectionStatus } from "../../lib/api/inquiry-realtime";
import { useAuth } from "../../lib/auth/auth-provider";
import type { Inquiry } from "../../types/api";
import { TenantReviewPanel } from "../reviews/tenant-review-panel";

function parseId(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function statusLabel(status: Inquiry["status"]): string {
  return status === "NEW" ? "Mới" : status === "CONTACTED" ? "Đang trao đổi" : "Đã đóng";
}

function mergeMessages(...collections: readonly (readonly Inquiry["messages"][number][])[]): Inquiry["messages"] {
  const messages = new Map<number, Inquiry["messages"][number]>();
  for (const collection of collections) {
    for (const message of collection) messages.set(message.id, message);
  }
  return Object.freeze([...messages.values()].sort((left, right) => left.id - right.id));
}

const realtimeStatusLabels: Readonly<Record<InquiryRealtimeConnectionStatus, string>> = Object.freeze({
  connecting: "Đang kết nối trực tiếp…",
  connected: "Đã kết nối trực tiếp — tin mới sẽ tự xuất hiện",
  reconnecting: "Mất kết nối — đang thử kết nối lại…",
  unsupported: "Trình duyệt không hỗ trợ kết nối trực tiếp; bạn vẫn có thể gửi tin"
});

export function InquiryDetailPage({ inquiryId }: Readonly<{ inquiryId: string }>) {
  const id = useMemo(() => parseId(inquiryId), [inquiryId]);
  const { status: authStatus, user } = useAuth();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">(id === null ? "error" : "loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<InquiryRealtimeConnectionStatus>("connecting");

  const load = useCallback(() => {
    if (id === null) return;
    const controller = new AbortController();
    setState("loading");
    void api.contact
      .getInquiry(id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setInquiry(result);
          setState("success");
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => load(), [load]);

  const synchronize = useCallback(async () => {
    if (id === null) return;
    try {
      const fresh = await api.contact.getInquiry(id);
      setInquiry((current) =>
        current === null ? fresh : { ...fresh, messages: mergeMessages(current.messages, fresh.messages) }
      );
    } catch {
      // EventSource continues reconnecting; the ordinary page controls remain usable.
    }
  }, [id]);

  useEffect(() => {
    if (id === null || authStatus !== "authenticated" || !user || state !== "success") return;
    const connection = connectInquiryRealtime(id, {
      onStatusChange: setRealtimeStatus,
      onEvent: (event) => {
        if (event.inquiryId !== id) return;
        if (event.type === "MESSAGE_CREATED") {
          setInquiry((current) =>
            current === null ? current : { ...current, messages: mergeMessages(current.messages, [event.message]) }
          );
          if (event.message.senderRole !== user.role) void synchronize();
        } else if (event.type === "STATUS_CHANGED") {
          setInquiry((current) =>
            current === null ? current : { ...current, status: event.status, updatedAt: event.updatedAt }
          );
        } else {
          void synchronize();
        }
      }
    });
    return () => connection.close();
  }, [authStatus, id, state, synchronize, user]);

  if (authStatus === "loading" || state === "loading") return <LoadingState message="Đang mở cuộc trò chuyện…" />;
  if (authStatus !== "authenticated" || !user)
    return (
      <ErrorState
        message="Vui lòng đăng nhập để xem cuộc trò chuyện."
        action={
          <Link className="font-bold text-teal-800 underline" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  if (state === "error" || !inquiry)
    return (
      <ErrorState
        message={
          error?.status === 404
            ? "Cuộc trò chuyện không tồn tại hoặc bạn không có quyền xem."
            : "Không thể tải cuộc trò chuyện."
        }
        action={<Button onClick={load}>Thử lại</Button>}
      />
    );

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !message.trim()) return;
    setPending(true);
    try {
      const sent = await api.contact.sendMessage(inquiry.id, message.trim());
      setInquiry((current) =>
        current === null ? current : { ...current, messages: mergeMessages(current.messages, [sent]) }
      );
      setMessage("");
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught : null);
    } finally {
      setPending(false);
    }
  };

  const changeStatus = async (nextStatus: "CONTACTED" | "CLOSED") => {
    setStatusPending(true);
    try {
      const updated = await api.contact.updateInquiryStatus(inquiry.id, nextStatus);
      setInquiry((current) =>
        current === null ? updated : { ...updated, messages: mergeMessages(current.messages, updated.messages) }
      );
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught : null);
    } finally {
      setStatusPending(false);
    }
  };

  const isLandlord = user.role === "LANDLORD";
  return (
    <section className="rm-workspace my-4 space-y-8" aria-labelledby="inquiry-detail-heading">
      <Link
        href={isLandlord ? "/landlord/inquiries" : "/inquiries"}
        className="inline-flex font-bold text-teal-800 underline"
      >
        ← Quay lại danh sách yêu cầu
      </Link>
      <header className="flex flex-col gap-4 border-2 border-heroDark-950 bg-rent-accent p-6 shadow-glass sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <span className="rm-eyebrow">CUỘC TRÒ CHUYỆN</span>
          <h1 id="inquiry-detail-heading" className="mt-2 font-display text-4xl font-bold">
            Tin đăng #{inquiry.listingId}
          </h1>
          <p className="mt-2 text-sm font-bold">Trạng thái: {statusLabel(inquiry.status)}</p>
          <p
            role="status"
            aria-live="polite"
            className="mt-3 inline-flex items-center gap-2 border-2 border-heroDark-950 bg-white px-3 py-2 text-xs font-extrabold"
          >
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full border border-heroDark-950 ${
                realtimeStatus === "connected"
                  ? "bg-[#22c55e]"
                  : realtimeStatus === "reconnecting"
                    ? "bg-rent-coral"
                    : "bg-rent-yellow"
              }`}
            />
            {realtimeStatusLabels[realtimeStatus]}
          </p>
        </div>
        {isLandlord && inquiry.status !== "CLOSED" ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" pending={statusPending} onClick={() => void changeStatus("CONTACTED")}>
              Đã liên hệ
            </Button>
            <Button variant="danger" pending={statusPending} onClick={() => void changeStatus("CLOSED")}>
              Đóng yêu cầu
            </Button>
          </div>
        ) : null}
      </header>
      {error ? (
        <p role="alert" className="border-2 border-heroDark-950 bg-rent-coral p-4 text-sm font-bold">
          Không thể cập nhật cuộc trò chuyện. Vui lòng thử lại.
        </p>
      ) : null}
      <div
        className="space-y-4"
        aria-label="Tin nhắn trong cuộc trò chuyện"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {inquiry.messages.map((item) => (
          <article
            key={item.id}
            className={`max-w-2xl border-2 border-heroDark-950 p-4 shadow-glass-sm ${item.senderRole === user.role ? "ml-auto bg-rent-accent" : "bg-rent-surface"}`}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {item.senderRole === "TENANT" ? "Người thuê" : "Chủ trọ"} ·{" "}
              {new Date(item.createdAt).toLocaleString("vi-VN")}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6">{item.body}</p>
          </article>
        ))}
      </div>
      {inquiry.status === "CLOSED" ? (
        <p className="border-2 border-heroDark-950 bg-slate-100 p-4 text-sm font-bold text-slate-600">
          Yêu cầu đã đóng, không thể gửi thêm tin nhắn.
        </p>
      ) : (
        <form
          onSubmit={(event) => void send(event)}
          className="space-y-3 border-2 border-heroDark-950 bg-rent-surface p-5 shadow-glass"
        >
          <label htmlFor="reply" className="text-sm font-bold">
            Tin nhắn mới
          </label>
          <textarea
            id="reply"
            required
            maxLength={4000}
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full border-2 border-heroDark-950 bg-white p-3 text-sm font-medium outline-none focus-visible:shadow-glass-sm"
            placeholder="Viết phản hồi…"
          />
          <Button type="submit" pending={pending} pendingLabel="Đang gửi…">
            Gửi tin nhắn
          </Button>
        </form>
      )}
      {!isLandlord && inquiry.status === "CLOSED" ? <TenantReviewPanel inquiryId={inquiry.id} /> : null}
    </section>
  );
}
