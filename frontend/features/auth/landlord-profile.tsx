"use client";

import Link from "next/link";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { useAuth } from "../../lib/auth/auth-provider";
import { AccountProfileForm } from "./account-profile-form";
import styles from "./landlord-profile.module.css";
import { LandlordVerificationPanel } from "./landlord-verification-panel";

export function LandlordProfile() {
  const { status, user, error: authError, refresh } = useAuth();

  if (status === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (status === "anonymous") {
    return (
      <EmptyState
        title="Đăng nhập để quản lý hồ sơ"
        description="Trang này dành cho tài khoản người cho thuê."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/login">
            Đăng nhập
          </Link>
        }
      />
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này. Vui lòng thử lại."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!user || user.role !== "LANDLORD") {
    return (
      <EmptyState
        title="Trang này dành cho tài khoản người cho thuê"
        description="Hãy dùng tài khoản người cho thuê để cập nhật hồ sơ."
        action={
          <Link className="font-semibold text-teal-800 underline decoration-2 underline-offset-4" href="/search">
            Tìm phòng
          </Link>
        }
      />
    );
  }

  return (
    <section
      aria-labelledby="landlord-profile-heading"
      className={`${styles.profile} rm-workspace grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start`}
    >
      <header className="border-b border-rent-line pb-6">
        <p className="text-sm font-semibold text-teal-700">TÀI KHOẢN NGƯỜI CHO THUÊ</p>
        <h1 id="landlord-profile-heading" className="mt-2 text-3xl font-bold text-rent-ink sm:text-4xl">
          Hồ sơ tài khoản
        </h1>
        <p className="mt-3 leading-7 text-rent-secondary">
          Quản lý tên tài khoản và số điện thoại liên hệ. Email đăng nhập không thể thay đổi.
        </p>
      </header>

      <div className="rm-workspace-panel p-5 sm:p-7">
        <AccountProfileForm user={user} />
      </div>
      <div className="lg:col-start-2">
        <LandlordVerificationPanel />
      </div>
    </section>
  );
}
