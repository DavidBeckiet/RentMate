"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { useAuth } from "../../lib/auth/auth-provider";
import { AccountProfileForm } from "./account-profile-form";
import { LandlordVerificationPanel } from "./landlord-verification-panel";

export function LandlordProfile() {
  const { status, user, error: authError, refresh } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || status === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
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
    <section aria-labelledby="landlord-profile-heading" className="rm-workspace-page space-y-8">
      <header className="rm-workspace-hero" data-tone="info">
        <div className="min-w-0">
          <p className="rm-workspace-eyebrow inline-flex items-center gap-2">
            <Icon name="shield" className="h-4 w-4" /> Hồ sơ chủ trọ
          </p>
          <h1 id="landlord-profile-heading" className="rm-workspace-title mt-3">
            Hồ sơ tài khoản
          </h1>
          <p className="rm-workspace-description mt-3">
            Quản lý tên tài khoản, số điện thoại liên hệ và trạng thái xác minh. Email đăng nhập không thể thay đổi.
          </p>
        </div>
        <div className="rounded-card border border-info/20 bg-surface/80 px-4 py-3 text-ui-sm">
          <p className="font-semibold text-foreground">Quản lý cho thuê</p>
          <p className="mt-1 text-ui-xs text-muted-foreground">
            Thông tin xác minh được hiển thị theo trạng thái thực tế.
          </p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
        <section className="rm-workspace-card p-5 sm:p-7" aria-labelledby="landlord-account-heading">
          <h2 id="landlord-account-heading" className="rm-workspace-section-title">
            Thông tin tài khoản
          </h2>
          <p className="rm-workspace-section-description mb-6">
            Đây là thông tin dùng để người thuê nhận diện và liên hệ với bạn.
          </p>
          <AccountProfileForm user={user} />
        </section>
        <div>
          <LandlordVerificationPanel />
        </div>
      </div>
    </section>
  );
}
