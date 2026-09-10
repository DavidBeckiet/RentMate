"use client";

import Link from "next/link";
import workspace from "./tenant-workspace.module.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { accountInitials, accountPrimaryIdentity, accountRoleLabels } from "../../components/ui/account-identity";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { useAuth } from "../../lib/auth/auth-provider";
import type { TenantContactVerificationStatus } from "../../types/api";
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
  const [editing, setEditing] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<TenantContactVerificationStatus | null>(null);
  const [verificationRefreshKey, setVerificationRefreshKey] = useState(0);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!editing && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  const handleVerificationStatus = useCallback((next: TenantContactVerificationStatus) => {
    setVerificationStatus(next);
  }, []);

  const startEditing = useCallback(() => {
    setProfileNotice(null);
    setEditing(true);
  }, []);

  const cancelEditing = useCallback(() => {
    restoreFocusRef.current = true;
    setProfileNotice(null);
    setEditing(false);
  }, []);

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

  const handleProfileSaved = (returned: typeof user, noOp: boolean) => {
    restoreFocusRef.current = true;
    setEditing(false);
    setProfileNotice(noOp ? "Không có thay đổi cần lưu." : "Đã cập nhật hồ sơ.");
    if (returned.phone !== user.phone) {
      setVerificationStatus(null);
      setVerificationRefreshKey((value) => value + 1);
    }
  };

  return (
    <section aria-labelledby="tenant-profile-heading" className={workspace.page}>
      <header className={workspace.header}>
        <div className="flex w-full flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-4">
              <span
                role="img"
                aria-label={`Chữ viết tắt của ${accountPrimaryIdentity(user)}`}
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary-subtle font-display text-xl font-bold text-primary-hover ring-4 ring-primary-subtle/70"
              >
                {accountInitials(user)}
              </span>
              <div className="min-w-0">
                <p className="rm-workspace-eyebrow">Hồ sơ người thuê</p>
                <h1
                  id="tenant-profile-heading"
                  className="mt-1 break-words font-display text-heading-lg font-bold text-foreground"
                >
                  {accountPrimaryIdentity(user)}
                </h1>
                <p className="mt-1 text-ui-sm font-semibold text-muted-foreground">{accountRoleLabels[user.role]}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2" aria-live="polite">
              {verificationStatus ? (
                <>
                  <span
                    className={
                      verificationStatus.email.verified
                        ? "inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-subtle px-2.5 py-1 text-ui-xs font-bold text-success"
                        : "inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-subtle px-2.5 py-1 text-ui-xs font-bold text-muted-foreground"
                    }
                  >
                    <Icon name={verificationStatus.email.verified ? "check" : "mail"} className="h-3.5 w-3.5" />
                    {verificationStatus.email.verified ? "Email đã xác minh" : "Email chưa xác minh"}
                  </span>
                  <span
                    className={
                      verificationStatus.phone.verified
                        ? "inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-subtle px-2.5 py-1 text-ui-xs font-bold text-success"
                        : "inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-subtle px-2.5 py-1 text-ui-xs font-bold text-muted-foreground"
                    }
                  >
                    <Icon name={verificationStatus.phone.verified ? "check" : "phone"} className="h-3.5 w-3.5" />
                    {verificationStatus.phone.verified ? "Số điện thoại đã xác minh" : "Số điện thoại chưa xác minh"}
                  </span>
                </>
              ) : (
                <span role="status" className="text-ui-xs font-semibold text-muted-foreground">
                  Đang tải trạng thái xác minh…
                </span>
              )}
            </div>
          </div>
          <Button
            ref={editButtonRef}
            type="button"
            className="w-full shrink-0 sm:w-auto"
            disabled={editing}
            onClick={startEditing}
          >
            {editing ? "Đang chỉnh sửa" : "Chỉnh sửa hồ sơ"}
          </Button>
        </div>
      </header>

      <div className={workspace.profileGrid}>
        <div className={workspace.profileMain}>
          <section className={workspace.panel} aria-labelledby="tenant-personal-heading">
            <header>
              <p className="rm-workspace-eyebrow">Thông tin tài khoản</p>
              <h2 id="tenant-personal-heading" className="mt-2 font-display text-heading-sm font-bold text-foreground">
                Thông tin cá nhân
              </h2>
              <p className="mt-2 max-w-prose text-ui-sm leading-6 text-muted-foreground">
                Thông tin chỉ hiển thị trong tài khoản RentMate của bạn.
              </p>
            </header>
            {editing ? (
              <div className="mt-5 border-t border-border pt-5">
                <AccountProfileForm
                  user={user}
                  submitLabel="Lưu thay đổi"
                  onSaved={handleProfileSaved}
                  onCancel={cancelEditing}
                />
              </div>
            ) : (
              <dl className={workspace.details}>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Họ và tên</dt>
                  <dd className="mt-1 break-words font-semibold text-foreground">{accountPrimaryIdentity(user)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Email đăng nhập</dt>
                  <dd className="mt-1 break-all font-semibold text-foreground">{user.email}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Số điện thoại</dt>
                  <dd className="mt-1 break-all font-semibold text-foreground">{user.phone ?? "Chưa cập nhật"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Ngày tham gia</dt>
                  <dd className="mt-1 font-semibold text-foreground">{joinDate(user.createdAt)}</dd>
                </div>
              </dl>
            )}
            {profileNotice && !editing ? (
              <p
                role="status"
                className="mt-5 rounded-control bg-primary-subtle p-3 text-ui-sm font-semibold text-primary-hover"
              >
                {profileNotice}
              </p>
            ) : null}
          </section>

          <section className={workspace.panel} aria-labelledby="tenant-shortcuts-heading">
            <header>
              <p className="rm-workspace-eyebrow">Lối tắt cho người thuê</p>
              <h2 id="tenant-shortcuts-heading" className="mt-2 font-display text-heading-sm font-bold text-foreground">
                Tiếp tục hành trình tìm phòng
              </h2>
            </header>
            <div className="mt-5 grid gap-3 sm:grid-cols-1 xl:grid-cols-3">
              <Link
                href="/favorites"
                className="group flex min-w-0 items-center gap-3 rounded-control border border-border bg-surface-subtle px-3 py-3 transition-[background-color,border-color,box-shadow] duration-standard hover:border-primary/40 hover:bg-primary-subtle hover:shadow-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary">
                  <Icon name="heart" className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ui-sm font-bold text-foreground">Tin đã lưu</span>
                  <span className="mt-0.5 block text-ui-xs leading-5 text-muted-foreground">
                    Các phòng bạn đã đánh dấu
                  </span>
                </span>
                <Icon
                  name="arrow"
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-standard group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="/inquiries"
                className="group flex min-w-0 items-center gap-3 rounded-control border border-border bg-surface-subtle px-3 py-3 transition-[background-color,border-color,box-shadow] duration-standard hover:border-primary/40 hover:bg-primary-subtle hover:shadow-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary">
                  <Icon name="message" className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ui-sm font-bold text-foreground">Tin nhắn</span>
                  <span className="mt-0.5 block text-ui-xs leading-5 text-muted-foreground">Trao đổi với chủ trọ</span>
                </span>
                <Icon
                  name="arrow"
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-standard group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="/roommates/profile"
                className="group flex min-w-0 items-center gap-3 rounded-control border border-border bg-surface-subtle px-3 py-3 transition-[background-color,border-color,box-shadow] duration-standard hover:border-primary/40 hover:bg-primary-subtle hover:shadow-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary">
                  <Icon name="users" className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ui-sm font-bold text-foreground">Hồ sơ ở ghép</span>
                  <span className="mt-0.5 block text-ui-xs leading-5 text-muted-foreground">
                    Quản lý hồ sơ tìm người ở ghép
                  </span>
                </span>
                <Icon
                  name="arrow"
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-standard group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </section>
        </div>

        <RoommateVerificationPanel
          presentation="compact"
          refreshKey={verificationRefreshKey}
          onStatusChange={handleVerificationStatus}
          onEditProfile={startEditing}
          className={workspace.verification}
        />
      </div>
    </section>
  );
}
