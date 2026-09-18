"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import { api } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminLandlordVerification, ApiPage, VerificationStatus } from "../../types/api";
import {
  adminVerificationStatuses,
  adminVerificationDetailUrl,
  adminVerificationsUrl,
  parseAdminVerificationQuery,
  toVerificationQuery,
  withAdminVerificationPage,
  withAdminVerificationStatus
} from "./admin-verification-query";
import styles from "./admin-verifications-page.module.css";

const statusLabels: Record<VerificationStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã xác minh",
  REJECTED: "Đã từ chối"
};

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short"
});
const numberFormatter = new Intl.NumberFormat("vi-VN");

export function AdminVerificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const parsed = useMemo(() => parseAdminVerificationQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [mounted, setMounted] = useState(false);
  const [result, setResult] = useState<ApiPage<AdminLandlordVerification> | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [retryKey, setRetryKey] = useState(0);
  const queryIdentity = parsed.ok ? JSON.stringify(parsed.state) : "invalid";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!adminReady || !parsed.ok) return;
    const controller = new AbortController();
    setLoadState("loading");
    void api.admin
      .listVerifications(toVerificationQuery(parsed.state), controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          if (data.data.length === 0 && parsed.state.page > 1) {
            router.replace(adminVerificationsUrl(withAdminVerificationPage(parsed.state, parsed.state.page - 1)));
            return;
          }
          setResult(data);
          setLoadState("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("error");
      });
    return () => controller.abort();
  }, [adminReady, parsed, queryIdentity, retryKey, router]);

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên."
        action={<Link href="/admin/login">Đăng nhập quản trị</Link>}
      />
    );
  }
  if (authStatus === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!adminReady) return <ErrorState message="Trang này dành cho quản trị viên." />;
  if (!mounted) return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (!parsed.ok) return <ErrorState message={parsed.message} />;

  const visibleVerifications = loadState === "success" && result ? result.data : [];
  const updatePage = (page: number) =>
    router.push(adminVerificationsUrl(withAdminVerificationPage(parsed.state, page)));

  return (
    <section aria-labelledby="verifications-heading" className={styles.page}>
      <header className={styles.header}>
        <h1 id="verifications-heading" className={styles.title}>
          Xác minh chủ trọ
        </h1>
        <p className={styles.description}>Duyệt hồ sơ được gửi và thông tin liên hệ hiện có · không phải eKYC.</p>
      </header>

      <nav aria-label="Lọc yêu cầu theo trạng thái" className={styles.statusNavigation}>
        {adminVerificationStatuses.map((status) => (
          <Link
            key={status}
            href={adminVerificationsUrl(withAdminVerificationStatus(parsed.state, status))}
            prefetch={false}
            aria-current={parsed.state.status === status ? "page" : undefined}
            className={styles.statusLink}
          >
            {statusLabels[status]}
          </Link>
        ))}
      </nav>

      <div className={styles.toolbar}>
        {loadState === "success" ? (
          <span aria-label="Số liệu trong trang hiện tại" className={styles.pageSummary}>
            {numberFormatter.format(visibleVerifications.length)} yêu cầu trong trang này
          </span>
        ) : (
          <span className={styles.queueContext}>Đang xem: {statusLabels[parsed.state.status]}</span>
        )}
      </div>

      {loadState === "loading" || loadState === "idle" ? <LoadingState message="Đang tải yêu cầu xác minh…" /> : null}
      {loadState === "error" ? (
        <ErrorState
          message="Không thể tải hàng đợi xác minh."
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}
      {loadState === "success" && result?.data.length === 0 ? (
        <EmptyState
          title="Không có yêu cầu ở trạng thái này"
          description="Hãy chọn trạng thái khác hoặc quay lại sau."
        />
      ) : null}

      {loadState === "success" && result && result.data.length > 0 ? (
        <section aria-label="Hàng đợi xác minh chủ trọ" className={styles.queue}>
          <div aria-hidden="true" className={styles.columnHeadings}>
            <span>Tên khai trong hồ sơ</span>
            <span>Liên hệ hiện tại</span>
            <span>Tài khoản</span>
            <span>Gửi lúc</span>
            <span>Ghi chú</span>
            <span className={styles.actionHeading}>Thao tác</span>
          </div>
          <div className={styles.rows}>
            {result.data.map((verification) => (
              <article key={verification.id} className={styles.row}>
                <div className={styles.profileCell}>
                  <span className={styles.cellLabel}>Tên khai trong hồ sơ</span>
                  <h2 className={styles.profileName}>{verification.displayName}</h2>
                  <p className={styles.profileMeta}>
                    <span>Yêu cầu #{verification.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>Chủ trọ #{verification.landlord.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{statusLabels[verification.status]}</span>
                  </p>
                </div>
                <div className={styles.contactCell}>
                  <span className={styles.cellLabel}>Liên hệ hiện tại</span>
                  <span className={styles.contactEmail}>{verification.landlord.email}</span>
                  <span className={verification.landlord.phone ? styles.secondaryLine : styles.missingContact}>
                    {verification.landlord.phone ?? "Không còn số điện thoại"}
                  </span>
                </div>
                <div className={styles.accountCell}>
                  <span className={styles.cellLabel}>Tài khoản</span>
                  <span className={verification.landlord.isActive ? styles.accountActive : styles.accountDisabled}>
                    {verification.landlord.isActive ? "Đang hoạt động" : "Đã vô hiệu hóa"}
                  </span>
                </div>
                <div className={styles.submittedCell}>
                  <span className={styles.cellLabel}>Gửi lúc</span>
                  <time dateTime={verification.submittedAt}>
                    {dateTimeFormatter.format(new Date(verification.submittedAt))}
                  </time>
                </div>
                <div className={styles.noteCell}>
                  <span className={styles.cellLabel}>Ghi chú</span>
                  {verification.requestNote ? "Có ghi chú" : "Không có ghi chú"}
                </div>
                <Link
                  className={styles.detailButton}
                  aria-label={`Xem hồ sơ ${verification.displayName}`}
                  href={adminVerificationDetailUrl(verification.id, parsed.state)}
                  prefetch={false}
                >
                  Xem hồ sơ
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {loadState === "success" && result ? (
        <Pagination
          ariaLabel="Phân trang hàng đợi xác minh"
          page={result.pagination.page}
          hasNextPage={result.pagination.hasNextPage}
          onPrevious={() => updatePage(result.pagination.page - 1)}
          onNext={() => updatePage(result.pagination.page + 1)}
          variant="moderation"
        />
      ) : null}
    </section>
  );
}
