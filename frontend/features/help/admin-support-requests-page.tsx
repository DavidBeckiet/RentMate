"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminSupportRequest, ApiPage } from "../../types/api";
import {
  parseSupportRequestQueueQuery,
  supportRequestCategoryLabels,
  supportRequestDetailUrl,
  supportRequesterRoleLabels,
  supportRequestQueueUrl,
  supportRequestStatusLabels,
  supportRequestStatuses
} from "./admin-support-request-query";
import styles from "./admin-support-requests.module.css";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

function statusClassName(status: AdminSupportRequest["status"]): string {
  if (status === "OPEN") return styles.statusOpen;
  if (status === "IN_PROGRESS") return styles.statusProgress;
  return styles.statusResolved;
}

export function AdminSupportRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const queueState = useMemo(() => parseSupportRequestQueueQuery(new URLSearchParams(rawQuery)), [rawQuery]);
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [result, setResult] = useState<ApiPage<AdminSupportRequest> | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!adminReady) return;
    const controller = new AbortController();
    setLoadStatus("loading");
    setError(null);
    void api.admin
      .listSupportRequests(queueState, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult(data);
        setLoadStatus("success");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof ApiError ? caught : null);
        setLoadStatus("error");
      });
    return () => controller.abort();
  }, [adminReady, queueState, retryKey]);

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous") {
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên để tiếp tục."
        action={
          <Link href="/admin/login" className="font-semibold text-primary-hover underline">
            Đăng nhập quản trị
          </Link>
        }
      />
    );
  }
  if (authStatus === "error") {
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  }
  if (!adminReady) return <ErrorState message="Trang này dành cho quản trị viên." />;

  const requests = result?.data ?? [];
  const previousUrl = supportRequestQueueUrl({ ...queueState, page: Math.max(1, queueState.page - 1) });
  const nextUrl = supportRequestQueueUrl({ ...queueState, page: queueState.page + 1 });

  return (
    <section aria-labelledby="admin-support-heading" className={styles.queuePage}>
      <header className={styles.queueHeader}>
        <p className={styles.eyebrow}>Quản trị · Hỗ trợ</p>
        <h1 id="admin-support-heading" className={styles.queueTitle}>
          Yêu cầu hỗ trợ
        </h1>
        <p className={styles.description}>Xem các hồ sơ hỗ trợ và ghi nhận kết luận nội bộ khi hoàn tất.</p>
        <nav aria-label="Trạng thái yêu cầu hỗ trợ" className={styles.statusNav}>
          {supportRequestStatuses.map((status) => (
            <Link
              key={status}
              href={supportRequestQueueUrl({ ...queueState, status, page: 1 })}
              aria-current={queueState.status === status ? "page" : undefined}
              className={`${styles.statusLink} ${queueState.status === status ? styles.statusLinkActive : ""}`}
            >
              {supportRequestStatusLabels[status]}
            </Link>
          ))}
        </nav>
      </header>

      {loadStatus === "idle" || loadStatus === "loading" ? <LoadingState message="Đang tải yêu cầu hỗ trợ…" /> : null}
      {loadStatus === "error" ? (
        <ErrorState
          message={
            error?.status === 401
              ? "Phiên đăng nhập đã hết hạn."
              : error?.status === 403
                ? "Tài khoản của bạn không có quyền xem yêu cầu hỗ trợ."
                : "Không thể tải hàng đợi hỗ trợ."
          }
          requestId={error?.requestId}
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}
      {loadStatus === "success" && requests.length === 0 && queueState.page > 1 ? (
        <EmptyState
          title="Trang này không còn yêu cầu hỗ trợ"
          description="Dữ liệu có thể đã thay đổi trong khi bạn đang xem."
          action={
            <Link href={previousUrl} className="font-semibold text-primary-hover underline">
              Về trang trước
            </Link>
          }
        />
      ) : null}
      {loadStatus === "success" && requests.length === 0 && queueState.page === 1 ? (
        <EmptyState
          title="Không có yêu cầu ở trạng thái này"
          description="Hãy chọn trạng thái khác hoặc quay lại sau."
        />
      ) : null}
      {loadStatus === "success" && result && requests.length > 0 ? (
        <>
          <div className={styles.queueList} aria-label="Danh sách yêu cầu hỗ trợ">
            {requests.map((request) => (
              <article key={request.id} className={styles.queueRow}>
                <div className="min-w-0">
                  <div className={styles.rowMeta}>
                    <span>#{request.id}</span>
                    <span aria-hidden="true">·</span>
                    <span className={styles.category}>{supportRequestCategoryLabels[request.category]}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={request.createdAt}>{dateTimeFormatter.format(new Date(request.createdAt))}</time>
                  </div>
                  <h2 className={styles.rowSubject}>{request.subject}</h2>
                  <p className={styles.rowRequester}>
                    <span>{request.requester.email}</span>
                    <span aria-hidden="true">·</span>
                    <span>{supportRequesterRoleLabels[request.requester.role]}</span>
                    <span className={`${styles.status} ${statusClassName(request.status)}`}>
                      {supportRequestStatusLabels[request.status]}
                    </span>
                  </p>
                </div>
                <Link href={supportRequestDetailUrl(request.id, queueState)} className={styles.caseLink}>
                  {request.status === "RESOLVED" ? "Xem hồ sơ" : "Mở hồ sơ"}
                </Link>
              </article>
            ))}
          </div>
          <Pagination
            ariaLabel="Phân trang yêu cầu hỗ trợ"
            page={result.pagination.page}
            hasNextPage={result.pagination.hasNextPage}
            onPrevious={() => router.push(previousUrl)}
            onNext={() => router.push(nextUrl)}
            variant="moderation"
            className={styles.pagination}
          />
        </>
      ) : null}
    </section>
  );
}
