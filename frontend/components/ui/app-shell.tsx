"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useAuth } from "../../lib/auth/auth-provider";
import { Button } from "./button";

const anonymousNavigationLinks = [
  { href: "/login", label: "Đăng nhập", emphasis: "normal" },
  { href: "/register/tenant", label: "Đăng ký tìm phòng", emphasis: "quiet" },
  { href: "/register/landlord", label: "Đăng ký cho thuê", emphasis: "quiet" }
] as const;

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutRequested, setLogoutRequested] = useState(false);
  const { status, user, error, refresh, logout } = useAuth();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    if (logoutRequested && status === "anonymous") {
      setLogoutRequested(false);
      router.replace("/");
    }
  }, [logoutRequested, router, status]);

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
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-teal-700 px-4 py-3 font-semibold text-white shadow-lg transition-transform focus:translate-y-0"
      >
        Bỏ qua đến nội dung chính
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md text-xl font-bold tracking-tight text-teal-800 transition-colors hover:text-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
          >
            RentMate
          </Link>

          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-slate-300 px-3 font-semibold text-slate-800 transition-colors hover:border-teal-700 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 md:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "Đóng" : "Menu"}
          </button>

          <nav
            id={menuId}
            aria-label="Điều hướng chính"
            className={`${menuOpen ? "flex" : "hidden"} absolute left-4 right-4 top-16 z-40 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-lg md:static md:flex md:flex-row md:items-center md:border-0 md:p-0 md:shadow-none`}
          >
            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-md px-3 font-medium text-slate-700 transition-colors hover:bg-teal-50 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              onClick={() => setMenuOpen(false)}
            >
              Trang chủ
            </Link>

            {(status === "anonymous" || status === "error") &&
              anonymousNavigationLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={pathname === link.href ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-md px-3 transition-colors hover:bg-teal-50 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${link.emphasis === "normal" ? "font-medium text-slate-700" : "text-sm font-semibold text-teal-800"}`}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}

            {status === "loading" && (
              <span className="inline-flex min-h-11 items-center px-3 text-sm text-slate-600" aria-live="polite">
                Đang kiểm tra tài khoản…
              </span>
            )}

            {status === "error" && (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <span className="text-sm text-red-700">Không thể kiểm tra tài khoản.</span>
                <button
                  type="button"
                  className="min-h-11 rounded-md px-3 font-semibold text-teal-800 underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  onClick={() => void refresh()}
                >
                  Thử lại
                </button>
              </div>
            )}

            {status === "authenticated" && user && (
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <p className="px-3 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">{user.email}</span>
                  <span className="ml-2 rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">
                    {user.role}
                  </span>
                </p>
                <Button
                  variant="secondary"
                  pending={logoutPending}
                  pendingLabel="Đang đăng xuất…"
                  className="w-full md:w-auto"
                  onClick={() => void handleLogout()}
                >
                  Đăng xuất
                </Button>
              </div>
            )}

            {status === "authenticated" && error && (
              <p className="text-sm text-red-700" role="alert">
                Đăng xuất chưa thành công. Vui lòng thử lại.
              </p>
            )}
          </nav>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {children}
      </main>
    </div>
  );
}
