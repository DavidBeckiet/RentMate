"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/feedback-states";
import { Icon } from "../../components/ui/icon";
import { MediaImage } from "../../components/ui/media-image";
import { api, ApiError } from "../../lib/api/client";
import { useAuth } from "../../lib/auth/auth-provider";
import type { ApiPage, Inquiry, PublicListingDetail, PublicListingReview } from "../../types/api";
import { ListingPrice } from "../listings/listing-presentation";
import { TenantReviewPanel } from "./tenant-review-panel";
import { PublicReviewRow } from "./public-review-row";
import { ReviewReportDialog } from "./report-review-control";

const reviewPageSize = 10;
const inquiryLookupPageSize = 100;
const maximumInquiryLookupPages = 50;

type PageStatus = "loading" | "success" | "error";

function parseListingId(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const listingId = Number(value);
  return Number.isSafeInteger(listingId) && listingId > 0 ? listingId : null;
}

function compareInquiryRecency(left: Inquiry, right: Inquiry): number {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || right.id - left.id;
}

async function findEligibleReviewInquiry(listingId: number, signal: AbortSignal): Promise<number | null> {
  const candidates: Inquiry[] = [];

  for (let page = 1; page <= maximumInquiryLookupPages; page += 1) {
    const result = await api.contact.listTenantInquiries({ page, pageSize: inquiryLookupPageSize }, signal);
    candidates.push(...result.data.filter((inquiry) => inquiry.listingId === listingId && inquiry.status === "CLOSED"));
    if (!result.pagination.hasNextPage) break;
  }

  for (const candidate of candidates.sort(compareInquiryRecency)) {
    try {
      const eligibility = await api.contact.getReviewEligibility(candidate.id, signal);
      if (eligibility.eligible) return candidate.id;
    } catch (caught: unknown) {
      if (signal.aborted) throw caught;
    }
  }

  return null;
}

function reviewLinkClass(disabled = false): string {
  return disabled
    ? "inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface-subtle px-4 text-ui-sm font-semibold text-muted-foreground"
    : "inline-flex min-h-11 items-center gap-2 rounded-control border border-border-strong bg-surface px-4 text-ui-sm font-bold text-primary-hover transition-[background-color,border-color,color,transform] duration-fast hover:-translate-y-0.5 hover:border-primary hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus motion-reduce:transform-none";
}

function ReviewPagination({
  listingId,
  page,
  hasNextPage
}: Readonly<{ listingId: number; page: number; hasNextPage: boolean }>) {
  if (page === 1 && !hasNextPage) return null;

  const basePath = `/listings/${listingId}/reviews`;

  return (
    <nav
      aria-label="Phân trang đánh giá"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 shadow-surface sm:gap-4"
    >
      {page > 1 ? (
        <Link href={`${basePath}?page=${page - 1}`} className={reviewLinkClass()}>
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          Trước
        </Link>
      ) : (
        <span className={reviewLinkClass(true)} aria-disabled="true">
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          Trước
        </span>
      )}

      <span className="font-display text-sm font-bold text-primary-hover" aria-current="page">
        Trang {page}
      </span>

      {hasNextPage ? (
        <Link href={`${basePath}?page=${page + 1}`} className={reviewLinkClass()}>
          Sau
          <Icon name="arrow" className="h-4 w-4" />
        </Link>
      ) : (
        <span className={reviewLinkClass(true)} aria-disabled="true">
          Sau
          <Icon name="arrow" className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}

export interface ListingReviewsPageProps {
  readonly listingId: string;
  readonly page?: number;
}

export function ListingReviewsPage({ listingId, page = 1 }: ListingReviewsPageProps) {
  const parsedListingId = parseListingId(listingId);
  const currentPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const { status: authStatus, user } = useAuth();
  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [reviews, setReviews] = useState<ApiPage<PublicListingReview> | null>(null);
  const [status, setStatus] = useState<PageStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("Không thể tải trang đánh giá lúc này.");
  const [retryKey, setRetryKey] = useState(0);
  const [eligibleInquiryId, setEligibleInquiryId] = useState<number | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null);
  const [reportReviewId, setReportReviewId] = useState<number | null>(null);
  const reviewTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (parsedListingId === null) return;

    const controller = new AbortController();
    setStatus("loading");
    setListing(null);
    setReviews(null);
    void Promise.all([
      api.listings.getPublicDetail(parsedListingId, controller.signal),
      api.listings.listReviews(parsedListingId, { page: currentPage, pageSize: reviewPageSize }, controller.signal)
    ])
      .then(([listingDetail, reviewPage]) => {
        if (controller.signal.aborted) return;
        setListing(listingDetail);
        setReviews(reviewPage);
        setStatus("success");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          caught instanceof ApiError && caught.status === 404
            ? "Tin đăng không tồn tại hoặc không còn công khai."
            : "Không thể tải trang đánh giá lúc này."
        );
        setStatus("error");
      });

    return () => controller.abort();
  }, [currentPage, parsedListingId, retryKey]);

  useEffect(() => {
    if (parsedListingId === null || authStatus !== "authenticated" || user?.role !== "TENANT") {
      setEligibleInquiryId(null);
      return;
    }

    const controller = new AbortController();
    setEligibleInquiryId(null);
    void findEligibleReviewInquiry(parsedListingId, controller.signal)
      .then((inquiryId) => {
        if (!controller.signal.aborted) setEligibleInquiryId(inquiryId);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEligibleInquiryId(null);
      });

    return () => controller.abort();
  }, [authStatus, parsedListingId, user?.role]);

  if (parsedListingId === null) {
    return <ErrorState message="Tin đăng không hợp lệ." />;
  }

  const coverImage = listing?.images.slice().sort((left, right) => left.displayOrder - right.displayOrder)[0] ?? null;
  const markReported = (reviewId: number) => {
    setReviews(
      (current) =>
        current && {
          ...current,
          data: current.data.map((review) => (review.id === reviewId ? { ...review, hasReported: true } : review))
        }
    );
    setReportReviewId(null);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-2 sm:space-y-8 sm:py-4">
      <Link
        href={`/listings/${parsedListingId}`}
        className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary-hover underline decoration-2 underline-offset-4"
      >
        <Icon name="arrow" className="h-4 w-4 rotate-180" />
        Quay lại tin đăng
      </Link>

      {status === "loading" ? <LoadingState className="min-h-32" message="Đang tải thông tin đánh giá…" /> : null}

      {status === "error" ? (
        <ErrorState
          message={errorMessage}
          action={<Button onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button>}
        />
      ) : null}

      {listing && status !== "error" ? (
        <>
          <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              {coverImage ? (
                <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-card border border-border bg-surface-subtle">
                  <MediaImage
                    src={coverImage.url}
                    alt={coverImage.altText ?? `Ảnh của ${listing.title}`}
                    fill
                    sizes="112px"
                  />
                </div>
              ) : null}
              <div className="min-w-0">
                <span className="rm-eyebrow inline-flex items-center gap-2">
                  <Icon name="star" className="h-4 w-4" /> ĐÁNH GIÁ ĐÃ DUYỆT
                </span>
                <h1 className="mt-2 truncate font-display text-3xl font-bold tracking-tight">Đánh giá tin đăng</h1>
                <Link
                  href={`/listings/${parsedListingId}`}
                  className="mt-2 block truncate text-ui-sm font-semibold text-primary-hover hover:underline"
                >
                  {listing.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ListingPrice monthlyRent={listing.monthlyRent} />
                  <span className="inline-flex items-center gap-1 text-ui-xs font-semibold text-muted-foreground">
                    <Icon name="pin" className="h-3.5 w-3.5" /> {listing.areaName}
                  </span>
                </div>
              </div>
            </div>
            <p className="max-w-md text-ui-sm leading-6 text-muted-foreground">
              Các đánh giá đã được duyệt từ người thuê có tương tác hợp lệ với tin đăng.
            </p>
          </header>

          {reviewFeedback ? (
            <p
              role="status"
              className="rounded-control border border-success/30 bg-success-subtle p-3 text-sm font-semibold text-success-foreground"
            >
              {reviewFeedback}
            </p>
          ) : null}

          {eligibleInquiryId !== null ? (
            <section className="flex flex-col gap-3 rounded-card border border-border bg-surface-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-lg font-bold">Bạn đã có trải nghiệm với tin đăng này?</h2>
                <p className="mt-1 text-ui-sm text-muted-foreground">
                  Chia sẻ nhận xét để giúp người thuê khác tham khảo.
                </p>
              </div>
              <Button ref={reviewTriggerRef} onClick={() => setReviewDialogOpen(true)} className="shrink-0">
                <Icon name="star" className="h-4 w-4" />
                Viết đánh giá
              </Button>
            </section>
          ) : null}

          <section aria-labelledby="all-reviews-heading" aria-busy={status === "loading"}>
            <h2 id="all-reviews-heading" className="sr-only">
              Danh sách đánh giá
            </h2>

            {status === "success" && reviews?.data.length === 0 ? (
              <EmptyState
                className="!items-start !text-left"
                visual={<Icon name="star" className="h-8 w-8" />}
                title="Chưa có đánh giá được duyệt cho tin đăng này."
                description="Các đánh giá hợp lệ sẽ xuất hiện tại đây."
              />
            ) : null}

            {status === "success" && reviews && reviews.data.length > 0 ? (
              <div className="divide-y divide-border rounded-card border border-border bg-surface px-5 sm:px-6">
                {reviews.data.map((review) => (
                  <PublicReviewRow key={review.id} review={review} onRequestReport={setReportReviewId} />
                ))}
              </div>
            ) : null}

            {status === "success" && reviews ? (
              <div className="mt-5">
                <ReviewPagination
                  listingId={parsedListingId}
                  page={reviews.pagination.page}
                  hasNextPage={reviews.pagination.hasNextPage}
                />
              </div>
            ) : null}
          </section>

          {eligibleInquiryId !== null ? (
            <Dialog
              open={reviewDialogOpen}
              title="Viết đánh giá"
              description="Đánh giá sẽ được kiểm duyệt trước khi xuất hiện công khai và không hiển thị danh tính của bạn."
              triggerRef={reviewTriggerRef}
              onClose={() => setReviewDialogOpen(false)}
              closeLabel="Đóng biểu mẫu đánh giá"
            >
              <TenantReviewPanel
                inquiryId={eligibleInquiryId}
                variant="dialog"
                onCancel={() => setReviewDialogOpen(false)}
                onSubmitted={() => {
                  setReviewDialogOpen(false);
                  setReviewFeedback("Đánh giá đã được gửi và đang chờ duyệt.");
                  setEligibleInquiryId(null);
                }}
              />
            </Dialog>
          ) : null}
          <ReviewReportDialog
            reviewId={reportReviewId}
            open={reportReviewId !== null}
            onClose={() => setReportReviewId(null)}
            onReported={markReported}
          />
        </>
      ) : null}
    </div>
  );
}
