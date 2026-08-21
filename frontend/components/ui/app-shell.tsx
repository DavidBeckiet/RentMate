"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../lib/auth/auth-provider";
import { Button } from "./button";
import { RentMateMark } from "./rentmate-mark";
import styles from "./app-shell.module.css";

const navigationLinkClass =
  "relative inline-flex items-center rounded-xl px-3.5 py-2 text-xs font-bold text-slate-600 transition-all duration-200 hover:bg-slate-100/80 hover:text-brandBlue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 aria-[current=page]:bg-brandBlue-50 aria-[current=page]:font-black aria-[current=page]:text-brandBlue-600";

const footerLinkClass =
  "text-sm text-slate-400 transition-colors hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-md px-1";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const isHomeActive = pathname === "/" && rawQuery.length === 0;
  const isListingsActive = (pathname === "/" && rawQuery.length > 0) || pathname.startsWith("/listings");
  const isAuthPage = pathname === "/login" || pathname.startsWith("/register/") || pathname === "/admin/login";

  const router = useRouter();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [registerDropdownOpen, setRegisterDropdownOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutRequested, setLogoutRequested] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { status: authStatus, user, logout } = useAuth();
  const status = mounted ? authStatus : "loading";
  const landlordHref = status === "authenticated" && user?.role === "LANDLORD" ? "/landlord" : "/register/landlord";

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setRegisterDropdownOpen(false);
  }, [pathname, rawQuery]);

  useEffect(() => {
    const updateHeader = () => setHeaderScrolled(window.scrollY > 18);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRegisterDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/60 pb-16 text-slate-900 antialiased md:pb-0">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white shadow-card-elevated transition-transform focus:translate-y-0"
      >
        Bỏ qua đến nội dung chính
      </a>

      {/* Header */}
      <header className={styles.siteHeader} data-scrolled={headerScrolled}>
        <div className="rm-page-container flex min-h-[4.5rem] items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link
            href="/"
            aria-label="RentMate"
            className="group inline-flex shrink-0 items-center gap-2.5 rounded-2xl p-1 text-xl font-black tracking-tight text-slate-900 transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brandBlue-500 to-sky-600 text-white shadow-md shadow-brandBlue-500/30 transition-transform group-hover:scale-105">
              <RentMateMark className="h-5 w-5 text-white" />
            </div>
            <span>
              <span className="block leading-none text-[19px]">
                Rentmate<span className="text-brandBlue-500">.vn</span>
              </span>
              <small className="mt-1 block text-[9px] font-black uppercase tracking-wider text-brandBlue-600">
                #1 THUÊ NHÀ VIỆT NAM
              </small>
            </span>
          </Link>

          {/* Desktop Center Navigation Links */}
          <nav aria-label="Điều hướng chính" className="hidden lg:flex items-center gap-1.5 font-bold text-xs">
            <Link
              href="/"
              aria-current={isHomeActive ? "page" : undefined}
              className={navigationLinkClass}
            >
              Trang chủ
            </Link>
            <Link
              href="/?sort=newest"
              aria-current={isListingsActive ? "page" : undefined}
              className={navigationLinkClass}
            >
              Phòng trọ
            </Link>
            <Link
              href="/near-me"
              aria-current={pathname === "/near-me" ? "page" : undefined}
              className={`${navigationLinkClass} inline-flex items-center gap-1`}
            >
              <span>Tìm gần bạn</span>
              <span className="rounded bg-rose-500 px-1 py-0.5 text-[8px] font-black uppercase text-white animate-pulse">
                Mới
              </span>
            </Link>

            {/* Role-Specific Navigation Links */}
            {status === "authenticated" && user && (
              <>
                {user.role === "TENANT" ? (
                  <Link
                    href="/favorites"
                    aria-current={pathname === "/favorites" ? "page" : undefined}
                    className={navigationLinkClass}
                  >
                    Tin đã lưu
                  </Link>
                ) : null}
                {user.role === "LANDLORD" ? (
                  <>
                    <Link
                      href="/landlord"
                      aria-current={
                        pathname === "/landlord" || pathname.startsWith("/landlord/listings/")
                          ? "page"
                          : undefined
                      }
                      className={navigationLinkClass}
                    >
                      Tin của tôi
                    </Link>
                    <Link
                      href="/landlord/profile"
                      aria-current={pathname === "/landlord/profile" ? "page" : undefined}
                      className={navigationLinkClass}
                    >
                      Hồ sơ
                    </Link>
                  </>
                ) : null}
                {user.role === "ADMIN" ? (
                  <>
                    <Link
                      href="/admin"
                      aria-current={
                        pathname === "/admin" || pathname.startsWith("/admin/listings/")
                          ? "page"
                          : undefined
                      }
                      className={navigationLinkClass}
                    >
                      Kiểm duyệt
                    </Link>
                    <Link
                      href="/admin/users"
                      aria-current={pathname === "/admin/users" ? "page" : undefined}
                      className={navigationLinkClass}
                    >
                      Người dùng
                    </Link>
                  </>
                ) : null}
              </>
            )}
          </nav>

          {/* Right Action & Auth Section */}
          <div className="flex items-center gap-3">
            {/* Anonymous Auth Actions */}
            {status === "anonymous" && (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href="/login"
                  className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-brandBlue-600 hover:bg-slate-100/70 transition-colors"
                >
                  Đăng nhập
                </Link>

                {/* Dropdown Đăng ký */}
                <div ref={dropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setRegisterDropdownOpen(!registerDropdownOpen)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:border-brandBlue-500 hover:text-brandBlue-600 transition"
                  >
                    <span>Đăng ký</span>
                    <svg
                      aria-hidden="true"
                      className={`h-3 w-3 text-slate-400 transition-transform ${registerDropdownOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {registerDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xl backdrop-blur-xl z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                      <Link
                        href="/register/tenant"
                        className="flex items-start gap-2.5 rounded-xl p-2.5 hover:bg-brandBlue-50 text-left transition"
                        onClick={() => setRegisterDropdownOpen(false)}
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-100 text-brandBlue-600">
                          🏠
                        </div>
                        <div>
                          <strong className="block text-xs font-bold text-slate-800">Khách tìm phòng</strong>
                          <span className="text-[11px] text-slate-400">Tìm kiếm & lưu phòng trọ ưng ý</span>
                        </div>
                      </Link>

                      <Link
                        href="/register/landlord"
                        className="flex items-start gap-2.5 rounded-xl p-2.5 hover:bg-brandBlue-50 text-left transition"
                        onClick={() => setRegisterDropdownOpen(false)}
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-600">
                          🔑
                        </div>
                        <div>
                          <strong className="block text-xs font-bold text-slate-800">Chủ nhà cho thuê</strong>
                          <span className="text-[11px] text-slate-400">Đăng tin tiếp cận khách thuê</span>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Authenticated User Status */}
            {status === "authenticated" && user && (
              <div className="hidden sm:flex items-center gap-3 border-r border-slate-200 pr-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-brandBlue-50 text-brandBlue-600 border border-brandBlue-200 font-bold text-xs">
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="max-w-[8rem] truncate text-xs font-bold text-slate-800">{user.email}</span>
                    <span className="text-[10px] font-bold text-brandBlue-600">
                      {user.role === "LANDLORD" ? "Chủ nhà" : user.role === "ADMIN" ? "Quản trị" : "Khách thuê"}
                    </span>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  pending={logoutPending}
                  pendingLabel="Đang thoát…"
                  className="!min-h-8 !py-1 !px-2.5 !text-[11px] font-bold text-slate-600 hover:text-rose-600"
                  onClick={() => void handleLogout()}
                >
                  Thoát
                </Button>
              </div>
            )}

            {/* Post Free Listing CTA Button */}
            <Link
              href={landlordHref}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-brandBlue-500 to-sky-500 px-2.5 py-2.5 text-[10px] font-black text-white shadow-md shadow-brandBlue-500/25 transition hover:from-brandBlue-600 hover:to-sky-600 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brandBlue-500 sm:gap-1.5 sm:px-4 sm:text-xs"
            >
              <span aria-hidden="true" className="text-sm font-black leading-none">+</span>
              <span className="sm:hidden">Đăng tin</span>
              <span className="hidden sm:inline">Đăng tin miễn phí</span>
            </Link>

            {/* Mobile Menu Button */}
            <button
              type="button"
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 text-slate-700 transition hover:border-brandBlue-500 hover:bg-brandBlue-50 focus-visible:outline-none lg:hidden"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="sr-only">{menuOpen ? "Đóng" : "Mở"}</span>
              <span aria-hidden="true" className="grid gap-1.5">
                <span className={`block h-0.5 w-4 bg-current transition-transform duration-200 ${menuOpen ? "translate-y-2 rotate-45" : ""}`} />
                <span className={`block h-0.5 w-4 bg-current transition-opacity duration-200 ${menuOpen ? "opacity-0" : ""}`} />
                <span className={`block h-0.5 w-4 bg-current transition-transform duration-200 ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
              </span>
            </button>
          </div>

          {/* Mobile Drawer Dropdown */}
          {menuOpen && (
            <nav
              id={menuId}
              aria-label="Điều hướng di động"
              className="absolute left-4 right-4 top-[calc(100%+0.5rem)] z-50 flex flex-col gap-2 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xl backdrop-blur-2xl lg:hidden animate-in fade-in slide-in-from-top-2 duration-200"
            >
              <Link
                href="/"
                aria-current={isHomeActive ? "page" : undefined}
                className={navigationLinkClass}
                onClick={() => setMenuOpen(false)}
              >
                Trang chủ
              </Link>
              <Link
                href="/?sort=newest"
                aria-current={isListingsActive ? "page" : undefined}
                className={navigationLinkClass}
                onClick={() => setMenuOpen(false)}
              >
                Phòng trọ
              </Link>
              <Link
                href="/near-me"
                aria-current={pathname === "/near-me" ? "page" : undefined}
                className={`${navigationLinkClass} inline-flex items-center gap-1`}
                onClick={() => setMenuOpen(false)}
              >
                <span>Tìm gần bạn</span>
                <span className="rounded bg-rose-500 px-1 py-0.5 text-[8px] font-black uppercase text-white">
                  Mới
                </span>
              </Link>

              {status === "anonymous" && (
                <div className="border-t border-slate-100 pt-3 mt-1 space-y-2">
                  <Link
                    href="/login"
                    className="block rounded-xl bg-slate-100 px-4 py-2.5 text-center text-xs font-bold text-slate-800"
                    onClick={() => setMenuOpen(false)}
                  >
                    Đăng nhập
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/register/tenant"
                      className="block rounded-xl border border-slate-200 px-3 py-2 text-center text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      Đăng ký thuê phòng
                    </Link>
                    <Link
                      href="/register/landlord"
                      className="block rounded-xl border border-slate-200 px-3 py-2 text-center text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      Đăng ký cho thuê
                    </Link>
                  </div>
                </div>
              )}

              {status === "authenticated" && user && (
                <div className="border-t border-slate-100 pt-3 mt-1 space-y-2">
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl">
                    <span className="text-xs font-bold text-slate-800 truncate">{user.email}</span>
                    <span className="text-[10px] font-extrabold text-brandBlue-600">{user.role}</span>
                  </div>
                  {user.role === "TENANT" && (
                    <Link href="/favorites" className={navigationLinkClass} onClick={() => setMenuOpen(false)}>
                      Tin đã lưu
                    </Link>
                  )}
                  {user.role === "LANDLORD" && (
                    <>
                      <Link href="/landlord" className={navigationLinkClass} onClick={() => setMenuOpen(false)}>
                        Tin của tôi
                      </Link>
                      <Link href="/landlord/profile" className={navigationLinkClass} onClick={() => setMenuOpen(false)}>
                        Hồ sơ
                      </Link>
                    </>
                  )}
                  {user.role === "ADMIN" && (
                    <>
                      <Link href="/admin" className={navigationLinkClass} onClick={() => setMenuOpen(false)}>
                        Kiểm duyệt
                      </Link>
                      <Link href="/admin/users" className={navigationLinkClass} onClick={() => setMenuOpen(false)}>
                        Người dùng
                      </Link>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="w-full text-center text-xs font-bold text-rose-600 py-2"
                  >
                    Đăng xuất
                  </button>
                </div>
              )}
            </nav>
          )}
        </div>
      </header>

      <main
        id="main-content"
        className={`${
          pathname === "/" || pathname === "/near-me"
            ? "flex-1"
            : "rm-page-container flex-1 py-8 sm:py-10 lg:py-12"
        }`}
      >
        {children}
      </main>

      <footer className="mt-20 border-t border-slate-800 bg-heroDark-950 text-slate-200">
        <div className="rm-page-container grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-2xl font-black tracking-tight text-white">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-brandBlue-500 text-white shadow-md shadow-brandBlue-500/30">
                <RentMateMark className="h-5 w-5 text-white" />
              </div>
              Rentmate<span className="text-brandBlue-500">.vn</span>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-400">
              Nền tảng kết nối trực tiếp giữa người tìm phòng và chủ nhà trọ tại Việt Nam. Tìm kiếm nhanh, đúng nhu cầu, dữ liệu minh bạch tuyệt đối.
            </p>
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-sky-400 pt-1">
              <span>✦ Tìm kiếm thông minh</span>
              <span>✦ Vị trí xấp xỉ an toàn</span>
              <span>✦ Miễn phí 100%</span>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Khám phá khu vực</h2>
            <nav className="mt-4 flex flex-col gap-2.5" aria-label="Khám phá RentMate">
              <Link href="/?sort=newest" className={footerLinkClass}>Phòng trọ TP. Hồ Chí Minh</Link>
              <Link href="/?sort=newest" className={footerLinkClass}>Phòng trọ Hà Nội</Link>
              <Link href="/?sort=newest" className={footerLinkClass}>Phòng trọ Bình Dương</Link>
              <Link href="/?sort=newest" className={footerLinkClass}>Phòng trọ Cần Thơ</Link>
            </nav>
          </div>

          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Hỗ trợ khách hàng</h2>
            <nav className="mt-4 flex flex-col gap-2.5" aria-label="Tài khoản RentMate">
              <Link href="/login" className={footerLinkClass}>Đăng nhập hệ thống</Link>
              <Link href="/register/tenant" className={footerLinkClass}>Đăng ký người tìm phòng</Link>
              <Link href="/register/landlord" className={footerLinkClass}>Đăng ký chủ nhà cho thuê</Link>
              <Link href="/?sort=newest" className={footerLinkClass}>Quy chế hoạt động</Link>
            </nav>
          </div>

          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Liên hệ Rentmate</h2>
            <div className="mt-4 space-y-2 text-xs text-slate-400">
              <p><strong className="text-white">Hotline hỗ trợ:</strong> 0909.123.456 (8:00 - 21:00)</p>
              <p><strong className="text-white">Email:</strong> support@rentmate.vn</p>
              <p><strong className="text-white">Địa chỉ:</strong> Khu Công nghệ cao, TP. Thủ Đức, TP.HCM</p>
              <div className="pt-2">
                <span className="inline-block rounded-md bg-slate-900 border border-slate-800 px-2.5 py-1 text-[11px] text-slate-300">
                  Phát triển bởi <strong className="text-brandBlue-400">RentMate Tech Team</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-900 bg-heroDark-950">
          <div className="rm-page-container flex flex-col items-center justify-between gap-4 py-6 text-xs text-slate-500 sm:flex-row">
            <p>© {new Date().getFullYear()} Rentmate.vn. Tất cả quyền được bảo lưu.</p>
            <p className="text-slate-500">Nền tảng tìm phòng trọ trực tiếp #1 Việt Nam</p>
          </div>
        </div>
      </footer>

      {/* Floating Mobile Bottom Navigation Bar */}
      <nav
        className={`${isAuthPage ? "hidden" : "flex"} fixed bottom-0 left-0 right-0 z-50 items-center justify-around border-t border-slate-200/90 bg-white/95 px-3 py-2 shadow-2xl backdrop-blur-xl md:hidden`}
        aria-label="Điều hướng nhanh"
      >
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${
            pathname === "/" ? "text-brandBlue-600" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          <span>Trang chủ</span>
        </Link>

        <Link
          href="/near-me"
          className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${
            pathname === "/near-me" ? "text-brandBlue-600" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
          <span>Gần bạn</span>
        </Link>

        <Link
          href={landlordHref}
          className="flex flex-col items-center gap-1 text-[10px] font-bold text-brandBlue-600 -mt-4"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-tr from-brandBlue-500 to-sky-400 text-lg leading-none text-white shadow-lg shadow-brandBlue-500/35 border-2 border-white">
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </span>
          <span>Đăng tin</span>
        </Link>

        {status === "authenticated" && user?.role === "TENANT" ? (
          <Link
            href="/favorites"
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${
              pathname === "/favorites" ? "text-brandBlue-600" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
            <span>Yêu thích</span>
          </Link>
        ) : status === "authenticated" && user?.role === "LANDLORD" ? (
          <Link
            href="/landlord"
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${
              pathname === "/landlord" ? "text-brandBlue-600" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.75a1.125 1.125 0 0 0-1.125-1.125H5.625A1.125 1.125 0 0 0 4.5 3.75V21h3.75Z" />
            </svg>
            <span>Tin của tôi</span>
          </Link>
        ) : (
          <Link
            href="/login"
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${
              pathname === "/login" ? "text-brandBlue-600" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            <span>Tài khoản</span>
          </Link>
        )}

        {status === "authenticated" && user?.role === "ADMIN" ? (
          <Link
            href="/admin"
            className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${
              pathname.startsWith("/admin") ? "text-brandBlue-600" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
            </svg>
            <span>Admin</span>
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
