import { cx } from "./class-names";

export function notificationAccessibleLabel(unreadCount: number | null): string {
  return unreadCount === null || unreadCount === 0 ? "Thông báo" : `Thông báo, ${unreadCount} chưa đọc`;
}

export function NotificationUnreadBadge({
  unreadCount,
  className
}: Readonly<{ unreadCount: number | null; className?: string }>) {
  if (unreadCount === null || unreadCount <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid min-h-5 min-w-5 place-items-center rounded-full border border-surface bg-coral px-1 text-[0.65rem] font-bold leading-none text-foreground",
        className
      )}
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}
