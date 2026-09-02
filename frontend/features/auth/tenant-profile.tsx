"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { accountInitials, accountRoleLabels } from "../../components/ui/account-identity";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { useAuth } from "../../lib/auth/auth-provider";
import { AccountProfileForm } from "./account-profile-form";
import { RoommateVerificationPanel } from "../roommate/roommate-verification-panel";

function joinDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(value)
  );
}

export function TenantProfile() {
  const { status, user, error, refresh } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || status === "loading") return <LoadingState message="Đang tải hồ sơ…" />;
  if (status === "anonymous") {
    return (
      <EmptyState
        title="Đăng nhập để xem hồ sơ"
        description="Trang này dành cho tài khoản người thuê."
        action={
          <Link href="/login" className="font-semibold text-primary-hover underline underline-offset-4">
            Đăng nhập
          </Link>
        }
      />
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Không thể tải hồ sơ lúc này."
        requestId={error?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!user || user.role !== "TENANT") {
    return (
      <EmptyState
        title="Trang này dành cho người thuê"
        description="Hãy dùng tài khoản người thuê để quản lý hồ sơ này."
        action={
          <Link href="/" className="font-semibold text-primary-hover underline underline-offset-4">
            Về trang chủ
          </Link>
        }
      />
    );
  }

  return (
    <section
      aria-labelledby="tenant-profile-heading"
      className="rm-workspace-page rm-tenant-workspace mx-auto max-w-6xl space-y-8"
    >
      <header className="rm-workspace-hero" data-tone="accent">
        <div className="min-w-0">
          <p className="rm-workspace-eyebrow">Không gian người thuê</p>
          <h1 id="tenant-profile-heading" className="rm-workspace-title mt-3 break-words">
            {user.displayName ?? user.email}
          </h1>
          <p className="rm-workspace-description mt-3">
            Quản lý thông tin liên hệ, trạng thái xác minh và các lối tắt cá nhân của bạn trên RentMate.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-card border border-primary/15 bg-surface/75 px-4 py-3">
          <span
            aria-hidden="true"
            className="grid h-12 w-12 place-items-center rounded-full bg-primary-subtle font-display text-lg font-bold text-primary-hover"
          >
            {accountInitials(user)}
          </span>
          <div className="min-w-0">
            <p className="text-ui-sm font-semibold text-foreground">{accountRoleLabels[user.role]}</p>
            <p className="max-w-[14rem] truncate text-ui-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(15rem,0.72fr)_minmax(0,1.28fr)] lg:items-start">
        <section className="rm-workspace-card p-5 sm:p-6" aria-labelledby="tenant-identity-heading">
          <div className="rm-workspace-section-title" id="tenant-identity-heading">
            Hồ sơ cá nhân
          </div>
          <p className="rm-workspace-section-description">Những thông tin RentMate đang lưu cho tài khoản này.</p>
          <dl className="mt-5 grid gap-4 border-t border-border pt-5 text-ui-sm">
            <div>
              <dt className="text-muted-foreground">Vai trò</dt>
              <dd className="mt-1 font-semibold text-foreground">{accountRoleLabels[user.role]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ngày tham gia</dt>
              <dd className="mt-1 font-semibold text-foreground">{joinDate(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Số điện thoại</dt>
              <dd className="mt-1 break-all font-semibold text-foreground">{user.phone ?? "Chưa cập nhật"}</dd>
            </div>
          </dl>
        </section>
        <section className="rm-workspace-card p-5 sm:p-6" aria-labelledby="tenant-account-heading">
          <h2 id="tenant-account-heading" className="rm-workspace-section-title">
            Thông tin tài khoản
          </h2>
          <p className="rm-workspace-section-description mb-6">
            Cập nhật thông tin để RentMate hiển thị tài khoản của bạn rõ ràng hơn.
          </p>
          <AccountProfileForm user={user} />
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)] lg:items-start">
        <RoommateVerificationPanel className="rm-workspace-verification h-full max-w-none" />
        <section className="rm-workspace-card p-5 sm:p-6" aria-labelledby="tenant-shortcuts-heading">
          <p className="rm-workspace-eyebrow">Lối tắt cá nhân</p>
          <h2 id="tenant-shortcuts-heading" className="mt-2 font-display text-heading-sm font-bold text-foreground">
            Tiếp tục hành trình tìm phòng
          </h2>
          <div className="mt-5 grid gap-2">
            <Link
              href="/favorites"
              className="flex min-h-12 items-center gap-3 rounded-control border border-border px-3 py-2.5 text-ui-sm font-semibold transition-colors hover:border-primary/40 hover:bg-primary-subtle"
            >
              <Icon name="heart" className="h-5 w-5 text-primary" />
              <span className="min-w-0 flex-1">Phòng đã lưu</span>
              <Icon name="arrow" className="h-4 w-4 text-muted-foreground" />
            </Link>
            <Link
              href="/inquiries"
              className="flex min-h-12 items-center gap-3 rounded-control border border-border px-3 py-2.5 text-ui-sm font-semibold transition-colors hover:border-primary/40 hover:bg-primary-subtle"
            >
              <Icon name="message" className="h-5 w-5 text-primary" />
              <span className="min-w-0 flex-1">Tin nhắn &amp; kết nối</span>
              <Icon name="arrow" className="h-4 w-4 text-muted-foreground" />
            </Link>
            <Link
              href="/roommates/profile"
              className="flex min-h-12 items-center gap-3 rounded-control border border-border px-3 py-2.5 text-ui-sm font-semibold transition-colors hover:border-primary/40 hover:bg-primary-subtle"
            >
              <Icon name="users" className="h-5 w-5 text-primary" />
              <span className="min-w-0 flex-1">Hồ sơ ở ghép</span>
              <Icon name="arrow" className="h-4 w-4 text-muted-foreground" />
            </Link>
          </div>
        </section>
      </div>
    </section>
  );
}
