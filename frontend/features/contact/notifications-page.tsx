"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import workspace from "../auth/tenant-workspace.module.css";
import { Button } from "../../components/ui/button";
import { cx } from "../../components/ui/class-names";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, Notification } from "../../types/api";
import {
  decrementNotificationUnreadCount,
  incrementNotificationUnreadCount,
  refreshNotificationUnreadCount,
  setNotificationUnreadCount,
  useNotificationUnreadCount
} from "./notification-unread-store";
import {
  formatNotificationAbsoluteTime,
  formatNotificationRelativeTime,
  notificationDestination,
  presentNotification
} from "./notification-presentation";
import { NOTIFICATION_PAGE_SIZE, notificationPageUrl, parseNotificationPageQuery } from "./notification-query";

export function NotificationsPage() {
  const pathname = usePathname();
  const { push, replace } = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsedQuery = useMemo(() => parseNotificationPageQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const { status: authStatus, user } = useAuth();
  const userId = user?.id ?? null;
  const unreadCount = useNotificationUnreadCount(userId, `${pathname}?${rawQuery}`);
  const [items, setItems] = useState<readonly Notification[]>([]);
  const [pagination, setPagination] = useState<ApiPage<Notification>["pagination"] | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<number | null>(null);
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [markAllPending, setMarkAllPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const [relativeNow, setRelativeNow] = useState<number | null>(null);

  useEffect(() => {
    setRelativeNow(Date.now());
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated" || userId === null) return;
    if (!parsedQuery.valid) {
      replace(notificationPageUrl(1));
      return;
    }

    const controller = new AbortController();
    setItems([]);
    setPagination(null);
    setLoadedUserId(null);
    setLoadedPage(null);
    setState("loading");
    setError(null);
    setActionError(null);

    void api.contact
      .listNotifications({ page: parsedQuery.page, pageSize: NOTIFICATION_PAGE_SIZE }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        if (parsedQuery.page > 1 && page.data.length === 0) {
          replace(notificationPageUrl(parsedQuery.page - 1));
          return;
        }
        setItems(page.data);
        setPagination(page.pagination);
        setLoadedUserId(userId);
        setLoadedPage(parsedQuery.page);
        setState("success");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught : null);
        setState("error");
      });

    return () => controller.abort();
  }, [authStatus, parsedQuery.page, parsedQuery.valid, replace, retry, userId]);

  const markRead = (item: Notification) => {
    if (item.isRead || userId === null) return;

    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
    decrementNotificationUnreadCount(userId);

    void api.contact.markNotificationRead(item.id).catch(() => {
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: false } : entry)));
      incrementNotificationUnreadCount(userId);
      setActionError("Không thể cập nhật trạng thái thông báo. Vui lòng thử lại.");
      void refreshNotificationUnreadCount(userId);
    });
  };

  const markAllRead = async () => {
    if (markAllPending || userId === null) return;
    setMarkAllPending(true);
    setActionError(null);
    try {
      await api.contact.markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
      setNotificationUnreadCount(userId, 0);
    } catch {
      setActionError("Chưa thể đánh dấu tất cả thông báo đã đọc. Vui lòng thử lại.");
      void refreshNotificationUnreadCount(userId);
    } finally {
      setMarkAllPending(false);
    }
  };

  if (
    authStatus === "loading" ||
    (authStatus === "authenticated" &&
      (!parsedQuery.valid || state === "loading" || loadedUserId !== userId || loadedPage !== parsedQuery.page))
  ) {
    return <LoadingState message="Đang tải thông báo…" />;
  }
  if (authStatus !== "authenticated")
    return (
      <EmptyState
        title="Đăng nhập để xem thông báo"
        action={
          <Link className="font-bold text-primary-hover underline" href="/login">
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

  const hasUnread = unreadCount === null ? items.some((item) => !item.isRead) : unreadCount > 0;

  return (
    <section className={workspace.page} aria-labelledby="notifications-heading">
      <header className={workspace.header}>
        <div className="min-w-0 flex-1">
          <span className="rm-workspace-eyebrow inline-flex items-center gap-2">
            <Icon name="bell" className="h-4 w-4" /> Cập nhật RentMate
          </span>
          <h1 id="notifications-heading">Thông báo</h1>
          <p>Theo dõi các cập nhật quan trọng của bạn.</p>
        </div>
        {hasUnread ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            pending={markAllPending}
            pendingLabel="Đang cập nhật…"
            onClick={() => void markAllRead()}
          >
            <Icon name="check" className="h-4 w-4" />
            Đánh dấu tất cả đã đọc
          </Button>
        ) : null}
      </header>

      {actionError ? (
        <p
          role="alert"
          className="rm-workspace-card border-danger/30 bg-danger-subtle p-4 text-sm font-semibold text-danger"
        >
          {actionError}
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          className="rm-workspace-card border-border bg-surface shadow-surface"
          visual={<Icon name="bell" className="h-8 w-8" />}
          title="Chưa có thông báo mới"
          description="Các cập nhật về tin nhắn, tìm kiếm đã lưu và ở ghép sẽ xuất hiện tại đây."
        />
      ) : (
        <ul className={workspace.list} aria-label="Danh sách thông báo">
          {items.map((item) => {
            const presentation = presentNotification(item);
            const absoluteTime = formatNotificationAbsoluteTime(item.createdAt);
            const displayTime =
              relativeNow === null
                ? absoluteTime
                : formatNotificationRelativeTime(item.createdAt, new Date(relativeNow));
            return (
              <li key={item.id}>
                <Link
                  href={notificationDestination(item)}
                  onClick={() => markRead(item)}
                  aria-label={`${presentation.title}. ${item.isRead ? "Đã đọc" : "Chưa đọc"}. ${presentation.category}`}
                  className={cx(workspace.notification, item.isRead ? "bg-surface" : "bg-primary-subtle/45")}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-control",
                      item.isRead ? "bg-surface-subtle text-muted-foreground" : "bg-primary text-primary-foreground"
                    )}
                  >
                    <Icon name={presentation.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <span className={cx("min-w-0 break-words text-sm", item.isRead ? "font-semibold" : "font-bold")}>
                        {presentation.title}
                      </span>
                      <span
                        className={cx(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                          item.isRead ? "text-muted-foreground" : "bg-primary-subtle text-primary-hover"
                        )}
                      >
                        {item.isRead ? "Đã đọc" : "Chưa đọc"}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                      {presentation.description}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
                      <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-foreground">
                        {presentation.category}
                      </span>
                      <time dateTime={item.createdAt} title={absoluteTime}>
                        {displayTime}
                      </time>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pagination && (pagination.page > 1 || pagination.hasNextPage) ? (
        <Pagination
          ariaLabel="Phân trang thông báo"
          compact
          page={pagination.page}
          hasNextPage={pagination.hasNextPage}
          onPrevious={() => push(notificationPageUrl(pagination.page - 1))}
          onNext={() => push(notificationPageUrl(pagination.page + 1))}
        />
      ) : null}
    </section>
  );
}
