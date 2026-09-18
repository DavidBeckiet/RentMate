"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Pagination } from "../../components/ui/pagination";
import { ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, RoommateRiskPriority } from "../../types/api";
import {
  defaultReportQueueState,
  parseReportQueueState,
  reportDetailUrl,
  reportQueueUrl,
  reportStatusLabels,
  type AdminReportQueueState,
  type AnyReportCategory,
  type AnyReportStatus,
  type ReportSource
} from "./admin-report-query";
import styles from "./admin-reports-workspace.module.css";

export interface QueueRow {
  readonly id: number;
  readonly status: AnyReportStatus;
  readonly category: AnyReportCategory;
  readonly target: string;
  readonly details: string | null;
  readonly createdAt: string;
  readonly reporter: string;
  readonly priority?: RoommateRiskPriority | null;
}

export interface AdminReportQueueProps {
  readonly source: ReportSource;
  readonly title: string;
  readonly description: string;
  readonly categories: readonly { readonly value: AnyReportCategory; readonly label: string }[];
  readonly load: (state: AdminReportQueueState, signal: AbortSignal) => Promise<ApiPage<QueueRow>>;
}

const statusOptions: readonly AnyReportStatus[] = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"];
const priorityLabels: Record<RoommateRiskPriority, string> = {
  ELEVATED: "Ưu tiên xem sớm",
  STANDARD: "Ưu tiên tiêu chuẩn"
};
const formatter = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });

function submittedAge(value: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 60) return "Vừa gửi";
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}

export function AdminReportQueue({ source, title, description, categories, load }: AdminReportQueueProps) {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [state, setState] = useState<AdminReportQueueState>(() =>
    typeof window === "undefined"
      ? defaultReportQueueState()
      : parseReportQueueState(source, new URLSearchParams(window.location.search))
  );
  const [result, setResult] = useState<ApiPage<QueueRow> | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!adminReady) return;
    const controller = new AbortController();
    setLoadState("loading");
    setError(null);
    void load(state, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setLoadState("success");
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof ApiError ? caught : null);
          setLoadState("error");
        }
      });
    return () => controller.abort();
  }, [adminReady, load, retry, state]);

  const categoryNames = useMemo(() => new Map(categories.map((item) => [item.value, item.label])), [categories]);
  const replaceState = (next: AdminReportQueueState) => {
    setState(next);
    window.history.replaceState(null, "", reportQueueUrl(source, next));
  };

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous")
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên."
        action={<Link href="/admin/login">Đăng nhập quản trị</Link>}
      />
    );
  if (authStatus === "error")
    return (
      <ErrorState
        message="Không thể kiểm tra tài khoản lúc này."
        requestId={authError?.requestId}
        action={<Button onClick={() => void refresh()}>Thử lại</Button>}
      />
    );
  if (!adminReady) return <ErrorState message="Trang này dành cho quản trị viên." />;

  const filtered = state.category !== "" || state.reviewPriority !== "" || state.status !== "OPEN";
  const emptyLaterPage = Boolean(result && result.data.length === 0 && result.pagination.page > 1);
  return (
    <section className={styles.page} aria-labelledby={`${source}-reports-heading`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Tin cậy &amp; an toàn</p>
          <h1 id={`${source}-reports-heading`} className={styles.title}>
            {title}
          </h1>
          <p className={styles.description}>{description}</p>
        </div>
      </header>
      <div className={styles.filters} aria-label="Bộ lọc hàng đợi">
        <label className={styles.filter}>
          Trạng thái
          <select
            value={state.status}
            onChange={(event) => replaceState({ ...state, status: event.target.value as AnyReportStatus, page: 1 })}
          >
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {reportStatusLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filter}>
          Lý do báo cáo
          <select
            value={state.category}
            onChange={(event) =>
              replaceState({ ...state, category: event.target.value as AnyReportCategory | "", page: 1 })
            }
          >
            <option value="">Tất cả lý do</option>
            {categories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {source === "roommate" ? (
          <label className={styles.filter}>
            Ưu tiên xem xét
            <select
              value={state.reviewPriority}
              onChange={(event) =>
                replaceState({ ...state, reviewPriority: event.target.value as RoommateRiskPriority | "", page: 1 })
              }
            >
              <option value="">Tất cả mức ưu tiên</option>
              <option value="ELEVATED">Ưu tiên xem sớm</option>
              <option value="STANDARD">Ưu tiên tiêu chuẩn</option>
            </select>
          </label>
        ) : null}
      </div>
      {loadState === "idle" || loadState === "loading" ? <LoadingState message="Đang tải hàng đợi báo cáo…" /> : null}
      {loadState === "error" ? (
        <ErrorState
          message={error?.status === 401 ? "Phiên đăng nhập đã hết hạn." : "Không thể tải hàng đợi báo cáo."}
          requestId={error?.requestId}
          action={<Button onClick={() => setRetry((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}
      {loadState === "success" && result?.data.length === 0 ? (
        <EmptyState
          title={filtered ? "Không có báo cáo phù hợp" : "Chưa có báo cáo mới"}
          description={
            emptyLaterPage
              ? "Trang này không còn báo cáo. Dữ liệu có thể đã thay đổi trong khi bạn đang xem."
              : filtered
                ? "Hãy điều chỉnh bộ lọc để xem các báo cáo khác."
                : "Hàng đợi hiện không có báo cáo cần xem xét."
          }
          action={
            emptyLaterPage ? (
              <Button variant="secondary" onClick={() => replaceState({ ...state, page: result!.pagination.page - 1 })}>
                Quay lại trang trước
              </Button>
            ) : filtered ? (
              <Button variant="secondary" onClick={() => replaceState(defaultReportQueueState())}>
                Xóa bộ lọc
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {loadState === "success" && result && result.data.length > 0 ? (
        <>
          <div className={styles.list} aria-label={`Danh sách ${title.toLowerCase()}`}>
            {result.data.map((report) => {
              const actionable = report.status === "OPEN" || report.status === "INVESTIGATING";
              return (
                <article className={styles.row} key={report.id}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowMeta}>
                      {report.priority ? (
                        <span
                          className={`${styles.priority} ${report.priority === "STANDARD" ? styles.neutralPriority : ""}`}
                        >
                          {priorityLabels[report.priority]}
                        </span>
                      ) : null}
                      <span className={styles.status}>{reportStatusLabels[report.status]}</span>
                      <time dateTime={report.createdAt} title={new Date(report.createdAt).toLocaleString("vi-VN")}>
                        {submittedAge(report.createdAt)}
                      </time>
                    </div>
                    <h2 className={styles.rowTitle}>{report.target}</h2>
                    <p className={styles.rowReason}>{categoryNames.get(report.category) ?? report.category}</p>
                    <p className={styles.rowContext}>
                      {report.details ?? "Không có mô tả bổ sung."} <span className="sr-only">Người báo cáo: </span>
                      <span aria-hidden="true">· </span>
                      {report.reporter}
                    </p>
                  </div>
                  <Link className={styles.action} href={reportDetailUrl(source, report.id, state)}>
                    {actionable ? "Xem và xử lý" : "Xem báo cáo"}
                  </Link>
                </article>
              );
            })}
          </div>
          <Pagination
            ariaLabel="Phân trang báo cáo"
            variant="moderation"
            page={result.pagination.page}
            hasNextPage={result.pagination.hasNextPage}
            onPrevious={() => replaceState({ ...state, page: Math.max(1, state.page - 1) })}
            onNext={() => replaceState({ ...state, page: state.page + 1 })}
          />
        </>
      ) : null}
    </section>
  );
}
