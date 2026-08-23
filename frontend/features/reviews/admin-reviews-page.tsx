"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { Pagination } from "../../components/ui/pagination";
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
  const [filter, setFilter] = useState<ReviewStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ApiPage<AdminListingReview> | null>(null);
  const [selected, setSelected] = useState<AdminListingReview | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

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

  return (
    <section className="rm-workspace my-8 space-y-6" aria-labelledby="admin-reviews-heading">
      <header className="border-2 border-heroDark-950 bg-rent-coral p-6 shadow-glass sm:p-8">
        <span className="rm-eyebrow inline-flex items-center gap-2">
          <Icon name="shield" className="h-4 w-4" /> TRUST & SAFETY
        </span>
        <h1 id="admin-reviews-heading" className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-6xl">
          Kiểm duyệt đánh giá
        </h1>
        <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-slate-700">
          Đối chiếu nội dung từ tương tác đã xác minh và ghi rõ lý do cho mọi quyết định.
        </p>
      </header>
      <div className="border-2 border-heroDark-950 bg-white p-4 shadow-glass-sm">
        <label htmlFor="review-status-filter" className="grid max-w-xs gap-2 text-xs font-extrabold uppercase">
          Trạng thái
          <select
            id="review-status-filter"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as ReviewStatus);
              setPage(1);
            }}
            className="min-h-12 border-2 border-heroDark-950 bg-rent-accent px-3 text-sm font-bold normal-case outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
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
        <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(24rem,1.2fr)]">
          <div className="space-y-3" aria-label="Danh sách đánh giá">
            {result.data.map((review) => (
              <article
                key={review.id}
                data-selected={selected?.id === review.id}
                className="border-2 border-heroDark-950 bg-white p-4 shadow-glass-sm data-[selected=true]:bg-[#e5eefc]"
              >
                <div className="flex justify-between gap-3 text-xs font-extrabold uppercase">
                  <span>
                    #{review.id} · Tin #{review.listingId}
                  </span>
                  <span>{review.overallRating}/5</span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm font-medium leading-6 text-slate-700">{review.comment}</p>
                <button
                  type="button"
                  onClick={() => void open(review.id)}
                  className="mt-4 min-h-10 border-2 border-heroDark-950 bg-[#c9f269] px-4 text-sm font-extrabold focus-visible:ring-4 focus-visible:ring-blue-300"
                >
                  Xem và xử lý
                </button>
              </article>
            ))}
            <Pagination
              ariaLabel="Phân trang đánh giá quản trị"
              page={result.pagination.page}
              hasNextPage={result.pagination.hasNextPage}
              onPrevious={() => setPage((value) => value - 1)}
              onNext={() => setPage((value) => value + 1)}
            />
          </div>
          <aside
            className="h-fit border-2 border-heroDark-950 bg-white p-5 shadow-glass lg:sticky lg:top-24"
            aria-label="Chi tiết kiểm duyệt đánh giá"
          >
            {selected ? (
              <div className="space-y-5">
                <div>
                  <span className="rm-eyebrow">{statusLabels[selected.status]}</span>
                  <h2 className="mt-3 font-display text-3xl font-bold">Đánh giá #{selected.id}</h2>
                  <Link
                    className="mt-2 inline-flex items-center gap-2 text-sm font-extrabold underline"
                    href={`/admin/listings/${selected.listingId}`}
                  >
                    Mở tin đăng <Icon name="arrowUpRight" className="h-4 w-4" />
                  </Link>
                </div>
                <dl className="grid gap-2 text-sm font-bold sm:grid-cols-3">
                  <div className="border-2 border-heroDark-950 p-3">
                    <dt>Chung</dt>
                    <dd className="text-2xl">{selected.overallRating}/5</dd>
                  </div>
                  <div className="border-2 border-heroDark-950 p-3">
                    <dt>Chính xác</dt>
                    <dd className="text-2xl">{selected.accuracyRating}/5</dd>
                  </div>
                  <div className="border-2 border-heroDark-950 p-3">
                    <dt>Phản hồi</dt>
                    <dd className="text-2xl">{selected.responsivenessRating}/5</dd>
                  </div>
                </dl>
                <p className="whitespace-pre-wrap border-l-4 border-heroDark-950 pl-4 text-sm font-medium leading-6">
                  {selected.comment}
                </p>
                {selected.status === "PENDING" ? (
                  <div className="grid gap-3 border-t-2 border-heroDark-950 pt-5">
                    <label htmlFor="review-moderation-note" className="grid gap-2 text-sm font-extrabold">
                      Ghi chú quyết định
                      <textarea
                        id="review-moderation-note"
                        required
                        maxLength={1000}
                        rows={4}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className="border-2 border-heroDark-950 p-3 font-medium outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
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
                  </div>
                ) : (
                  <p className="border-2 border-heroDark-950 bg-rent-accent p-4 text-sm font-bold">
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
    </section>
  );
}
