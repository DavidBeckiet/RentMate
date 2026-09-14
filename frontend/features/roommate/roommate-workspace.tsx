"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Drawer } from "../../components/ui/drawer";
import { Icon, type IconName } from "../../components/ui/icon";
import styles from "./roommate-workspace.module.css";

interface WorkspaceItem {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
  readonly current: (pathname: string) => boolean;
}

const mainItems: readonly WorkspaceItem[] = [
  {
    key: "discover",
    href: "/roommates",
    label: "Khám phá",
    icon: "compass",
    current: (pathname) => pathname === "/roommates" || pathname.startsWith("/roommates/requests/")
  },
  {
    key: "request",
    href: "/roommates/my-request",
    label: "Yêu cầu của tôi",
    icon: "note",
    current: (pathname) => pathname === "/roommates/my-request"
  },
  {
    key: "interests",
    href: "/roommates/interests",
    label: "Lời quan tâm",
    icon: "heart",
    current: (pathname) => pathname === "/roommates/interests"
  },
  {
    key: "connections",
    href: "/roommates/connection",
    label: "Kết nối",
    icon: "users",
    current: (pathname) => pathname === "/roommates/connection"
  },
  {
    key: "messages",
    href: "/roommates/messages",
    label: "Tin nhắn",
    icon: "message",
    current: (pathname) => pathname === "/roommates/messages" || pathname.startsWith("/roommates/conversations/")
  }
];

const accountItems: readonly WorkspaceItem[] = [
  {
    key: "profile",
    href: "/roommates/profile",
    label: "Hồ sơ ở ghép",
    icon: "user",
    current: (pathname) => pathname === "/roommates/profile"
  },
  {
    key: "blocked",
    href: "/roommates/blocked",
    label: "Đã chặn",
    icon: "lock",
    current: (pathname) => pathname === "/roommates/blocked" || pathname === "/roommates/blocks"
  }
];

function WorkspaceLink({
  item,
  pathname,
  className,
  onNavigate
}: Readonly<{
  item: WorkspaceItem;
  pathname: string;
  className: string;
  onNavigate?: () => void;
}>) {
  const current = item.current(pathname);
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={`${className} ${current ? styles.active : ""}`}
      onClick={onNavigate}
    >
      <Icon name={item.icon} className="h-5 w-5 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

function isAccountPath(pathname: string): boolean {
  return accountItems.some((item) => item.current(pathname));
}

export function RoommateWorkspaceNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const moreActive = isAccountPath(pathname);

  useEffect(() => closeMore(), [closeMore, pathname]);

  return (
    <>
      <nav className={styles.desktopNav} aria-label="Điều hướng không gian ở ghép">
        <p className={styles.navLabel}>TÌM NGƯỜI Ở GHÉP</p>
        <div className={styles.navLinks}>
          {mainItems.map((item) => (
            <WorkspaceLink key={item.key} item={item} pathname={pathname} className={styles.desktopLink} />
          ))}
        </div>
        <div className={styles.accountGroup}>
          <p className={styles.navLabel}>TÀI KHOẢN & AN TOÀN</p>
          <div className={styles.navLinks}>
            {accountItems.map((item) => (
              <WorkspaceLink key={item.key} item={item} pathname={pathname} className={styles.desktopLink} />
            ))}
          </div>
        </div>
      </nav>

      <nav className={styles.mobileNav} aria-label="Điều hướng ở ghép trên di động">
        {mainItems
          .filter((item) => item.key !== "request")
          .map((item) => (
            <WorkspaceLink key={item.key} item={item} pathname={pathname} className={styles.mobileLink} />
          ))}
        <button
          ref={moreButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-controls="roommate-management-drawer"
          data-active={moreActive || undefined}
          className={`${styles.mobileLink} ${moreActive ? styles.active : ""}`}
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="menu" className="h-5 w-5 shrink-0" />
          <span>Thêm</span>
        </button>
        <Drawer
          open={moreOpen}
          title="Quản lý ở ghép"
          description="Hồ sơ và các lựa chọn an toàn của bạn."
          triggerRef={moreButtonRef}
          onClose={closeMore}
        >
          <nav id="roommate-management-drawer" aria-label="Hồ sơ và an toàn" className={styles.drawerLinks}>
            {accountItems.map((item) => (
              <WorkspaceLink
                key={item.key}
                item={item}
                pathname={pathname}
                className={styles.desktopLink}
                onNavigate={closeMore}
              />
            ))}
            <WorkspaceLink
              item={mainItems[1]!}
              pathname={pathname}
              className={styles.desktopLink}
              onNavigate={closeMore}
            />
          </nav>
        </Drawer>
      </nav>
    </>
  );
}

export function RoommateWorkspace({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.identityIcon} aria-hidden="true">
            <Icon name="users" className="h-5 w-5" />
          </span>
          <div>
            <p className={styles.eyebrow}>KHÔNG GIAN KẾT NỐI</p>
            <p className={styles.title}>Ở ghép</p>
          </div>
        </div>
        <p className={styles.description}>Tìm người phù hợp, kết nối và cùng nhau tìm một nơi ở tốt hơn.</p>
      </header>
      <div className={styles.columns}>
        <RoommateWorkspaceNav />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
