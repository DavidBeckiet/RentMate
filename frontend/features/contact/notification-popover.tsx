"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonClassName } from "../../components/ui/button-styles";
import { cx } from "../../components/ui/class-names";
import { Icon } from "../../components/ui/icon";
import { NotificationUnreadBadge, notificationAccessibleLabel } from "../../components/ui/notification-unread-badge";
import { api } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { Notification } from "../../types/api";
import { formatNotificationRelativeTime, presentNotification } from "./notification-presentation";
import {
  getNotificationSoundEnabled,
  setNotificationSoundEnabled,
  unlockNotificationSound
} from "./notification-sound";
import {
  decrementNotificationUnreadCount,
  incrementNotificationUnreadCount,
  refreshNotificationUnreadCount,
  setNotificationUnreadCount,
  useLatestNotification,
  useNotificationUnreadCount
} from "./notification-unread-store";

export function NotificationPopover({ pathname, compact = false }: Readonly<{ pathname: string; compact?: boolean }>) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const router = useRouter();
  const unreadCount = useNotificationUnreadCount(userId, pathname);
  const latestNotification = useLatestNotification(userId);
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<readonly Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const [relativeNow, setRelativeNow] = useState<number | null>(null);

  useEffect(() => {
    setSoundEnabled(getNotificationSoundEnabled());
  }, []);

  useEffect(() => {
    setItems([]);
    setLoadError(false);
    setActionError(null);
  }, [userId]);

  useEffect(() => {
    if (!latestNotification) return;
    setItems((current) => {
      const next = [latestNotification, ...current.filter((item) => item.id !== latestNotification.id)];
      return next.slice(0, 5);
    });
    setRelativeNow(Date.now());
  }, [latestNotification]);

  const fetchRecent = useCallback(() => {
    if (!userId) return;
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setLoading(true);
    setLoadError(false);
    setActionError(null);
    setRelativeNow(Date.now());
    void api.contact
      .listNotifications({ page: 1, pageSize: 5 }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      })
      .finally(() => {
        if (fetchControllerRef.current === controller) {
          fetchControllerRef.current = null;
          setLoading(false);
        }
      });
  }, [userId]);

  const toggleOpen = () => setIsOpen((previous) => !previous);

  useEffect(() => {
    if (!isOpen) return;
    fetchRecent();
  }, [fetchRecent, isOpen]);

  useEffect(() => {
    return () => fetchControllerRef.current?.abort();
  }, [userId]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Close popover on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const handleMarkAllRead = async () => {
    if (!userId) return;
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    setActionError(null);
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setNotificationUnreadCount(userId, 0);
    try {
      await api.contact.markAllNotificationsRead();
    } catch {
      setItems(previousItems);
      if (previousUnreadCount === null) {
        void refreshNotificationUnreadCount(userId);
      } else {
        setNotificationUnreadCount(userId, previousUnreadCount);
      }
      setActionError("Chưa thể cập nhật thông báo. Vui lòng thử lại.");
    }
  };

  const toggleSound = () => {
    const nextEnabled = !soundEnabled;
    setSoundEnabled(nextEnabled);
    setNotificationSoundEnabled(nextEnabled);
    if (nextEnabled) unlockNotificationSound();
  };

  const handleItemClick = (item: Notification, destination: string) => {
    if (!item.isRead && userId) {
      decrementNotificationUnreadCount(userId);
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
      void api.contact.markNotificationRead(item.id).catch(() => {
        incrementNotificationUnreadCount(userId);
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: false } : entry)));
        void refreshNotificationUnreadCount(userId);
      });
    }
    setIsOpen(false);
    router.push(destination);
  };

  return (
    <div className={cx("relative", compact && "flex justify-center")} ref={containerRef}>
      <Link
        href="/notifications"
        aria-label={notificationAccessibleLabel(unreadCount)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          toggleOpen();
        }}
        className={cx(
          buttonClassName("ghost", "sm"),
          "relative px-0 transition-colors",
          compact ? "h-12 w-12 rounded-2xl border-transparent bg-transparent" : "w-11",
          (isOpen || pathname === "/notifications") && "bg-primary-subtle text-primary-hover"
        )}
      >
        <Icon name="bell" />
        <NotificationUnreadBadge unreadCount={unreadCount} className="absolute -top-1 right-0" />
      </Link>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Thông báo gần đây"
          className={cx(
            "absolute z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay sm:w-96",
            compact ? "bottom-0 left-full ml-3" : "right-0 top-full mt-2"
          )}
          style={{ animation: "rm-fade-scale 180ms var(--rm-ease-out) both" }}
        >
          <header className="flex items-center justify-between border-b border-border bg-surface-subtle/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-display text-ui-sm font-bold text-foreground">Thông báo</span>
              {unreadCount && unreadCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.65rem] font-extrabold text-primary-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSound}
                aria-label={soundEnabled ? "Tắt âm thanh thông báo" : "Bật âm thanh thông báo"}
                title={soundEnabled ? "Tắt âm thanh thông báo" : "Bật âm thanh thông báo"}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/30"
              >
                <Icon name={soundEnabled ? "volume" : "volumeOff"} className="h-4 w-4" />
              </button>
              {unreadCount && unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  className="text-ui-xs font-bold text-primary transition-colors hover:text-primary-hover"
                >
                  Đã đọc tất cả
                </button>
              ) : null}
            </div>
          </header>

          {actionError ? (
            <p
              role="alert"
              className="border-b border-danger/20 bg-danger-subtle px-4 py-2 text-ui-xs font-semibold text-danger"
            >
              {actionError}
            </p>
          ) : null}

          <div className="max-h-[22rem] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex animate-pulse items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-surface-subtle" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-3/4 rounded bg-surface-subtle" />
                      <div className="h-3 w-1/2 rounded bg-surface-subtle" />
                    </div>
                  </div>
                ))}
              </div>
            ) : loadError && items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <p role="alert" className="text-ui-sm font-semibold text-foreground">
                  Không thể tải thông báo lúc này.
                </p>
                <button
                  type="button"
                  onClick={fetchRecent}
                  className="min-h-10 rounded-control px-3 py-2 text-ui-xs font-bold text-primary transition-colors hover:bg-primary-subtle hover:text-primary-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/30"
                >
                  Thử lại
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-subtle text-muted-foreground">
                  <Icon name="bell" className="h-5 w-5" />
                </span>
                <p className="mt-2 text-ui-sm font-semibold">Chưa có thông báo mới</p>
                <p className="text-ui-xs text-muted-foreground">Tin nhắn và cập nhật sẽ xuất hiện ở đây.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/70" aria-label="Danh sách thông báo gần đây">
                {items.map((item) => {
                  const presented = presentNotification(item);
                  const timeLabel = formatNotificationRelativeTime(
                    item.createdAt,
                    relativeNow === null ? undefined : new Date(relativeNow)
                  );

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(item, presented.destination)}
                        className={cx(
                          "flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:bg-primary-subtle/50",
                          !item.isRead && "bg-primary-subtle/25"
                        )}
                      >
                        <span
                          className={cx(
                            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-ui-sm",
                            item.isRead
                              ? "bg-surface-subtle text-muted-foreground"
                              : "bg-primary-subtle text-primary-hover font-bold"
                          )}
                          aria-hidden="true"
                        >
                          <Icon name={presented.icon} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cx(
                              "text-ui-xs line-clamp-1",
                              item.isRead ? "font-semibold text-foreground" : "font-bold text-foreground"
                            )}
                          >
                            {presented.title}
                          </p>
                          <p className="mt-0.5 text-ui-xs line-clamp-2 text-muted-foreground">
                            {presented.description}
                          </p>
                          <p className="mt-1 text-[0.6875rem] font-medium text-subtle-foreground">{timeLabel}</p>
                        </div>
                        {!item.isRead ? (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-border bg-surface-subtle/40 p-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-ui-xs font-bold text-primary transition-colors hover:bg-primary-subtle/60 hover:text-primary-hover"
            >
              Xem tất cả thông báo <Icon name="arrow" className="h-3.5 w-3.5" />
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
