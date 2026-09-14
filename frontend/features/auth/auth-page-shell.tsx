"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useId, useState, type ReactNode } from "react";
import { EmptyState, LoadingState } from "../../components/ui/feedback-states";
import { Icon, type IconName } from "../../components/ui/icon";
import { useAuth } from "../../lib/auth/auth-provider";
import type { UserRole } from "../../types/api";
import styles from "./auth-page-shell.module.css";

type AuthVariant = "login" | "chooser" | "tenant" | "landlord" | "recovery" | "admin";

const variantIcons: Record<AuthVariant, IconName> = {
  login: "home",
  chooser: "home",
  tenant: "search",
  landlord: "building",
  recovery: "lock",
  admin: "shield"
};

const authVisuals: Record<
  AuthVariant,
  { src: string; label: string; kicker: string; headline: string; description: string }
> = {
  login: {
    src: "/images/auth/v2/auth-v2-login.webp",
    label: "Không gian sống RentMate",
    kicker: "CHÀO MỪNG TRỞ LẠI",
    headline: "Chào mừng bạn trở lại.",
    description: "Không gian sống phù hợp bắt đầu từ một kết nối đúng."
  },
  chooser: {
    src: "/images/auth/v2/auth-v2-login.webp",
    label: "Không gian sống RentMate",
    kicker: "MỘT KHỞI ĐẦU MỚI",
    headline: "Tìm nơi hợp mình, sống theo cách mình muốn.",
    description: "Chọn hành trình phù hợp với nhu cầu của bạn."
  },
  tenant: {
    src: "/images/auth/v2/auth-v2-tenant.webp",
    label: "Căn hộ dành cho người thuê và bạn ở ghép",
    kicker: "DÀNH CHO NGƯỜI THUÊ",
    headline: "Một căn phòng đúng nhịp sống.",
    description: "Tìm nơi ở phù hợp và kết nối với người ở ghép."
  },
  landlord: {
    src: "/images/auth/v2/auth-v2-landlord.webp",
    label: "Căn hộ cho thuê sẵn sàng đón khách",
    kicker: "DÀNH CHO CHỦ NHÀ",
    headline: "Mỗi căn nhà tốt nên được tìm thấy.",
    description: "Giới thiệu không gian cho thuê theo cách chuyên nghiệp."
  },
  recovery: {
    src: "/images/auth/v2/auth-v2-recovery.webp",
    label: "Chìa khóa trong không gian căn hộ yên tĩnh",
    kicker: "BẢO MẬT TÀI KHOẢN",
    headline: "Bạn sẽ sớm quay lại được.",
    description: "Khôi phục quyền truy cập để tiếp tục hành trình."
  },
  admin: {
    src: "/images/auth/v2/auth-v2-login.webp",
    label: "Không gian sống RentMate",
    kicker: "TÀI KHOẢN QUẢN TRỊ",
    headline: "Không gian điều hành RentMate.",
    description: "Đăng nhập an toàn để tiếp tục công việc."
  }
};

export interface AuthPageShellProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer: ReactNode;
  readonly contextAction?: ReactNode;
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
  contextAction,
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
  const visual = authVisuals[variant];

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
          <header className={styles.formHeader}>
            {contextAction ? <div className={styles.contextAction}>{contextAction}</div> : null}
            <span className={styles.formMark} aria-hidden="true">
              <Icon name={variantIcons[variant]} />
            </span>
            <h1 id={headingId}>{title}</h1>
            <p>{description}</p>
          </header>
          <div className={styles.formBody}>{children}</div>
          <footer className={styles.formFooter}>
            {footer ??
              (variant === "login" ? (
                <p>
                  Chưa có tài khoản? <Link href="/register">Tạo tài khoản</Link>
                </p>
              ) : variant === "recovery" ? (
                <Link href="/login">← Quay lại đăng nhập</Link>
              ) : variant === "admin" ? (
                <Link href="/">Quay lại trang chủ</Link>
              ) : (
                <p>
                  Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
                </p>
              ))}
          </footer>
        </div>
        <aside className={styles.visualPanel} aria-label={visual.label} data-auth-visual={variant}>
          <Image
            src={visual.src}
            alt=""
            fill
            sizes="(max-width: 639px) 0px, (max-width: 899px) 38vw, (max-width: 1279px) 42vw, 44vw"
          />
          <div className={styles.visualContent}>
            <span className={styles.visualKicker}>{visual.kicker}</span>
            <p className={styles.visualHeadline}>{visual.headline}</p>
            <p className={styles.visualDescription}>{visual.description}</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
