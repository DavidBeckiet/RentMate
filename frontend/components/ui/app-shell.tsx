"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useAuth } from "../../lib/auth/auth-provider";
import { Icon } from "./icon";
import { RentMateMark } from "./rentmate-mark";
import styles from "./app-shell.module.css";

const navLink =
  "inline-flex min-h-11 items-center justify-between gap-2 border-2 border-transparent px-3.5 font-display text-sm font-bold text-heroDark-950 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-heroDark-950 hover:bg-rent-accent focus-visible:outline-none aria-[current=page]:border-heroDark-950 aria-[current=page]:bg-rent-accent aria-[current=page]:shadow-glass-sm";

const footerLink =
  "w-fit text-sm font-semibold text-[#d8e5df] underline-offset-4 transition-colors hover:text-rent-accent hover:underline focus-visible:outline-none";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const menuId = useId();
  const isAuthPage = pathname === "/login" || pathname.startsWith("/register/") || pathname === "/admin/login";
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutRequested, setLogoutRequested] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { status: authStatus, user, error: authError, logout, refresh } = useAuth();
  const status = mounted ? authStatus : "loading";
  const landlordHref = status === "authenticated" && user?.role === "LANDLORD" ? "/landlord" : "/register/landlord";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

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

  const homeCurrent = pathname === "/" ? "page" : undefined;
  const listingCurrent = pathname === "/search" || pathname.startsWith("/listings") ? "page" : undefined;

  return (
    <div className="flex min-h-screen flex-col pb-[4.5rem] text-rent-ink md:pb-0">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[70] -translate-y-24 border-2 border-heroDark-950 bg-rent-accent px-4 py-2 font-bold text-heroDark-950 shadow-glass transition-transform focus:translate-y-0"
      >
        Bỏ qua đến nội dung chính
      </a>

      <header className={styles.header} data-scrolled={scrolled}>
        <div className="rm-page-container relative flex min-h-[4.75rem] items-center justify-between gap-3">
          <Link
            href="/"
            aria-label="RentMate"
            className={cx(styles.brand, "group inline-flex shrink-0 items-center gap-2.5 focus-visible:outline-none")}
          >
            <span
              className={cx(
                styles.brandTile,
                "grid h-11 w-11 place-items-center border-2 border-heroDark-950 bg-rent-accent shadow-glass-sm"
              )}
            >
              <RentMateMark className="h-9 w-9 text-heroDark-950" />
            </span>
            <span className="font-display text-xl font-bold tracking-[-0.05em] text-heroDark-950 sm:text-2xl">
              RENT<span className="text-brandBlue-500">MATE</span>
            </span>
          </Link>

          <button
            type="button"
            className="grid h-11 w-11 place-items-center border-2 border-heroDark-950 bg-rent-surface text-heroDark-950 shadow-glass-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none lg:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>

          <nav
            id={menuId}
            aria-label="Điều hướng chính"
            className={cx(
              "absolute left-4 right-4 top-[calc(100%+0.75rem)] z-50 border-2 border-heroDark-950 bg-rent-surface p-3 shadow-card-elevated lg:static lg:flex lg:flex-1 lg:items-center lg:justify-end lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
              menuOpen ? cx(styles.mobilePanel, "block") : "hidden lg:flex"
            )}
          >
            <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-1.5">
              <Link href="/" aria-current={homeCurrent} className={navLink}>
                Trang chủ
              </Link>
              <Link href="/search" aria-current={listingCurrent} className={navLink}>
                Tìm phòng
              </Link>
              <Link href="/near-me" aria-current={pathname === "/near-me" ? "page" : undefined} className={navLink}>
                <span className="inline-flex items-center gap-2">
                  <Icon name="compass" className="h-4 w-4" />
                  Gần tôi
                </span>
                <span className="border border-heroDark-950 bg-rent-coral px-1.5 py-0.5 text-[9px] uppercase">
                  Live
                </span>
              </Link>

              {status === "authenticated" && user?.role === "TENANT" ? (
                <>
                  <Link
                    href="/favorites"
                    aria-current={pathname === "/favorites" ? "page" : undefined}
                    className={navLink}
                  >
                    Tin đã lưu
                  </Link>
                  <Link
                    href="/saved-searches"
                    aria-current={pathname === "/saved-searches" ? "page" : undefined}
                    className={navLink}
                  >
                    Bộ lọc đã lưu
                  </Link>
                  <Link
                    href="/inquiries"
                    aria-current={pathname === "/inquiries" || pathname.startsWith("/inquiries/") ? "page" : undefined}
                    className={navLink}
                  >
                    Yêu cầu
                  </Link>
                </>
              ) : null}

              {status === "authenticated" && user?.role === "LANDLORD" ? (
                <>
                  <Link
                    href="/landlord"
                    aria-current={
                      pathname === "/landlord" || pathname.startsWith("/landlord/listings/") ? "page" : undefined
                    }
                    className={navLink}
                  >
                    Tin của tôi
                  </Link>
                  <Link
                    href="/landlord/profile"
                    aria-current={pathname === "/landlord/profile" ? "page" : undefined}
                    className={navLink}
                  >
                    Hồ sơ
                  </Link>
                  <Link
                    href="/landlord/inquiries"
                    aria-current={pathname.startsWith("/landlord/inquiries") ? "page" : undefined}
                    className={navLink}
                  >
                    Yêu cầu
                  </Link>
                </>
              ) : null}

              {status === "authenticated" ? (
                <Link
                  href="/notifications"
                  aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
                  className={navLink}
                >
                  Thông báo
                </Link>
              ) : null}

              {status === "authenticated" && user?.role === "ADMIN" ? (
                <>
                  <Link
                    href="/admin"
                    aria-current={pathname === "/admin" || pathname.startsWith("/admin/listings/") ? "page" : undefined}
                    className={navLink}
                  >
                    Kiểm duyệt
                  </Link>
                  <Link
                    href="/admin/users"
                    aria-current={pathname === "/admin/users" ? "page" : undefined}
                    className={navLink}
                  >
                    Người dùng
                  </Link>
                </>
              ) : null}

              <span className="my-2 h-0.5 bg-heroDark-950 lg:mx-2 lg:my-0 lg:h-8 lg:w-0.5" />

              {status === "anonymous" ? (
                <>
                  <Link href="/login" aria-current={pathname === "/login" ? "page" : undefined} className={navLink}>
                    Đăng nhập
                  </Link>
                  <Link
                    href="/register/tenant"
                    aria-current={pathname === "/register/tenant" ? "page" : undefined}
                    className={cx(navLink, "lg:hidden")}
                  >
                    Đăng ký tìm phòng
                  </Link>
                  <Link
                    href="/register/landlord"
                    aria-current={pathname === "/register/landlord" ? "page" : undefined}
                    className={cx(navLink, "lg:hidden")}
                  >
                    Đăng ký cho thuê
                  </Link>
                </>
              ) : null}

              {status === "authenticated" && user ? (
                <div className="mt-2 flex items-center justify-between gap-3 border-2 border-heroDark-950 bg-[#e5eefc] p-2 lg:mt-0">
                  <span className="grid h-8 w-8 place-items-center bg-heroDark-950 font-display text-xs font-bold text-white">
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-36 truncate text-xs font-bold">{user.email}</span>
                    <span className="block text-[9px] font-extrabold uppercase tracking-[0.14em] text-brandBlue-600">
                      {user.role}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={logoutPending}
                    onClick={() => void handleLogout()}
                    className="grid h-9 min-w-9 place-items-center border-2 border-heroDark-950 bg-rent-surface px-2 text-xs font-bold transition-colors hover:bg-rent-coral disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={logoutPending ? "Đang đăng xuất…" : "Đăng xuất"}
                  >
                    {logoutPending ? (
                      <span className="h-4 w-4 animate-spin border-2 border-heroDark-950 border-r-transparent motion-reduce:animate-none" />
                    ) : (
                      <Icon name="logout" className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ) : null}

              <Link
                href={landlordHref}
                className="group inline-flex min-h-11 items-center justify-center gap-2 border-2 border-heroDark-950 bg-rent-accent px-4 font-display text-sm font-bold text-heroDark-950 shadow-glass-sm transition-transform duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-glass focus-visible:outline-none"
              >
                <Icon name="plus" className="h-4 w-4 transition-transform group-hover:rotate-90" />
                Đăng tin
              </Link>
            </div>
          </nav>
        </div>
      </header>

      {status === "error" ? (
        <div role="alert" className="border-b-2 border-heroDark-950 bg-rent-yellow">
          <div className="rm-page-container flex min-h-12 items-center justify-between gap-3 py-2 text-sm font-bold">
            <span>Không thể kiểm tra tài khoản.</span>
            <button
              type="button"
              className="border-2 border-heroDark-950 bg-white px-3 py-1.5 shadow-glass-sm"
              onClick={() => void refresh()}
            >
              Thử lại
            </button>
          </div>
        </div>
      ) : null}

      {logoutRequested && authStatus === "authenticated" && authError ? (
        <div
          role="alert"
          className="border-b-2 border-heroDark-950 bg-rent-coral px-4 py-2 text-center text-sm font-bold"
        >
          Đăng xuất chưa thành công. Vui lòng thử lại.
        </div>
      ) : null}

      <main
        id="main-content"
        className={
          pathname === "/" || pathname === "/search" || pathname === "/near-me"
            ? "flex-1"
            : "rm-page-container flex-1 py-8 sm:py-12"
        }
      >
        {children}
      </main>

      <footer className="mt-20 border-t-2 border-heroDark-950 bg-heroDark-950 text-white">
        <div className="overflow-hidden border-b-2 border-rent-accent bg-rent-accent py-2 text-heroDark-950">
          <div className="flex w-max animate-marquee motion-reduce:animate-none" aria-hidden="true">
            {[0, 1].map((copy) => (
              <div
                key={copy}
                className="flex shrink-0 items-center font-display text-sm font-bold uppercase tracking-[0.18em]"
              >
                {[
                  "Không phí môi giới",
                  "Vị trí xấp xỉ an toàn",
                  "Tin thật — người thật",
                  "Tìm nhà theo cách của bạn"
                ].map((item) => (
                  <span key={item} className="flex items-center gap-5 px-5">
                    {item}
                    <span className="h-2.5 w-2.5 rotate-45 border-2 border-heroDark-950 bg-rent-coral" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="rm-page-container grid gap-10 py-14 lg:grid-cols-[1.4fr_0.7fr_0.7fr]">
          <div className="max-w-xl">
            <div className="flex items-center gap-3 font-display text-3xl font-bold">
              <span className="grid h-12 w-12 place-items-center border-2 border-white bg-rent-accent text-heroDark-950">
                <RentMateMark className="h-10 w-10" />
              </span>
              RENTMATE
            </div>
            <p className="mt-6 max-w-lg text-base leading-7 text-[#d8e5df]">
              Một cách mới để khám phá chỗ ở: trực quan hơn, minh bạch hơn và luôn bảo vệ vị trí riêng tư của chủ nhà.
            </p>
            <p className="mt-8 font-display text-xs font-bold uppercase tracking-[0.2em] text-rent-accent">
              Made for real life in Vietnam
            </p>
          </div>

          <div>
            <h2 className="mb-5 font-display text-sm font-bold uppercase tracking-[0.16em] text-rent-accent">
              Khám phá
            </h2>
            <nav aria-label="Khám phá RentMate" className="flex flex-col gap-3">
              <Link href="/search" className={footerLink}>
                Phòng mới nhất
              </Link>
              <Link href="/near-me" className={footerLink}>
                Tìm quanh tôi
              </Link>
              <Link href="/register/landlord" className={footerLink}>
                Đăng tin cho thuê
              </Link>
            </nav>
          </div>

          <div>
            <h2 className="mb-5 font-display text-sm font-bold uppercase tracking-[0.16em] text-rent-accent">
              Tài khoản
            </h2>
            <nav aria-label="Tài khoản RentMate" className="flex flex-col gap-3">
              <Link href="/login" className={footerLink}>
                Truy cập tài khoản
              </Link>
              <Link href="/register/tenant" className={footerLink}>
                Tạo tài khoản người thuê
              </Link>
              <Link href="/register/landlord" className={footerLink}>
                Tạo tài khoản chủ nhà
              </Link>
            </nav>
          </div>
        </div>
        <div className="border-t-2 border-[#31564e]">
          <div className="rm-page-container flex flex-col gap-2 py-5 text-xs text-[#a9c0b9] sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} RentMate. Mọi quyền được bảo lưu.</p>
            <p>Vị trí công khai luôn là vị trí xấp xỉ.</p>
          </div>
        </div>
      </footer>

      <nav
        aria-label="Điều hướng nhanh"
        className={cx(
          isAuthPage ? "hidden" : "grid",
          "fixed bottom-0 left-0 right-0 z-50 grid-cols-5 border-t-2 border-heroDark-950 bg-rent-surface md:hidden"
        )}
      >
        <Link
          href="/"
          aria-current={homeCurrent}
          className="flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-bold"
        >
          <Icon name="home" className="h-5 w-5" />
          Home
        </Link>
        <Link
          href="/search"
          aria-current={listingCurrent}
          className="flex min-h-16 flex-col items-center justify-center gap-1 border-l-2 border-heroDark-950 text-[10px] font-bold"
        >
          <Icon name="search" className="h-5 w-5" />
          Tìm
        </Link>
        <Link
          href="/near-me"
          className="flex min-h-16 flex-col items-center justify-center gap-1 border-l-2 border-heroDark-950 text-[10px] font-bold"
        >
          <Icon name="compass" className="h-5 w-5" />
          Gần tôi
        </Link>
        <Link
          href={landlordHref}
          className="flex min-h-16 flex-col items-center justify-center gap-1 border-l-2 border-heroDark-950 bg-rent-accent text-[10px] font-bold"
        >
          <Icon name="plus" className="h-5 w-5" />
          Đăng tin
        </Link>
        <Link
          href={
            status === "authenticated" && user?.role === "TENANT"
              ? "/favorites"
              : status === "authenticated" && user?.role === "LANDLORD"
                ? "/landlord"
                : status === "authenticated" && user?.role === "ADMIN"
                  ? "/admin"
                  : "/login"
          }
          className="flex min-h-16 flex-col items-center justify-center gap-1 border-l-2 border-heroDark-950 text-[10px] font-bold"
        >
          <Icon name="user" className="h-5 w-5" />
          Tài khoản
        </Link>
      </nav>
    </div>
  );
}
