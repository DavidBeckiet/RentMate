"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
import {
  AdminDecisionPanel,
  AdminEvidence,
  AdminFilter,
  AdminPage,
  AdminPageHeader,
  AdminPill,
  AdminQueueCard,
  AdminSummaryCard,
  AdminSummaryGrid,
  AdminToolbar
} from "../../components/ui/admin-workspace";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { AdminListingReview, ApiPage, ReviewStatus } from "../../types/api";

const statuses: readonly ReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];
const statusLabels: Record<ReviewStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối"
};

export function AdminReviewsPage() {
  const { status: authStatus, user, error: authError, refresh } = useAuth();
  const adminReady = authStatus === "authenticated" && user?.role === "ADMIN";
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<ReviewStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<AdminListingReview> | null>(null);
  const [selected, setSelected] = useState<AdminListingReview | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!adminReady) return;
    const controller = new AbortController();
    setStatus("loading");
    setSelected(null);
    setError(null);
    void api.admin
      .listReviews({ status: filter, page, pageSize: 20 }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          setStatus("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [adminReady, filter, page, retryKey]);

  const open = async (reviewId: number) => {
    setError(null);
    setSelected(null);
    try {
      setSelected(await api.admin.getReview(reviewId));
      setNote("");
    } catch {
      setError("Không thể tải chi tiết đánh giá.");
    }
  };

  const moderate = async (nextStatus: "APPROVED" | "REJECTED") => {
    if (!selected || !note.trim()) {
      setError("Cần nhập ghi chú quyết định trước khi hoàn tất.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.admin.moderateReview(selected.id, { status: nextStatus, note: note.trim() });
      setSelected(null);
      setNote("");
      setRetryKey((value) => value + 1);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError?.status === 409 ? "Đánh giá này đã được xử lý." : "Chưa thể lưu quyết định.");
    } finally {
      setPending(false);
    }
  };

  const reviewsOnPage = result?.data ?? [];
  const pendingOnPage = reviewsOnPage.filter((review) => review.status === "PENDING").length;
  const averageRating = reviewsOnPage.length
    ? (reviewsOnPage.reduce((sum, review) => sum + review.overallRating, 0) / reviewsOnPage.length).toFixed(1)
    : "—";

  if (authStatus === "loading") return <LoadingState message="Đang kiểm tra tài khoản…" />;
  if (authStatus === "anonymous")
    return (
      <ErrorState
        message="Bạn cần đăng nhập bằng tài khoản quản trị viên."
        action={
          <Link className="font-bold underline" href="/admin/login">
            Đăng nhập quản trị
          </Link>
        }
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
  if (!mounted) return <LoadingState message="Đang kiểm tra tài khoản…" />;

  return (
    <AdminPage labelledBy="admin-reviews-heading" className="my-8">
      <AdminPageHeader
        eyebrow="Trust & Safety · Reviews"
        title="Kiểm duyệt đánh giá"
        titleId="admin-reviews-heading"
        icon="star"
        tone="attention"
        description="Đối chiếu nội dung từ tương tác đã xác minh và ghi rõ lý do cho mọi quyết định. Số liệu bên dưới chỉ phản ánh trang hiện tại."
      />
      <AdminToolbar summary={`${reviewsOnPage.length} đánh giá trong trang`}>
        <AdminFilter id="review-status-filter" label="Trạng thái">
          <select
            id="review-status-filter"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as ReviewStatus);
              setPage(1);
            }}
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </AdminFilter>
      </AdminToolbar>
      {status === "success" && result ? (
        <AdminSummaryGrid>
          <AdminSummaryCard
            label="Đánh giá trong trang"
            value={reviewsOnPage.length}
            note="Dữ liệu trang hiện tại"
            icon="star"
          />
          <AdminSummaryCard
            label="Đang chờ duyệt"
            value={pendingOnPage}
            tone="attention"
            note="Theo bộ lọc hiện tại"
            icon="bell"
          />
          <AdminSummaryCard
            label="Điểm trung bình"
            value={averageRating}
            tone="info"
            note="Điểm tổng quan / 5"
            icon="chart"
          />
        </AdminSummaryGrid>
      ) : null}
      {status === "loading" || status === "idle" ? <LoadingState message="Đang tải hàng đợi đánh giá…" /> : null}
      {status === "error" ? (
        <ErrorState
          message="Không thể tải hàng đợi đánh giá."
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}
      {error && !selected ? (
        <p role="alert" className="border-l-4 border-red-700 pl-3 text-sm font-bold text-red-800">
          {error}
        </p>
      ) : null}
      {status === "success" && result?.data.length === 0 ? (
        <EmptyState
          title="Không có đánh giá ở trạng thái này"
          description="Hãy chọn một trạng thái khác để tiếp tục."
        />
      ) : null}
      {status === "success" && result && result.data.length > 0 ? (
        <div className="rm-admin-queue-layout">
          <div className="rm-admin-queue" aria-label="Danh sách đánh giá">
            {result.data.map((review) => (
              <AdminQueueCard key={review.id} selected={selected?.id === review.id}>
                <div className="rm-admin-queue-card__meta">
                  <span>
                    #{review.id} · Tin #{review.listingId}
                  </span>
                  <AdminPill
                    tone={review.overallRating >= 4 ? "success" : review.overallRating <= 2 ? "attention" : "info"}
                  >
                    {review.overallRating}/5
                  </AdminPill>
                </div>
                <p className="rm-admin-queue-card__body line-clamp-3">{review.comment}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void open(review.id)}
                  className="mt-4"
                >
                  Xem và xử lý
                </Button>
              </AdminQueueCard>
            ))}
            <Pagination
              ariaLabel="Phân trang đánh giá quản trị"
              page={result.pagination.page}
              hasNextPage={result.pagination.hasNextPage}
              onPrevious={() => setPage((value) => value - 1)}
              onNext={() => setPage((value) => value + 1)}
            />
          </div>
          <aside className="rm-admin-detail" aria-label="Chi tiết kiểm duyệt đánh giá">
            {selected ? (
              <div className="space-y-5">
                <div className="rm-admin-detail__header">
                  <AdminPill
                    tone={
                      selected.status === "PENDING" ? "attention" : selected.status === "APPROVED" ? "success" : "muted"
                    }
                  >
                    {statusLabels[selected.status]}
                  </AdminPill>
                  <h2 className="rm-admin-detail__title">Đánh giá #{selected.id}</h2>
                  <Link
                    className="rm-text-link mt-3 inline-flex items-center gap-2"
                    href={`/admin/listings/${selected.listingId}`}
                  >
                    Mở tin đăng <Icon name="arrowUpRight" className="h-4 w-4" />
                  </Link>
                </div>
                <dl className="rm-admin-detail__stats grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt>Chung</dt>
                    <dd className="text-2xl">{selected.overallRating}/5</dd>
                  </div>
                  <div>
                    <dt>Chính xác</dt>
                    <dd className="text-2xl">{selected.accuracyRating}/5</dd>
                  </div>
                  <div>
                    <dt>Phản hồi</dt>
                    <dd className="text-2xl">{selected.responsivenessRating}/5</dd>
                  </div>
                </dl>
                <AdminEvidence title="Nội dung đánh giá" icon="message" tone="muted">
                  <p className="whitespace-pre-wrap">{selected.comment}</p>
                </AdminEvidence>
                {selected.status === "PENDING" ? (
                  <AdminDecisionPanel
                    title="Quyết định kiểm duyệt"
                    description="Ghi chú là bắt buộc để lưu quyết định."
                  >
                    <label htmlFor="review-moderation-note" className="grid gap-2 text-sm font-extrabold">
                      Ghi chú quyết định
                      <textarea
                        id="review-moderation-note"
                        required
                        maxLength={1000}
                        rows={4}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="rm-admin-textarea"
                      />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <Button pending={pending} onClick={() => void moderate("APPROVED")}>
                        Duyệt công khai
                      </Button>
                      <Button variant="danger" pending={pending} onClick={() => void moderate("REJECTED")}>
                        Từ chối
                      </Button>
                    </div>
                  </AdminDecisionPanel>
                ) : (
                  <p className="rm-admin-evidence rm-admin-evidence--info text-sm font-semibold">
                    Ghi chú: {selected.moderationNote}
                  </p>
                )}
                {error ? (
                  <p role="alert" className="border-l-4 border-red-700 pl-3 text-sm font-bold text-red-800">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyState title="Chọn một đánh giá" description="Nội dung và công cụ xử lý sẽ xuất hiện tại đây." />
            )}
          </aside>
        </div>
      ) : null}
    </AdminPage>
  );
}
