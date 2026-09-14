"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useComparisonSelection } from "../../features/comparison/comparison-store";
import { NotificationPopover } from "../../features/contact/notification-popover";
import { FloatingRoommateChat } from "../../features/roommate/floating-roommate-chat";
import { useNotificationRealtime, useNotificationUnreadCount } from "../../features/contact/notification-unread-store";
import { useNotificationSound } from "../../features/contact/notification-sound";
import { useAuth } from "../../lib/auth/auth-provider";
import type { UserProfile } from "../../types/api";
import { accountInitials, accountPrimaryIdentity, accountRoleLabels } from "./account-identity";
import { AccountMenu } from "./account-menu";
import { Button } from "./button";
import { buttonClassName } from "./button-styles";
import { cx } from "./class-names";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import {
  adminNavigationItems,
  consumerNavigationItems,
  isNavigationItemActive,
  landlordNavigationItems,
  navigationActor,
  resolveShellKind,
  tenantSecondaryItems,
  type NavigationActor,
  type NavigationItem,
  type WorkspaceActor
} from "./navigation-model";
import { NavigationOverlay } from "./navigation-overlay";
import { NotificationUnreadBadge, notificationAccessibleLabel } from "./notification-unread-badge";
import { PageTransition } from "./page-transition";
import { RentMateMark } from "./rentmate-mark";
import { Skeleton } from "./skeleton";

const desktopNavLink =
  "relative inline-flex min-h-11 items-center gap-2 rounded-control border border-transparent px-3.5 font-sans text-ui-sm font-semibold text-foreground transition-[background-color,border-color,color,transform] duration-fast ease-standard hover:-translate-y-0.5 hover:bg-surface-subtle hover:text-primary-hover aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary-hover";

const authHeaderMotion =
  "transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transform-none";

const drawerNavLink =
  "flex min-h-12 items-center gap-3 rounded-control border border-transparent px-3 py-2.5 font-sans text-ui-sm font-semibold text-foreground transition-[background-color,border-color,color] duration-fast hover:bg-surface-subtle hover:text-primary-hover aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary-hover";

const workspaceNavLink =
  "group relative flex min-h-12 items-center gap-3 rounded-control border border-transparent px-3 py-2.5 font-sans text-ui-sm font-semibold text-white/80 transition-[background-color,border-color,color] duration-fast hover:bg-white/10 hover:text-white aria-[current=page]:bg-accent aria-[current=page]:text-foreground";

function Brand({ compact = false, inverse = false }: Readonly<{ compact?: boolean; inverse?: boolean }>) {
  return (
    <Link
      href="/"
      aria-label="RentMate — về trang chủ"
      className={cx("inline-flex min-h-11 shrink-0 items-center gap-2", inverse ? "text-white" : "text-foreground")}
    >
      <span
        className={cx(
          "grid place-items-center rounded-control border border-primary-hover/25 bg-accent text-primary-hover shadow-surface",
          inverse && "border-white/25 shadow-none",
          compact ? "h-9 w-9" : "h-10 w-10"
        )}
      >
        <RentMateMark className={compact ? "h-7 w-7" : "h-8 w-8"} />
      </span>
      <span className={cx("font-display font-bold tracking-[-0.05em]", compact ? "text-lg" : "text-xl")}>
        RENT<span className={inverse ? "text-accent" : "text-primary"}>MATE</span>
      </span>
    </Link>
  );
}

function NavigationLinks({
  items,
  pathname,
  className,
  linkClassName,
  comparisonCount = 0,
  onNavigate
}: Readonly<{
  items: readonly NavigationItem[];
  pathname: string;
  className?: string;
  linkClassName: string;
  comparisonCount?: number;
  onNavigate?: () => void;
}>) {
  return (
    <div className={className}>
      {items.map((item) => {
        const current = isNavigationItemActive(item, pathname) ? "page" : undefined;
        return (
          <Link key={item.key} href={item.href} aria-current={current} className={linkClassName} onClick={onNavigate}>
            <Icon name={item.icon} className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">{item.label}</span>
            {item.key === "compare" && comparisonCount > 0 ? (
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1 text-ui-xs font-bold text-primary-foreground">
                {comparisonCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

function AccountSummary({ user, inverse = false }: Readonly<{ user: UserProfile; inverse?: boolean }>) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={cx(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-subtle font-display text-sm font-bold text-primary-hover",
          inverse && "bg-accent text-primary-hover"
        )}
      >
        {accountInitials(user)}
      </span>
      <span className="min-w-0">
        <span className={cx("block truncate text-ui-sm font-semibold", inverse ? "text-white" : "text-foreground")}>
          {accountPrimaryIdentity(user)}
        </span>
        {user.displayName ? (
          <span className={cx("block truncate text-ui-xs", inverse ? "text-white/70" : "text-muted-foreground")}>
            {user.email}
          </span>
        ) : null}
        <span className={cx("block text-ui-xs", inverse ? "text-white/70" : "text-muted-foreground")}>
          {accountRoleLabels[user.role]}
        </span>
      </span>
    </div>
  );
}

function NotificationLink({ pathname }: Readonly<{ pathname: string }>) {
  return <NotificationPopover pathname={pathname} />;
}

function MobileNotificationLink({ userId, onNavigate }: Readonly<{ userId: number; onNavigate: () => void }>) {
  const unreadCount = useNotificationUnreadCount(userId);
  return (
    <Link
      href="/notifications"
      aria-label={notificationAccessibleLabel(unreadCount)}
      className={drawerNavLink}
      onClick={onNavigate}
    >
      <Icon name="bell" />
      <span className="min-w-0 flex-1">Thông báo</span>
      <NotificationUnreadBadge unreadCount={unreadCount} className="ml-auto" />
    </Link>
  );
}

function AuthFeedback({
  status,
  logoutFailed,
  onRefresh
}: Readonly<{
  status: "loading" | "anonymous" | "authenticated" | "error";
  logoutFailed: boolean;
  onRefresh: () => void;
}>) {
  if (status === "error") {
    return (
      <div role="alert" className="border-b border-warning/25 bg-warning-subtle">
        <div className="rm-page-container flex min-h-12 flex-wrap items-center justify-between gap-3 py-2 text-ui-sm text-warning-foreground">
          <span className="font-semibold">Không thể kiểm tra tài khoản.</span>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  if (logoutFailed) {
    return (
      <div
        role="alert"
        className="border-b border-danger/20 bg-danger-subtle px-4 py-2 text-center text-ui-sm font-semibold text-danger"
      >
        Đăng xuất chưa thành công. Vui lòng thử lại.
      </div>
    );
  }

  return null;
}

interface SharedShellProps {
  readonly children: ReactNode;
  readonly pathname: string;
  readonly actor: NavigationActor;
  readonly authStatus: "loading" | "anonymous" | "authenticated" | "error";
  readonly user: UserProfile | null;
  readonly authError: boolean;
  readonly logoutPending: boolean;
  readonly onLogout: () => void;
  readonly onRefresh: () => void;
}

const tenantMobileNavigationItems: readonly NavigationItem[] = [
  { key: "home", label: "Trang chủ", href: "/", icon: "home", exactPaths: ["/"] },
  {
    key: "search",
    label: "Tìm phòng",
    href: "/search",
    icon: "search",
    exactPaths: ["/search"],
    pathPrefixes: ["/listings/"]
  },
  {
    key: "near-me",
    label: "Gần tôi",
    href: "/near-me",
    icon: "compass",
    exactPaths: ["/near-me"]
  },
  {
    key: "roommates",
    label: "Ở ghép",
    href: "/roommates",
    icon: "users",
    exactPaths: ["/roommates"],
    pathPrefixes: ["/roommates/"]
  },
  {
    key: "inquiries",
    label: "Tin nhắn",
    href: "/inquiries",
    icon: "message",
    exactPaths: ["/inquiries"],
    pathPrefixes: ["/inquiries/"]
  }
];

function TenantMobileNav({ pathname }: Readonly<{ pathname: string }>) {
  return (
    <nav
      aria-label="Điều hướng nhanh trên di động"
      className="rm-mobile-nav fixed inset-x-0 bottom-0 z-sticky border-t border-border/80 bg-surface/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] shadow-raised backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between gap-1">
        {tenantMobileNavigationItems.map((item) => {
          const current = isNavigationItemActive(item, pathname) ? "page" : undefined;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-label={`${item.label} trên di động`}
              aria-current={current}
              className="flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[11px] font-semibold leading-4 text-muted-foreground transition-all duration-fast hover:bg-surface-subtle hover:text-primary-hover active:scale-95 motion-reduce:transition-none aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary-hover"
            >
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ConsumerShell({
  children,
  pathname,
  actor,
  authStatus,
  user,
  authError,
  logoutPending,
  onLogout,
  onRefresh
}: SharedShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const comparison = useComparisonSelection();
  const primaryItems = consumerNavigationItems(actor);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => closeMenu(), [closeMenu, pathname]);

  const fullBleed = pathname === "/" || pathname === "/search" || pathname === "/near-me";
  const listingDetail = /^\/listings\/[^/]+$/.test(pathname);
  const showTenantMobileNav =
    actor === "tenant" && !pathname.startsWith("/inquiries/") && !pathname.startsWith("/roommates/conversations/");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SkipLink />
      <header className="sticky top-0 z-header border-b border-border bg-surface">
        <div className="rm-page-container flex min-h-16 items-center gap-3">
          <Brand compact />

          <nav aria-label="Điều hướng marketplace" className="ml-auto hidden items-center gap-1 lg:flex">
            <NavigationLinks items={primaryItems} pathname={pathname} linkClassName={desktopNavLink} />
          </nav>

          <div className="ml-auto hidden items-center gap-2 lg:flex">
            {authStatus === "loading" ? (
              <div aria-label="Đang kiểm tra tài khoản" className="flex items-center gap-2 px-2">
                <Skeleton rounded="full" className="h-9 w-9" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : null}
            {actor === "anonymous" || actor === "error" ? (
              <>
                <Link href="/login" className={buttonClassName("ghost", "sm")}>
                  Đăng nhập
                </Link>
                <Link href="/register" className={buttonClassName("primary", "sm")}>
                  Đăng ký
                </Link>
              </>
            ) : null}
            {user ? <NotificationLink pathname={pathname} /> : null}
            {user ? <AccountMenu user={user} logoutPending={logoutPending} onLogout={onLogout} /> : null}
          </div>

          <IconButton
            ref={triggerRef}
            label="Mở menu điều hướng"
            variant="ghost"
            className="ml-auto lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="consumer-mobile-navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </IconButton>
        </div>
      </header>

      <AuthFeedback status={authStatus} logoutFailed={authError} onRefresh={onRefresh} />

      <main
        id="main-content"
        className={cx(
          fullBleed
            ? "min-w-0 flex-1"
            : cx("rm-page-container min-w-0 flex-1", listingDetail ? "py-4 sm:py-6" : "py-8 sm:py-12"),
          showTenantMobileNav && (fullBleed ? "pb-24 lg:pb-0" : "pb-24 sm:pb-24 lg:pb-12")
        )}
      >
        <PageTransition>{children}</PageTransition>
      </main>

      <PublicFooter actor={actor} />
      {showTenantMobileNav ? <TenantMobileNav pathname={pathname} /> : null}

      <NavigationOverlay open={menuOpen} title="Điều hướng RentMate" triggerRef={triggerRef} onClose={closeMenu}>
        <nav id="consumer-mobile-navigation" aria-label="Điều hướng marketplace trên di động" className="mt-4">
          <NavigationLinks
            items={primaryItems}
            pathname={pathname}
            linkClassName={drawerNavLink}
            comparisonCount={comparison.count}
            onNavigate={closeMenu}
          />
          {actor === "tenant" ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="px-3 text-ui-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Tiện ích</p>
              <NavigationLinks
                items={tenantSecondaryItems}
                pathname={pathname}
                linkClassName={drawerNavLink}
                comparisonCount={comparison.count}
                onNavigate={closeMenu}
              />
            </div>
          ) : null}
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          {user ? (
            <div className="space-y-3">
              <AccountSummary user={user} />
              <MobileNotificationLink userId={user.id} onNavigate={closeMenu} />
              {user.role === "TENANT" ? (
                <Link href="/profile" className={drawerNavLink} onClick={closeMenu}>
                  <Icon name="user" />
                  Hồ sơ của tôi
                </Link>
              ) : null}
              {user.role === "LANDLORD" ? (
                <Link href="/landlord/profile" className={drawerNavLink} onClick={closeMenu}>
                  <Icon name="user" />
                  Hồ sơ
                </Link>
              ) : null}
              <Button
                variant="outline"
                className="w-full"
                pending={logoutPending}
                pendingLabel="Đang đăng xuất…"
                onClick={onLogout}
              >
                <Icon name="logout" />
                Đăng xuất
              </Button>
            </div>
          ) : authStatus === "loading" ? (
            <div aria-label="Đang kiểm tra tài khoản" className="space-y-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : (
            <div className="grid gap-2">
              <Link href="/login" className={buttonClassName("outline", "md")} onClick={closeMenu}>
                Đăng nhập
              </Link>
              <Link href="/register" className={buttonClassName("primary", "md")} onClick={closeMenu}>
                Đăng ký
              </Link>
            </div>
          )}
        </div>
      </NavigationOverlay>
    </div>
  );
}

function WorkspaceShell({
  children,
  pathname,
  actor,
  authStatus,
  user,
  authError,
  logoutPending,
  onLogout,
  onRefresh
}: SharedShellProps & Readonly<{ actor: WorkspaceActor }>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const ready = authStatus === "authenticated" && user?.role.toLowerCase() === actor;
  const items = actor === "landlord" ? landlordNavigationItems : adminNavigationItems;
  const title = actor === "landlord" ? "Không gian cho thuê" : "Khu vực quản trị";
  const navLabel = actor === "landlord" ? "Điều hướng không gian cho thuê" : "Điều hướng khu vực quản trị";
  const landlordShell = actor === "landlord";
  const adminShell = actor === "admin";

  useEffect(() => closeMenu(), [closeMenu, pathname]);

  const navigation = ready ? (
    <NavigationLinks
      items={items}
      pathname={pathname}
      className={cx(
        "rm-workspace-nav",
        landlordShell && "rm-landlord-sidebar-nav",
        adminShell && "rm-admin-sidebar-nav"
      )}
      linkClassName={workspaceNavLink}
      onNavigate={closeMenu}
    />
  ) : (
    <div aria-label="Đang kiểm tra quyền truy cập" className="space-y-3 px-2 py-3">
      {[0, 1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className="h-11 w-full" />
      ))}
    </div>
  );

  return (
    <div
      className={cx(
        "min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]",
        landlordShell && "rm-landlord-shell",
        adminShell && "rm-admin-shell"
      )}
    >
      <SkipLink />
      <aside
        className={cx(
          "sticky top-0 hidden h-[100dvh] flex-col border-r border-primary/30 bg-brand-dark p-4 lg:flex",
          landlordShell && "rm-landlord-sidebar",
          adminShell && "rm-admin-sidebar"
        )}
      >
        <Brand inverse />
        <div className="mt-7 px-2">
          <p
            className={cx(
              "text-ui-xs font-bold uppercase tracking-[0.14em] text-white/60",
              landlordShell && "rm-workspace-side-label"
            )}
          >
            Workspace
          </p>
          <p
            className={cx(
              "mt-1 font-display text-heading-sm font-semibold text-white",
              landlordShell && "rm-workspace-side-title"
            )}
          >
            {title}
          </p>
        </div>
        <nav aria-label={navLabel} className="mt-5 flex-1 overflow-y-auto">
          {navigation}
        </nav>
        <div className="border-t border-white/15 pt-4">
          {user ? <AccountSummary user={user} inverse /> : <Skeleton className="h-11 w-full" />}
          {user ? (
            <Button variant="ghost" size="sm" className="mt-3 w-full" pending={logoutPending} onClick={onLogout}>
              <Icon name="logout" />
              Đăng xuất
            </Button>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0">
        <header
          className={cx(
            "sticky top-0 z-header border-b border-border bg-surface",
            landlordShell && "rm-workspace-topbar",
            adminShell && "rm-admin-topbar"
          )}
        >
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:min-h-[4.5rem] lg:px-8">
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <div className="hidden min-w-0 lg:block">
              <p className="text-ui-xs font-semibold text-muted-foreground">RentMate Workspace</p>
              <p className="truncate font-display text-ui-base font-semibold text-foreground">{title}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/" className={buttonClassName("ghost", "sm")}>
                Trang chủ
              </Link>
              {ready ? <NotificationLink pathname={pathname} /> : null}
              {ready && user ? (
                <div className="hidden lg:block">
                  <AccountMenu user={user} logoutPending={logoutPending} onLogout={onLogout} />
                </div>
              ) : null}
              <IconButton
                ref={triggerRef}
                label={ready ? `Mở ${navLabel.toLowerCase()}` : "Đang kiểm tra quyền truy cập"}
                variant="ghost"
                className="lg:hidden"
                disabled={!ready}
                aria-expanded={menuOpen}
                aria-controls="workspace-mobile-navigation"
                onClick={() => setMenuOpen(true)}
              >
                <Icon name="menu" />
              </IconButton>
            </div>
          </div>
        </header>

        <AuthFeedback status={authStatus} logoutFailed={authError} onRefresh={onRefresh} />

        <main
          id="main-content"
          className={cx(
            "mx-auto min-w-0 max-w-[90rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
            landlordShell && "rm-workspace-main",
            adminShell && "rm-admin-main"
          )}
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <NavigationOverlay
        open={menuOpen}
        title={title}
        triggerRef={triggerRef}
        onClose={closeMenu}
        className={cx(landlordShell && "rm-landlord-drawer", adminShell && "rm-admin-drawer")}
      >
        <nav id="workspace-mobile-navigation" aria-label={`${navLabel} trên di động`} className="mt-4">
          {navigation}
        </nav>
        {user ? (
          <div className="mt-auto space-y-3 border-t border-border pt-4">
            <AccountSummary user={user} />
            {user.role === "LANDLORD" ? (
              <Link href="/landlord/profile" className={drawerNavLink} onClick={closeMenu}>
                <Icon name="user" />
                Hồ sơ
              </Link>
            ) : null}
            <Button variant="outline" className="w-full" pending={logoutPending} onClick={onLogout}>
              <Icon name="logout" />
              Đăng xuất
            </Button>
          </div>
        ) : null}
      </NavigationOverlay>
    </div>
  );
}

function AuthShell({
  children,
  pathname,
  authStatus,
  authError,
  onRefresh
}: Pick<SharedShellProps, "children" | "pathname" | "authStatus" | "authError" | "onRefresh">) {
  const isRegistrationRoute = pathname === "/register" || pathname.startsWith("/register/");
  const isAdminLogin = pathname === "/admin/login";
  const authAction = isAdminLogin
    ? { href: "/", label: "Trang chủ" }
    : isRegistrationRoute
      ? { href: "/login", label: "Đăng nhập" }
      : pathname === "/login"
        ? { href: "/register", label: "Tạo tài khoản" }
        : { href: "/login", label: "Đăng nhập" };

  return (
    <div className="flex min-h-screen flex-col bg-[#eef3ef] text-foreground">
      <SkipLink />
      <header className="border-b border-border bg-surface">
        <div className="rm-page-container flex min-h-16 items-center justify-between gap-3">
          <Brand compact />
          <Link href={authAction.href} className={buttonClassName("outline", "sm", authHeaderMotion)}>
            {authAction.label}
          </Link>
        </div>
      </header>
      <AuthFeedback status={authStatus} logoutFailed={authError} onRefresh={onRefresh} />
      <main
        id="main-content"
        className="relative flex flex-1 items-start overflow-visible px-4 py-6 sm:px-8 lg:px-10 lg:py-8"
      >
        <PageTransition className="w-full">{children}</PageTransition>
      </main>
    </div>
  );
}

function RestrictedShell({ children, user }: Readonly<{ children: ReactNode; user: UserProfile | null }>) {
  const destination = user?.role === "LANDLORD" ? "/landlord" : user?.role === "ADMIN" ? "/admin" : "/search";
  const label =
    user?.role === "LANDLORD"
      ? "Về không gian cho thuê"
      : user?.role === "ADMIN"
        ? "Về khu vực quản trị"
        : "Về marketplace";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SkipLink />
      <header className="border-b border-border bg-surface">
        <div className="rm-page-container flex min-h-16 items-center justify-between gap-3">
          <Brand compact />
          <Link href={destination} className={buttonClassName("outline", "sm")}>
            {label}
          </Link>
        </div>
      </header>
      <main id="main-content" className="rm-page-container flex-1 py-8 sm:py-12">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}

function PublicFooter({ actor }: Readonly<{ actor: NavigationActor }>) {
  const authenticatedAccountLink =
    actor === "tenant"
      ? { href: "/saved-searches", label: "Bộ lọc đã lưu" }
      : actor === "landlord"
        ? { href: "/landlord", label: "Không gian cho thuê" }
        : actor === "admin"
          ? { href: "/admin", label: "Khu vực quản trị" }
          : null;

  return (
    <footer className="mt-16 border-t border-primary/30 bg-brand-dark text-white">
      <div className="rm-page-container grid gap-8 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-md">
          <Brand compact inverse />
          <p className="mt-4 text-ui-sm leading-6 text-white/75">
            Marketplace tìm phòng minh bạch, tập trung vào vị trí và nhu cầu sống thực tế tại Việt Nam.
          </p>
        </div>
        <nav aria-label="Khám phá RentMate" className="flex flex-col items-start gap-2 text-ui-sm">
          <p className="mb-1 font-semibold text-accent">Khám phá</p>
          <Link href="/search" className="min-h-11 py-2 text-white/75 hover:text-accent">
            Tìm phòng
          </Link>
          <Link href="/near-me" className="min-h-11 py-2 text-white/75 hover:text-accent">
            Gần tôi
          </Link>
          <Link href="/compare" className="min-h-11 py-2 text-white/75 hover:text-accent">
            So sánh tin
          </Link>
          <Link href="/help" className="min-h-11 py-2 text-white/75 hover:text-accent">
            Trung tâm trợ giúp
          </Link>
        </nav>
        <nav aria-label="Tài khoản RentMate" className="flex flex-col items-start gap-2 text-ui-sm">
          <p className="mb-1 font-semibold text-accent">Tài khoản</p>
          {authenticatedAccountLink ? (
            <Link href={authenticatedAccountLink.href} className="min-h-11 py-2 text-white/75 hover:text-accent">
              {authenticatedAccountLink.label}
            </Link>
          ) : (
            <Link href="/login" className="min-h-11 py-2 text-white/75 hover:text-accent">
              Đăng nhập
            </Link>
          )}
          {actor === "anonymous" || actor === "error" ? (
            <Link href="/register/landlord" className="min-h-11 py-2 text-white/75 hover:text-accent">
              Cho thuê phòng
            </Link>
          ) : (
            <Link href="/notifications" className="min-h-11 py-2 text-white/75 hover:text-accent">
              Thông báo
            </Link>
          )}
        </nav>
      </div>
      <div className="border-t border-white/15">
        <div className="rm-page-container flex flex-col gap-1 py-4 text-ui-xs text-white/60 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} RentMate.</p>
          <p>Vị trí công khai luôn là vị trí xấp xỉ.</p>
        </div>
      </div>
    </footer>
  );
}

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="fixed left-4 top-3 z-skip -translate-y-24 rounded-control bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-raised transition-transform focus:translate-y-0"
    >
      Bỏ qua đến nội dung chính
    </a>
  );
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutRequested, setLogoutRequested] = useState(false);
  const { status: authStatus, user, error: authError, logout, refresh } = useAuth();
  const status = mounted ? authStatus : "loading";
  // Keep auth-dependent shell branches on the same loading tree until the
  // first client effect has run. The auth provider may resolve its cookie
  // refresh before this component's descendants hydrate.
  const visibleUser = mounted ? user : null;
  useNotificationUnreadCount(visibleUser?.id ?? null);
  const notificationRealtime = useNotificationRealtime(visibleUser?.id ?? null);
  useNotificationSound(visibleUser?.id ?? null, notificationRealtime);
  const actor = navigationActor(visibleUser?.role ?? null, status);
  const shellKind = resolveShellKind(pathname, actor);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (logoutRequested && authStatus === "anonymous") {
      setLogoutRequested(false);
      router.replace("/");
    }
  }, [authStatus, logoutRequested, router]);

  const handleLogout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutRequested(true);
    try {
      await logout();
    } finally {
      setLogoutPending(false);
    }
  };

  const sharedProps = {
    children,
    pathname,
    authStatus: status,
    user: visibleUser,
    authError: Boolean(logoutRequested && authStatus === "authenticated" && authError),
    logoutPending,
    onLogout: () => void handleLogout(),
    onRefresh: () => void refresh()
  } as const;

  if (shellKind === "auth") return <AuthShell {...sharedProps} />;
  if (shellKind === "landlord") return <WorkspaceShell {...sharedProps} actor="landlord" />;
  if (shellKind === "admin") return <WorkspaceShell {...sharedProps} actor="admin" />;
  if (shellKind === "restricted") return <RestrictedShell user={visibleUser}>{children}</RestrictedShell>;
  return (
    <>
      <ConsumerShell {...sharedProps} actor={actor} />
      <FloatingRoommateChat />
    </>
  );
}
