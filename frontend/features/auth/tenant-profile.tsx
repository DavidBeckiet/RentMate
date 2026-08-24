"use client";

import Link from "next/link";
import { accountInitials, accountRoleLabels } from "../../components/ui/account-identity";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { useAuth } from "../../lib/auth/auth-provider";
import { AccountProfileForm } from "./account-profile-form";

function joinDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(value)
  );
}

export function TenantProfile() {
  const { status, user, error, refresh } = useAuth();
  if (status === "loading") return <LoadingState message="Đang tải hồ sơ…" />;
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
      className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start"
    >
      <div className="rounded-card border border-border bg-[#fffdf7] p-6 shadow-surface sm:p-8">
        <span
          aria-hidden="true"
          className="grid h-20 w-20 place-items-center rounded-full bg-primary-subtle font-display text-heading-lg font-bold text-primary-hover"
        >
          {accountInitials(user)}
        </span>
        <p className="mt-6 text-ui-xs font-bold uppercase tracking-[0.14em] text-primary-hover">Hồ sơ người thuê</p>
        <h1
          id="tenant-profile-heading"
          className="mt-2 break-words font-display text-heading-lg font-semibold text-foreground"
        >
          {user.displayName ?? user.email}
        </h1>
        {user.displayName ? <p className="mt-1 break-all text-ui-sm text-muted-foreground">{user.email}</p> : null}
        <dl className="mt-6 grid gap-4 border-t border-border pt-5 text-ui-sm">
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
      </div>
      <div className="rounded-card border border-border bg-surface p-6 shadow-surface sm:p-8">
        <h2 className="font-display text-heading-md font-semibold text-foreground">Thông tin tài khoản</h2>
        <p className="mb-6 mt-2 text-ui-sm leading-6 text-muted-foreground">
          Cập nhật thông tin để RentMate hiển thị tài khoản của bạn rõ ràng hơn.
        </p>
        <AccountProfileForm user={user} />
      </div>
    </section>
  );
}
