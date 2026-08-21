"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { EmptyState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { RentMateMark } from "../../components/ui/rentmate-mark";
import { useAuth } from "../../lib/auth/auth-provider";
import type { UserRole } from "../../types/api";
import styles from "./auth-page-shell.module.css";

type AuthVariant = "login" | "tenant" | "landlord" | "admin";

const visualContent: Record<
  AuthVariant,
  {
    readonly eyebrow: string;
    readonly title: ReactNode;
    readonly description: string;
    readonly cardTitle: string;
    readonly cardDescription: string;
    readonly stat: string;
    readonly statLabel: string;
  }
> = {
  login: {
    eyebrow: "CHÀO MỪNG TRỞ LẠI",
    title: (
      <>
        Tìm đúng chỗ ở.
        <br />
        <span>Ở đúng nơi.</span>
      </>
    ),
    description: "Mở lại những tin phòng phù hợp và tiếp tục hành trình tìm một nơi ở thật vừa ý.",
    cardTitle: "RentMate luôn sẵn sàng",
    cardDescription: "Thông tin rõ ràng, kết nối trực tiếp",
    stat: "100%",
    statLabel: "miễn phí tìm phòng"
  },
  tenant: {
    eyebrow: "DÀNH CHO NGƯỜI TÌM PHÒNG",
    title: (
      <>
        Phòng phù hợp
        <br />
        <span>bắt đầu từ đây.</span>
      </>
    ),
    description: "Tạo tài khoản để lưu tin yêu thích, tìm kiếm nhanh hơn và quản lý hành trình thuê phòng.",
    cardTitle: "Tìm theo cách của bạn",
    cardDescription: "Lọc tiện ích, khu vực và mức giá",
    stat: "01",
    statLabel: "tài khoản là đủ"
  },
  landlord: {
    eyebrow: "DÀNH CHO CHỦ NHÀ",
    title: (
      <>
        Đăng tin nhanh.
        <br />
        <span>Tiếp cận đúng người.</span>
      </>
    ),
    description: "Đưa phòng trọ của bạn lên RentMate và chủ động quản lý tin đăng trong một không gian rõ ràng.",
    cardTitle: "Bắt đầu cho thuê",
    cardDescription: "Đăng tin miễn phí, quản lý dễ dàng",
    stat: "24h",
    statLabel: "thời gian duyệt dự kiến"
  },
  admin: {
    eyebrow: "KHU VỰC QUẢN TRỊ",
    title: (
      <>
        Giữ RentMate
        <br />
        <span>luôn đáng tin.</span>
      </>
    ),
    description: "Truy cập không gian kiểm duyệt và vận hành với tài khoản quản trị được phân quyền.",
    cardTitle: "Bảng điều khiển an toàn",
    cardDescription: "Kiểm duyệt minh bạch, dữ liệu được bảo vệ",
    stat: "24/7",
    statLabel: "theo dõi vận hành"
  }
};

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
  const visual = visualContent[variant];

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
    <section aria-labelledby={headingId} className={`${styles.authShell} rm-auth-shell max-w-md lg:max-w-5xl my-6`}>
      <div className={styles.visualPanel}>
        <div className={styles.visualGrid} aria-hidden="true" />
        <div className={styles.visualGlow} aria-hidden="true" />
        <div className={styles.visualContent}>
          <div className={styles.visualTopline}>
            <Link href="/" className={styles.visualBrand} aria-label="Về trang chủ RentMate">
              <span className={styles.brandMark}>
                <RentMateMark className="h-6 w-6 text-white" />
              </span>
              <span>
                Rentmate<span className={styles.brandAccent}>.vn</span>
              </span>
            </Link>
            <span className={styles.livePill}>
              <span className={styles.liveDot} aria-hidden="true" />
              Kết nối trực tiếp
            </span>
          </div>

          <div className={styles.visualCopy}>
            <span className={styles.visualEyebrow}>{visual.eyebrow}</span>
            <h2>{visual.title}</h2>
            <p>{visual.description}</p>
          </div>

          <div className={styles.visualBottom}>
            <div className={styles.visualStat}>
              <strong>{visual.stat}</strong>
              <span>{visual.statLabel}</span>
            </div>
            <div className={styles.visualRule} aria-hidden="true" />
            <div className={styles.visualTrust}>
              <span className={styles.trustIcon} aria-hidden="true">
                <Icon name="shield" className="h-4 w-4" />
              </span>
              <span>Vị trí xấp xỉ an toàn</span>
            </div>
          </div>

          <div className={styles.visualCard}>
            <span className={styles.visualCardIcon} aria-hidden="true">
              <RentMateMark className="h-4 w-4 text-white" />
            </span>
            <span className={styles.visualCardCopy}>
              <strong>{visual.cardTitle}</strong>
              <span>{visual.cardDescription}</span>
            </span>
            <span className={styles.visualCardArrow} aria-hidden="true">
              <Icon name="arrow" className="h-5 w-5" />
            </span>
          </div>
        </div>
      </div>

      <div className={styles.formPanel}>
        <header className={styles.formHeader}>
          <div className={styles.formKicker}>
            <span aria-hidden="true">01</span>
            <span>{variant === "admin" ? "SECURE ACCESS" : "YOUR NEXT PLACE"}</span>
          </div>
          <h1 id={headingId}>{title}</h1>
          <p>{description}</p>
        </header>
        <div className={styles.formBody}>{children}</div>
        <div className={styles.formTrust}>
          <span className={styles.formTrustIcon} aria-hidden="true">
            <Icon name="shield" className="h-4 w-4" />
          </span>
          <span>Thông tin của bạn được giữ riêng tư và chỉ dùng để vận hành tài khoản.</span>
        </div>
        <footer className={styles.formFooter}>{footer}</footer>
      </div>
    </section>
  );
}
