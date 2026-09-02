"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { api, ApiError } from "../../lib/api/client";
import { connectInquiryRealtime, type InquiryRealtimeConnectionStatus } from "../../lib/api/inquiry-realtime";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ContactReportCategory, Inquiry } from "../../types/api";
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

const contactReportCategories: readonly { readonly value: ContactReportCategory; readonly label: string }[] = [
  { value: "SPAM", label: "Spam hoặc quảng cáo" },
  { value: "FRAUD", label: "Nghi ngờ lừa đảo" },
  { value: "HARASSMENT", label: "Quấy rối" },
  { value: "INAPPROPRIATE", label: "Nội dung không phù hợp" },
  { value: "OTHER", label: "Lý do khác" }
];

export function InquiryDetailPage({ inquiryId }: Readonly<{ inquiryId: string }>) {
  const id = useMemo(() => parseId(inquiryId), [inquiryId]);
  const { status: authStatus, user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">(id === null ? "error" : "loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const [safetyPending, setSafetyPending] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [safetyMenuOpen, setSafetyMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<ContactReportCategory>("SPAM");
  const [reportDetails, setReportDetails] = useState("");
  const [reportMessageId, setReportMessageId] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<InquiryRealtimeConnectionStatus>("connecting");

  useEffect(() => setMounted(true), []);

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

  if (!mounted || authStatus === "loading" || state === "loading") {
    return <LoadingState message="Đang mở cuộc trò chuyện…" />;
  }
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

  const updateBlockState = (nextState: {
    readonly canSendMessage: boolean;
    readonly blockedByCurrentUser: boolean;
  }) => {
    setInquiry((current) => (current === null ? current : { ...current, ...nextState }));
  };

  const toggleBlock = async () => {
    if (!inquiry || safetyPending) return;
    if (!inquiry.blockedByCurrentUser && !window.confirm("Chặn liên hệ này? Hai bên sẽ không thể gửi tin nhắn mới."))
      return;
    setSafetyPending(true);
    setSafetyError(null);
    try {
      const nextState = inquiry.blockedByCurrentUser
        ? await api.contact.unblockInquiry(inquiry.id)
        : await api.contact.blockInquiry(inquiry.id);
      updateBlockState(nextState);
      setSafetyMenuOpen(false);
    } catch (caught: unknown) {
      setSafetyError(
        caught instanceof ApiError ? "Chưa thể cập nhật trạng thái chặn. Vui lòng thử lại." : "Đã có lỗi xảy ra."
      );
    } finally {
      setSafetyPending(false);
    }
  };

  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inquiry || safetyPending) return;
    setSafetyPending(true);
    setSafetyError(null);
    try {
      await api.contact.createContactReport(inquiry.id, {
        category: reportCategory,
        details: reportDetails.trim() || null,
        messageId: reportMessageId ? Number(reportMessageId) : null
      });
      setReportSubmitted(true);
      setReportOpen(false);
      setSafetyMenuOpen(false);
      setReportDetails("");
      setReportMessageId("");
    } catch (caught: unknown) {
      setSafetyError(
        caught instanceof ApiError && caught.status === 409
          ? "Bạn đã có một báo cáo đang được xử lý cho cuộc trò chuyện này."
          : "Chưa thể gửi báo cáo. Vui lòng thử lại."
      );
    } finally {
      setSafetyPending(false);
    }
  };

  const isLandlord = user.role === "LANDLORD";
  return (
    <section className="rm-workspace rm-workspace-page space-y-8 my-4" aria-labelledby="inquiry-detail-heading">
      <Link
        href={isLandlord ? "/landlord/inquiries" : "/inquiries"}
        className="inline-flex min-h-11 items-center font-bold text-primary-hover underline decoration-2 underline-offset-4"
      >
        ← Quay lại danh sách yêu cầu
      </Link>
      <header className="rm-workspace-hero" data-tone={inquiry.status === "CLOSED" ? "info" : "accent"}>
        <div>
          <span className="rm-workspace-eyebrow">Cuộc trò chuyện</span>
          <h1 id="inquiry-detail-heading" className="rm-workspace-title mt-3">
            Tin đăng #{inquiry.listingId}
          </h1>
          <p className="mt-3 text-sm font-semibold text-muted-foreground">Trạng thái: {statusLabel(inquiry.status)}</p>
          <p
            role="status"
            aria-live="polite"
            className="mt-3 inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-extrabold"
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
      <div className="flex flex-col items-end gap-3">
        <div className="relative">
          <Button
            variant="secondary"
            aria-expanded={safetyMenuOpen}
            aria-haspopup="menu"
            onClick={() => setSafetyMenuOpen((open) => !open)}
          >
            Thao tác khác
          </Button>
          {safetyMenuOpen ? (
            <div
              className="absolute right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-2 shadow-overlay"
              role="menu"
            >
              <Button
                variant="secondary"
                className="w-full justify-start text-left"
                pending={safetyPending}
                onClick={() => void toggleBlock()}
              >
                {inquiry.blockedByCurrentUser ? "Bỏ chặn liên hệ" : "Chặn liên hệ"}
              </Button>
              <Button
                variant="secondary"
                className="mt-2 w-full justify-start text-left"
                disabled={safetyPending}
                onClick={() => {
                  setReportOpen(true);
                  setSafetyMenuOpen(false);
                  setReportSubmitted(false);
                }}
              >
                Báo cáo cuộc trò chuyện
              </Button>
            </div>
          ) : null}
        </div>
        {reportSubmitted ? (
          <p
            role="status"
            className="rm-workspace-card w-full border-l-4 border-success bg-success-subtle p-3 text-sm font-semibold text-success-foreground"
          >
            Đã gửi báo cáo. RentMate sẽ xem xét thông tin này.
          </p>
        ) : null}
        {safetyError ? (
          <p
            role="alert"
            className="rm-workspace-card w-full border-l-4 border-danger bg-danger-subtle p-3 text-sm font-semibold text-danger"
          >
            {safetyError}
          </p>
        ) : null}
      </div>
      {reportOpen ? (
        <form
          onSubmit={(event) => void submitReport(event)}
          className="rm-workspace-card space-y-4 p-5 sm:p-6"
          aria-label="Báo cáo cuộc trò chuyện"
        >
          <div>
            <h2 className="font-display text-xl font-bold">Báo cáo cuộc trò chuyện</h2>
            <p className="mt-1 text-sm text-rent-secondary">
              Chỉ gửi báo cáo khi bạn phát hiện spam, lừa đảo hoặc hành vi không phù hợp.
            </p>
          </div>
          <label className="block text-sm font-bold" htmlFor="contact-report-category">
            Lý do
            <select
              id="contact-report-category"
              value={reportCategory}
              onChange={(event) => setReportCategory(event.target.value as ContactReportCategory)}
              className="mt-2 block min-h-12 w-full rounded-control border border-border-strong bg-surface px-4"
            >
              {contactReportCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold" htmlFor="contact-report-message">
            Tin nhắn liên quan (không bắt buộc)
            <select
              id="contact-report-message"
              value={reportMessageId}
              onChange={(event) => setReportMessageId(event.target.value)}
              className="mt-2 block min-h-12 w-full rounded-control border border-border-strong bg-surface px-4"
            >
              <option value="">Toàn bộ cuộc trò chuyện</option>
              {inquiry.messages.map((item) => (
                <option key={item.id} value={item.id}>
                  Tin #{item.id} · {item.senderRole === "TENANT" ? "Người thuê" : "Chủ trọ"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold" htmlFor="contact-report-details">
            Chi tiết (không bắt buộc)
            <textarea
              id="contact-report-details"
              value={reportDetails}
              onChange={(event) => setReportDetails(event.target.value)}
              maxLength={2000}
              rows={4}
              className="mt-2 block min-h-28 w-full resize-y rounded-control border border-border-strong bg-surface p-3 font-medium outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" pending={safetyPending} pendingLabel="Đang gửi…">
              Gửi báo cáo
            </Button>
            <Button variant="secondary" type="button" disabled={safetyPending} onClick={() => setReportOpen(false)}>
              Hủy
            </Button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rm-workspace-card border-l-4 border-danger bg-danger-subtle p-4 text-sm font-semibold text-danger"
        >
          Không thể cập nhật cuộc trò chuyện. Vui lòng thử lại.
        </p>
      ) : null}
      <div
        className="rm-inquiry-thread space-y-4"
        aria-label="Tin nhắn trong cuộc trò chuyện"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {inquiry.messages.map((item) => (
          <article
            key={item.id}
            className={`rm-inquiry-message max-w-2xl rounded-card border border-border p-4 shadow-surface ${item.senderRole === user.role ? "ml-auto bg-primary-subtle" : "bg-surface"}`}
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
        <p className="rm-workspace-card border-l-4 border-muted-foreground bg-surface-subtle p-4 text-sm font-semibold text-muted-foreground">
          Yêu cầu đã đóng, không thể gửi thêm tin nhắn.
        </p>
      ) : !inquiry.canSendMessage ? (
        <p className="rm-workspace-card border-l-4 border-muted-foreground bg-surface-subtle p-4 text-sm font-semibold text-muted-foreground">
          Cuộc trò chuyện đang bị giới hạn, không thể gửi tin nhắn mới.
        </p>
      ) : (
        <form onSubmit={(event) => void send(event)} className="rm-workspace-card space-y-3 p-5 sm:p-6">
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
            className="min-h-28 w-full resize-y rounded-control border border-border-strong bg-surface p-3 text-sm font-medium outline-none transition focus:border-primary focus:ring-[3px] focus:ring-primary/20"
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
