import type { SupportRequestCategory, SupportRequestStatus, UserRole } from "../../types/api";

export const supportRequestStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;

export interface SupportRequestQueueState {
  readonly status: SupportRequestStatus;
  readonly page: number;
  readonly pageSize: number;
}

const defaultQueueState: SupportRequestQueueState = Object.freeze({ status: "OPEN", page: 1, pageSize: 20 });

export const supportRequestStatusLabels: Readonly<Record<SupportRequestStatus, string>> = Object.freeze({
  OPEN: "Mới",
  IN_PROGRESS: "Đang xem xét",
  RESOLVED: "Đã kết thúc"
});

export const supportRequestCategoryLabels: Readonly<Record<SupportRequestCategory, string>> = Object.freeze({
  ACCOUNT: "Tài khoản",
  LISTING: "Tin đăng",
  SAFETY: "An toàn và báo cáo",
  TECHNICAL: "Lỗi kỹ thuật",
  OTHER: "Vấn đề khác"
});

export const supportRequesterRoleLabels: Readonly<Record<UserRole, string>> = Object.freeze({
  TENANT: "Người thuê",
  LANDLORD: "Chủ trọ",
  ADMIN: "Quản trị viên"
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

function statusValue(value: string | undefined): SupportRequestStatus {
  const normalized = value?.trim().toUpperCase();
  return supportRequestStatuses.includes(normalized as SupportRequestStatus)
    ? (normalized as SupportRequestStatus)
    : defaultQueueState.status;
}

export function parseSupportRequestQueueQuery(parameters: URLSearchParams): SupportRequestQueueState {
  return Object.freeze({
    status: statusValue(scalar(parameters, "status")),
    page: positiveInteger(scalar(parameters, "page"), defaultQueueState.page),
    pageSize: positiveInteger(scalar(parameters, "pageSize"), defaultQueueState.pageSize, 100)
  });
}

export function supportRequestQueueUrl(state: SupportRequestQueueState): string {
  const parameters = new URLSearchParams();
  if (state.status !== defaultQueueState.status) parameters.set("status", state.status);
  if (state.page !== defaultQueueState.page) parameters.set("page", String(state.page));
  if (state.pageSize !== defaultQueueState.pageSize) parameters.set("pageSize", String(state.pageSize));
  const query = parameters.toString();
  return query ? `/admin/support-requests?${query}` : "/admin/support-requests";
}

export function supportRequestDetailUrl(requestId: number, state: SupportRequestQueueState): string {
  const parameters = new URLSearchParams({
    returnStatus: state.status,
    returnPage: String(state.page),
    returnPageSize: String(state.pageSize)
  });
  return `/admin/support-requests/${requestId}?${parameters.toString()}`;
}

export function supportRequestReturnUrl(parameters: URLSearchParams): string {
  return supportRequestQueueUrl(
    parseSupportRequestQueueQuery(
      new URLSearchParams({
        status: scalar(parameters, "returnStatus") ?? "",
        page: scalar(parameters, "returnPage") ?? "",
        pageSize: scalar(parameters, "returnPageSize") ?? ""
      })
    )
  );
}
