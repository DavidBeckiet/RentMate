import type { AdminReviewQuery, ReviewStatus } from "../../types/api";

export const reviewStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ReviewQueueStatus = (typeof reviewStatuses)[number];

export interface AdminReviewQueueState {
  readonly status: ReviewQueueStatus;
  readonly page: number;
  readonly pageSize: number;
}

const defaultState: AdminReviewQueueState = Object.freeze({ status: "PENDING", page: 1, pageSize: 20 });

export const reviewStatusLabels: Readonly<Record<ReviewStatus, string>> = Object.freeze({
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối"
});

function scalar(parameters: URLSearchParams, key: string): string | undefined {
  const values = parameters.getAll(key);
  return values.length === 1 ? values[0] : undefined;
}

function positiveInteger(value: string | undefined, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!value || !/^[1-9][0-9]*$/u.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : fallback;
}

function statusValue(value: string | undefined): ReviewQueueStatus {
  const normalized = value?.trim().toUpperCase();
  return reviewStatuses.includes(normalized as ReviewQueueStatus)
    ? (normalized as ReviewQueueStatus)
    : defaultState.status;
}

export function parseAdminReviewQueueQuery(parameters: URLSearchParams): AdminReviewQueueState {
  return Object.freeze({
    status: statusValue(scalar(parameters, "status")),
    page: positiveInteger(scalar(parameters, "page"), defaultState.page),
    pageSize: positiveInteger(scalar(parameters, "pageSize"), defaultState.pageSize, 100)
  });
}

export function reviewQueueUrl(state: AdminReviewQueueState): string {
  const parameters = new URLSearchParams();
  if (state.status !== defaultState.status) parameters.set("status", state.status);
  if (state.page !== defaultState.page) parameters.set("page", String(state.page));
  if (state.pageSize !== defaultState.pageSize) parameters.set("pageSize", String(state.pageSize));
  const query = parameters.toString();
  return query ? `/admin/reviews?${query}` : "/admin/reviews";
}

export function reviewDetailUrl(reviewId: number, state: AdminReviewQueueState): string {
  return `/admin/reviews/${reviewId}?${new URLSearchParams({
    returnStatus: state.status,
    returnPage: String(state.page),
    returnPageSize: String(state.pageSize)
  }).toString()}`;
}

export function reviewReturnUrl(parameters: URLSearchParams): string {
  return reviewQueueUrl(
    parseAdminReviewQueueQuery(
      new URLSearchParams({
        status: scalar(parameters, "returnStatus") ?? "",
        page: scalar(parameters, "returnPage") ?? "",
        pageSize: scalar(parameters, "returnPageSize") ?? ""
      })
    )
  );
}

export function reviewQuery(state: AdminReviewQueueState): AdminReviewQuery {
  return { status: state.status, page: state.page, pageSize: state.pageSize };
}
