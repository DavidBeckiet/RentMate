"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useComparisonSelection } from "../../features/comparison/comparison-store";
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
import { RentMateMark } from "./rentmate-mark";
import { Skeleton } from "./skeleton";

const desktopNavLink =
  "relative inline-flex min-h-11 items-center gap-2 border-2 border-transparent px-3.5 font-display text-sm font-bold text-heroDark-950 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-heroDark-950 hover:bg-rent-accent aria-[current=page]:border-heroDark-950 aria-[current=page]:bg-rent-accent aria-[current=page]:shadow-glass-sm";

const authHeaderMotion =
  "transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transform-none";

const drawerNavLink =
  "flex min-h-12 items-center gap-3 border-2 border-transparent px-3 py-2.5 text-sm font-bold text-heroDark-950 transition-[background-color,border-color,transform] duration-200 hover:border-heroDark-950 hover:bg-rent-accent aria-[current=page]:border-heroDark-950 aria-[current=page]:bg-rent-accent";

const workspaceNavLink =
  "group relative flex min-h-12 items-center gap-3 border-2 border-transparent px-3 py-2.5 text-sm font-bold text-heroDark-950 transition-[background-color,border-color,transform] duration-200 hover:border-heroDark-950 hover:bg-rent-accent aria-[current=page]:border-heroDark-950 aria-[current=page]:bg-rent-accent";

function Brand({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <Link
      href="/"
      aria-label="RentMate — về trang chủ"
      className="inline-flex min-h-11 shrink-0 items-center gap-2 text-heroDark-950"
    >
      <span
        className={cx(
          "grid place-items-center border-2 border-heroDark-950 bg-rent-accent text-heroDark-950 shadow-glass-sm",
          compact ? "h-9 w-9" : "h-10 w-10"
        )}
      >
        <RentMateMark className={compact ? "h-7 w-7" : "h-8 w-8"} />
      </span>
      <span className={cx("font-display font-bold tracking-[-0.05em]", compact ? "text-lg" : "text-xl")}>
        RENT<span className="text-brandBlue-500">MATE</span>
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

function AccountSummary({ user }: Readonly<{ user: UserProfile }>) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center border-2 border-heroDark-950 bg-rent-accent font-display text-sm font-bold text-heroDark-950"
      >
        {accountInitials(user)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-ui-sm font-semibold text-foreground">{accountPrimaryIdentity(user)}</span>
        {user.displayName ? (
          <span className="block truncate text-ui-xs text-muted-foreground">{user.email}</span>
        ) : null}
        <span className="block text-ui-xs text-muted-foreground">{accountRoleLabels[user.role]}</span>
      </span>
    </div>
  );
}

function NotificationLink({ pathname }: Readonly<{ pathname: string }>) {
  return (
    <Link
      href="/notifications"
      aria-label="Thông báo"
      aria-current={pathname === "/notifications" ? "page" : undefined}
      className={cx(
        buttonClassName("ghost", "sm"),
        "w-11 px-0 aria-[current=page]:bg-rent-accent aria-[current=page]:text-heroDark-950"
      )}
    >
      <Icon name="bell" />
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

  return (
    <div className="flex min-h-screen flex-col bg-rent-canvas text-heroDark-950">
      <SkipLink />
      <header className="sticky top-0 z-50 border-b-2 border-heroDark-950 bg-rent-surface shadow-none backdrop-blur">
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
        className={fullBleed ? "min-w-0 flex-1" : "rm-page-container min-w-0 flex-1 py-8 sm:py-12"}
      >
        {children}
      </main>

      <PublicFooter actor={actor} />

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

  useEffect(() => closeMenu(), [closeMenu, pathname]);

  const navigation = ready ? (
    <NavigationLinks items={items} pathname={pathname} linkClassName={workspaceNavLink} onNavigate={closeMenu} />
  ) : (
    <div aria-label="Đang kiểm tra quyền truy cập" className="space-y-3 px-2 py-3">
      {[0, 1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className="h-11 w-full" />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-rent-canvas text-heroDark-950 lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <SkipLink />
      <aside className="sticky top-0 hidden h-screen flex-col border-r-2 border-heroDark-950 bg-rent-surface p-4 lg:flex">
        <Brand />
        <div className="mt-7 px-2">
          <p className="text-ui-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Workspace</p>
          <p className="mt-1 font-display text-heading-sm font-semibold text-foreground">{title}</p>
        </div>
        <nav aria-label={navLabel} className="mt-5 flex-1 overflow-y-auto">
          {navigation}
        </nav>
        <div className="border-t border-border pt-4">
          {user ? <AccountSummary user={user} /> : <Skeleton className="h-11 w-full" />}
          {user ? (
            <Button variant="ghost" size="sm" className="mt-3 w-full" pending={logoutPending} onClick={onLogout}>
              <Icon name="logout" />
              Đăng xuất
            </Button>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-50 border-b-2 border-heroDark-950 bg-rent-surface backdrop-blur">
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
              {ready ? (
                <NotificationLink pathname={pathname} />
              ) : null}
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

        <main id="main-content" className="mx-auto min-w-0 max-w-[90rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>

      <NavigationOverlay open={menuOpen} title={title} triggerRef={triggerRef} onClose={closeMenu}>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const publicItems = consumerNavigationItems("anonymous");
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const loginCurrent = pathname === "/login" ? "page" : undefined;
  const registerCurrent = pathname === "/register" || pathname.startsWith("/register/") ? "page" : undefined;

  useEffect(() => closeMenu(), [closeMenu, pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-rent-canvas text-heroDark-950">
      <SkipLink />
      <header className="border-b-2 border-heroDark-950 bg-rent-surface shadow-none backdrop-blur">
        <div className="rm-page-container flex min-h-14 items-center gap-3">
          <Brand compact />

          <nav aria-label="Điều hướng công khai" className="ml-auto hidden items-center gap-1 lg:flex">
            <NavigationLinks
              items={publicItems}
              pathname={pathname}
              linkClassName={cx(desktopNavLink, authHeaderMotion)}
            />
          </nav>

          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <Link
              href="/login"
              aria-current={loginCurrent}
              className={buttonClassName("ghost", "sm", authHeaderMotion)}
            >
              <Icon name="logIn" className="h-4 w-4" />
              Đăng nhập
            </Link>
            <Link
              href="/register"
              aria-current={registerCurrent}
              className={buttonClassName("primary", "sm", authHeaderMotion)}
            >
              <Icon name="userPlus" className="h-4 w-4" />
              Đăng ký
            </Link>
          </div>

          <IconButton
            ref={triggerRef}
            label="Mở menu điều hướng"
            variant="ghost"
            className="ml-auto lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="auth-mobile-navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu" />
          </IconButton>
        </div>
      </header>
      <AuthFeedback status={authStatus} logoutFailed={authError} onRefresh={onRefresh} />
      <main
        id="main-content"
        className="relative flex flex-1 items-center overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8"
      >
        {children}
      </main>

      <NavigationOverlay open={menuOpen} title="Điều hướng RentMate" triggerRef={triggerRef} onClose={closeMenu}>
        <nav id="auth-mobile-navigation" aria-label="Điều hướng công khai trên di động" className="mt-4">
          <NavigationLinks
            items={publicItems}
            pathname={pathname}
            linkClassName={drawerNavLink}
            onNavigate={closeMenu}
          />
        </nav>
        <div className="mt-auto grid gap-2 border-t border-border pt-4">
          <Link
            href="/login"
            aria-current={loginCurrent}
            className={buttonClassName("outline", "md")}
            onClick={closeMenu}
          >
            <Icon name="logIn" className="h-4 w-4" />
            Đăng nhập
          </Link>
          <Link
            href="/register"
            aria-current={registerCurrent}
            className={buttonClassName("primary", "md")}
            onClick={closeMenu}
          >
            <Icon name="userPlus" className="h-4 w-4" />
            Đăng ký
          </Link>
        </div>
      </NavigationOverlay>
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
    <div className="flex min-h-screen flex-col bg-rent-canvas text-heroDark-950">
      <SkipLink />
      <header className="border-b-2 border-heroDark-950 bg-rent-surface">
        <div className="rm-page-container flex min-h-16 items-center justify-between gap-3">
          <Brand compact />
          <Link href={destination} className={buttonClassName("outline", "sm")}>
            {label}
          </Link>
        </div>
      </header>
      <main id="main-content" className="rm-page-container flex-1 py-8 sm:py-12">
        {children}
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
    <footer className="mt-16 border-t-2 border-heroDark-950 bg-heroDark-950 text-white">
      <div className="rm-page-container grid gap-8 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-md">
          <Brand compact />
          <p className="mt-4 text-ui-sm leading-6 text-[#d8e5df]">
            Marketplace tìm phòng minh bạch, tập trung vào vị trí và nhu cầu sống thực tế tại Việt Nam.
          </p>
        </div>
        <nav aria-label="Khám phá RentMate" className="flex flex-col items-start gap-2 text-ui-sm">
          <p className="mb-1 font-semibold text-rent-accent">Khám phá</p>
          <Link href="/search" className="min-h-11 py-2 text-[#d8e5df] hover:text-rent-accent">
            Tìm phòng
          </Link>
          <Link href="/near-me" className="min-h-11 py-2 text-[#d8e5df] hover:text-rent-accent">
            Gần tôi
          </Link>
          <Link href="/compare" className="min-h-11 py-2 text-[#d8e5df] hover:text-rent-accent">
            So sánh tin
          </Link>
        </nav>
        <nav aria-label="Tài khoản RentMate" className="flex flex-col items-start gap-2 text-ui-sm">
          <p className="mb-1 font-semibold text-rent-accent">Tài khoản</p>
          {authenticatedAccountLink ? (
            <Link href={authenticatedAccountLink.href} className="min-h-11 py-2 text-[#d8e5df] hover:text-rent-accent">
              {authenticatedAccountLink.label}
            </Link>
          ) : (
            <Link href="/login" className="min-h-11 py-2 text-[#d8e5df] hover:text-rent-accent">
              Đăng nhập
            </Link>
          )}
          {actor === "anonymous" || actor === "error" ? (
            <Link href="/register/landlord" className="min-h-11 py-2 text-[#d8e5df] hover:text-rent-accent">
              Cho thuê phòng
            </Link>
          ) : (
            <Link href="/notifications" className="min-h-11 py-2 text-[#d8e5df] hover:text-rent-accent">
              Thông báo
            </Link>
          )}
        </nav>
      </div>
      <div className="border-t-2 border-[#31564e]">
        <div className="rm-page-container flex flex-col gap-1 py-4 text-ui-xs text-[#a9c0b9] sm:flex-row sm:justify-between">
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
      className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-control bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-raised transition-transform focus:translate-y-0"
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
  const actor = navigationActor(user?.role ?? null, status);
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
    user,
    authError: Boolean(logoutRequested && authStatus === "authenticated" && authError),
    logoutPending,
    onLogout: () => void handleLogout(),
    onRefresh: () => void refresh()
  } as const;

  if (shellKind === "auth") return <AuthShell {...sharedProps} />;
  if (shellKind === "landlord") return <WorkspaceShell {...sharedProps} actor="landlord" />;
  if (shellKind === "admin") return <WorkspaceShell {...sharedProps} actor="admin" />;
  if (shellKind === "restricted") return <RestrictedShell user={user}>{children}</RestrictedShell>;
  return <ConsumerShell {...sharedProps} actor={actor} />;
}
