"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { Notification } from "../../types/api";

function notificationLabel(notification: Notification): string {
  if (notification.eventType === "INQUIRY_CREATED") return "Bạn có yêu cầu liên hệ mới.";
  if (notification.eventType === "MESSAGE_CREATED") return "Cuộc trò chuyện có tin nhắn mới.";
  if (notification.eventType === "LEAD_REMINDER_DUE") return "Đã đến hạn chăm sóc lead.";
  if (notification.eventType === "LISTING_APPROVED") return "Tin đăng đã được duyệt.";
  if (notification.eventType === "LISTING_REJECTED") return "Tin đăng cần được chỉnh sửa.";
  if (notification.eventType === "LISTING_HIDDEN") return "Tin đăng đã bị ẩn khỏi kết quả tìm kiếm.";
  if (notification.eventType === "SAVED_SEARCH_MATCHED") return "Có tin đăng mới phù hợp với bộ lọc đã lưu.";
  return "Trạng thái yêu cầu đã được cập nhật.";
}

export function NotificationsPage() {
  const { status: authStatus } = useAuth();
  const [items, setItems] = useState<readonly Notification[]>([]);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [markAllPending, setMarkAllPending] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const controller = new AbortController();
    setState("loading");
    void api.contact
      .listNotifications({}, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) {
          setItems(page.data);
          setState("success");
          setActionError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [authStatus, retry]);

  const markRead = async (item: Notification) => {
    if (item.isRead) return;
    try {
      await api.contact.markNotificationRead(item.id);
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught : null);
    }
  };

  const markAllRead = async () => {
    if (markAllPending || !items.some((item) => !item.isRead)) return;
    setMarkAllPending(true);
    setActionError(null);
    try {
      await api.contact.markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    } catch {
      setActionError("Chưa thể đánh dấu tất cả thông báo đã đọc. Vui lòng thử lại.");
    } finally {
      setMarkAllPending(false);
    }
  };

  if (authStatus === "loading" || (authStatus === "authenticated" && state === "loading")) {
    return <LoadingState message="Đang tải thông báo…" />;
  }
  if (authStatus !== "authenticated")
    return (
      <EmptyState
        title="Đăng nhập để xem thông báo"
        action={
          <Link className="font-bold text-teal-800 underline" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  if (state === "error")
    return (
      <ErrorState
        message="Không thể tải thông báo."
        requestId={error?.requestId}
        action={<Button onClick={() => setRetry((value) => value + 1)}>Thử lại</Button>}
      />
    );

  return (
    <section className="rm-workspace my-4 space-y-8" aria-labelledby="notifications-heading">
      <header className="space-y-3 border-2 border-heroDark-950 bg-rent-accent p-6 shadow-glass sm:p-8">
        <span className="rm-eyebrow">CẬP NHẬT</span>
        <h1 id="notifications-heading" className="font-display text-4xl font-bold tracking-[-0.055em] sm:text-6xl">
          Thông báo
        </h1>
        <p className="text-sm font-medium text-slate-700">
          Theo dõi yêu cầu mới và phản hồi trong các cuộc trò chuyện.
        </p>
        {items.some((item) => !item.isRead) ? (
          <Button
            variant="secondary"
            pending={markAllPending}
            pendingLabel="Đang cập nhật…"
            onClick={() => void markAllRead()}
          >
            Đánh dấu tất cả đã đọc
          </Button>
        ) : null}
      </header>
      {actionError ? (
        <p role="alert" className="border-2 border-heroDark-950 bg-rent-coral p-3 text-sm font-bold">
          {actionError}
        </p>
      ) : null}
      {items.length === 0 ? (
        <EmptyState
          title="Chưa có thông báo mới"
          description="Các cập nhật liên quan đến yêu cầu sẽ xuất hiện ở đây."
        />
      ) : (
        <div className="space-y-3" aria-label="Danh sách thông báo">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.resourcePath}
              onClick={() => void markRead(item)}
              className={`block border-2 border-heroDark-950 p-4 shadow-glass-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:shadow-glass ${item.isRead ? "bg-rent-surface" : "bg-rent-yellow"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-bold">{notificationLabel(item)}</p>
                {!item.isRead ? (
                  <span className="border-2 border-heroDark-950 bg-rent-coral px-2 py-1 text-[10px] font-bold uppercase">
                    Mới
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs font-medium text-slate-600">
                {new Date(item.createdAt).toLocaleString("vi-VN")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
