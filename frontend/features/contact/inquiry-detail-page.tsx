"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { Inquiry } from "../../types/api";

function parseId(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function statusLabel(status: Inquiry["status"]): string {
  return status === "NEW" ? "Mới" : status === "CONTACTED" ? "Đang trao đổi" : "Đã đóng";
}

export function InquiryDetailPage({ inquiryId }: Readonly<{ inquiryId: string }>) {
  const id = useMemo(() => parseId(inquiryId), [inquiryId]);
  const { status: authStatus, user } = useAuth();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">(id === null ? "error" : "loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [statusPending, setStatusPending] = useState(false);

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
      await api.contact.sendMessage(inquiry.id, message.trim());
      setMessage("");
      load();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught : null);
    } finally {
      setPending(false);
    }
  };

  const changeStatus = async (nextStatus: "CONTACTED" | "CLOSED") => {
    setStatusPending(true);
    try {
      setInquiry(await api.contact.updateInquiryStatus(inquiry.id, nextStatus));
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
      <div className="space-y-4" aria-label="Tin nhắn trong cuộc trò chuyện">
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
    </section>
  );
}
