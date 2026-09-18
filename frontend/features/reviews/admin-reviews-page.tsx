"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import { AdminPage, AdminPageHeader } from "../../components/ui/admin-workspace";
import { api } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminListingReview, ApiPage } from "../../types/api";
import {
  parseAdminReviewQueueQuery,
  reviewDetailUrl,
  reviewQueueUrl,
  reviewQuery,
  reviewStatuses,
  reviewStatusLabels
} from "./admin-review-query";
import styles from "./admin-reviews.module.css";

const dateOnlyFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" });

function statusClass(status: AdminListingReview["status"]): string {
  if (status === "PENDING") return styles.statusPending;
  if (status === "APPROVED") return styles.statusApproved;
  return styles.statusRejected;
}

export function AdminReviewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const queueState = useMemo(() => parseAdminReviewQueueQuery(new URLSearchParams(queryString)), [queryString]);
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [result, setResult] = useState<ApiPage<AdminListingReview> | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!adminReady) return;
    const controller = new AbortController();
    setLoadStatus("loading");
    setResult(null);
    void api.admin
      .listReviews(reviewQuery(queueState), controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult(data);
        setLoadStatus("success");
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus("error");
      });
    return () => controller.abort();
  }, [adminReady, queueState, retryKey]);

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
    return (
      <ErrorState
        headingLevel="h1"
        title="Đăng nhập quản trị viên để tiếp tục"
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên để tiếp tục."
        action={<Link href="/admin/login">Đăng nhập quản trị</Link>}
      />
    );
  }
  if (authStatus === "error") {
    return (
      <ErrorState
        headingLevel="h1"
        title="Không thể kiểm tra tài khoản"
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!adminReady) {
    return <ErrorState headingLevel="h1" title="Không có quyền truy cập" message="Trang này dành cho quản trị viên." />;
  }

  const rows = result?.data ?? [];
  const currentPage = result?.pagination.page ?? queueState.page;
  const emptyLaterPage = Boolean(result && rows.length === 0 && result.pagination.page > 1);

  return (
    <AdminPage labelledBy="admin-reviews-heading" className={styles.page}>
      <AdminPageHeader
        eyebrow="Tin cậy & an toàn · Đánh giá"
        title="Kiểm duyệt đánh giá"
        titleId="admin-reviews-heading"
        icon="star"
        tone="attention"
        description="Xem nội dung đánh giá và ghi chú nội bộ cho từng quyết định."
      />

      <nav className={styles.statusNav} aria-label="Trạng thái đánh giá">
        {reviewStatuses.map((status) => (
          <Link
            key={status}
            href={reviewQueueUrl({ ...queueState, status, page: 1 })}
            className={`${styles.statusLink} ${queueState.status === status ? styles.statusLinkActive : ""}`}
            aria-current={queueState.status === status ? "page" : undefined}
          >
            {reviewStatusLabels[status]}
          </Link>
        ))}
      </nav>

      {loadStatus === "loading" || loadStatus === "idle" ? (
        <LoadingState message="Đang tải hàng đợi đánh giá…" />
      ) : null}
      {loadStatus === "error" ? (
        <ErrorState
          headingLevel="h2"
          title="Không thể tải hàng đợi đánh giá"
          message="Dữ liệu chưa tải được. Bạn có thể thử lại mà không tạo quyết định mới."
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}

      {loadStatus === "success" && result?.data.length === 0 ? (
        <EmptyState
          title={`Không có đánh giá ở trạng thái ${reviewStatusLabels[queueState.status].toLowerCase()}`}
          description={
            emptyLaterPage
              ? "Trang này không còn đánh giá. Dữ liệu có thể đã thay đổi trong khi bạn đang xem."
              : "Chọn trạng thái khác để tiếp tục xem xét."
          }
          action={
            emptyLaterPage ? (
              <Button
                variant="secondary"
                onClick={() => router.push(reviewQueueUrl({ ...queueState, page: currentPage - 1 }))}
              >
                Quay lại trang trước
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {loadStatus === "success" && result && rows.length > 0 ? (
        <section className={styles.queue} aria-label="Danh sách đánh giá">
          {rows.map((review) => (
            <article key={review.id} className={styles.row}>
              <div className={styles.rowContent}>
                <div className={styles.rowMeta}>
                  <span>Đánh giá #{review.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>Tin đăng #{review.listingId}</span>
                  <span className={`${styles.status} ${statusClass(review.status)}`}>
                    {reviewStatusLabels[review.status]}
                  </span>
                </div>
                <p className={styles.excerpt}>{review.comment}</p>
                <div className={styles.rowFooter}>
                  <span>Điểm tổng quan {review.overallRating}/5</span>
                  <span aria-hidden="true">·</span>
                  <span>Người thuê #{review.tenantId}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={review.createdAt}>{dateOnlyFormatter.format(new Date(review.createdAt))}</time>
                </div>
              </div>
              <Link className={styles.openLink} href={reviewDetailUrl(review.id, queueState)}>
                Xem đánh giá
                <Icon name="arrow" className={styles.openIcon} />
              </Link>
            </article>
          ))}
          <Pagination
            ariaLabel="Phân trang đánh giá quản trị"
            variant="moderation"
            page={currentPage}
            hasNextPage={result.pagination.hasNextPage}
            onPrevious={() => router.push(reviewQueueUrl({ ...queueState, page: Math.max(1, currentPage - 1) }))}
            onNext={() => router.push(reviewQueueUrl({ ...queueState, page: currentPage + 1 }))}
            className={styles.pagination}
          />
        </section>
      ) : null}
    </AdminPage>
  );
}
