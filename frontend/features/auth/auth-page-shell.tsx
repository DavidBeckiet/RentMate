"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { EmptyState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { RentMateMark } from "../../components/ui/rentmate-mark";
import { useAuth } from "../../lib/auth/auth-provider";
import type { UserRole } from "../../types/api";
import styles from "./auth-page-shell.module.css";

type AuthVariant = "login" | "chooser" | "tenant" | "landlord" | "admin";

export interface AuthPageShellProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
  readonly variant?: AuthVariant;
  readonly requiredRole?: UserRole;
  readonly successDestination?: string;
  readonly wrongRoleMessage?: string;
}

export function AuthPageShell({
  title,
  description,
  children,
  footer,
  variant = "login",
  requiredRole,
  successDestination = "/",
  wrongRoleMessage = "Tài khoản này không thể truy cập trang đăng nhập này."
}: AuthPageShellProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { status: authStatus, user } = useAuth();
  const status = mounted ? authStatus : "loading";
  const headingId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === "authenticated" && user && (!requiredRole || user.role === requiredRole)) {
      router.replace(successDestination);
    }
  }, [requiredRole, router, status, successDestination, user]);

  if (status === "loading" || (status === "authenticated" && user && (!requiredRole || user.role === requiredRole))) {
    return (
      <div className="mx-auto w-full max-w-md py-12">
        <LoadingState message={status === "loading" ? "Đang kiểm tra tài khoản…" : "Đang chuyển hướng…"} />
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <div className="mx-auto w-full max-w-md py-12">
        <EmptyState title={wrongRoleMessage} description="Hãy đăng xuất và dùng đúng tài khoản để tiếp tục." />
      </div>
    );
  }

  return (
    <div className={styles.authScene}>
      <section aria-labelledby={headingId} className={styles.authShell} data-auth-variant={variant}>
        <div className={styles.formPanel}>
          <div className={styles.brandAnchor} data-auth-brand>
            <span className={styles.brandMark}>
              <RentMateMark className="h-7 w-7 sm:h-8 sm:w-8" />
            </span>
            <span className={styles.brandWordmark}>RentMate</span>
          </div>
          <header className={styles.formHeader}>
            {variant === "admin" ? <span className={styles.formKicker}>Khu vực quản trị</span> : null}
            <h1 id={headingId}>{title}</h1>
            <p>{description}</p>
          </header>
          <div className={styles.formBody}>{children}</div>
          {footer ? <footer className={styles.formFooter}>{footer}</footer> : null}
        </div>
        <aside className={styles.visualPanel} aria-label="Thông tin về RentMate">
          <div className={styles.visualMedia}>
            <MediaImage
              src="/images/rentmate-home-hero.png"
              alt="Minh hoạ khu nhà đô thị cho hành trình tìm nơi ở RentMate"
              fill
              priority
              sizes="(min-width: 900px) 42vw, 100vw"
              className={styles.visualImage}
              fallback={
                <div className={styles.visualFallback}>
                  <Icon name="home" className="h-12 w-12" />
                  <span>Chọn nơi ở vừa với nhịp sống của bạn.</span>
                </div>
              }
            />
            <div className={styles.visualShade} aria-hidden="true" />
            <div className={styles.visualCopy}>
              <span className={styles.visualKicker}>
                <Icon name={variant === "landlord" ? "building" : "compass"} className="h-4 w-4" />
                {variant === "landlord" ? "RentMate cho chủ nhà" : "RentMate cho hành trình của bạn"}
              </span>
              <p className={styles.visualTitle}>
                {variant === "landlord" ? "Đưa chỗ trống đến đúng người." : "Chọn nơi ở rõ ràng hơn."}
              </p>
              <ul className={styles.visualFacts}>
                <li>
                  <Icon name="map" className="h-4 w-4" /> Vị trí công khai là vị trí xấp xỉ
                </li>
                <li>
                  <Icon name="shield" className="h-4 w-4" /> Trạng thái tin đăng minh bạch
                </li>
                <li>
                  <Icon name="message" className="h-4 w-4" /> Kết nối theo quyền truy cập
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
