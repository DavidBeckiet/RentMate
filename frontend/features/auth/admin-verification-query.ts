import type { VerificationQuery, VerificationStatus } from "../../types/api";

export const adminVerificationStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;

export interface AdminVerificationQueryState {
  readonly status: VerificationStatus;
  readonly page: number;
  readonly pageSize: number;
}

export type ParsedAdminVerificationQuery =
  | { readonly ok: true; readonly state: AdminVerificationQueryState }
  | { readonly ok: false; readonly message: string };

function scalar(parameters: URLSearchParams, key: string): string | undefined {
  const values = parameters.getAll(key);
  if (values.length > 1) throw new Error("duplicate");
  return values[0];
}

function positiveInteger(value: string | undefined, fallback: number, maximum?: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("invalid");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum)) throw new Error("invalid");
  return parsed;
}

function verificationStatus(value: string | undefined): VerificationStatus {
  if (value === undefined) return "PENDING";
  const normalized = value.trim().toUpperCase();
  if (!adminVerificationStatuses.some((status) => status === normalized)) throw new Error("invalid");
  return normalized as VerificationStatus;
}

export function parseAdminVerificationQuery(parameters: URLSearchParams): ParsedAdminVerificationQuery {
  try {
    return {
      ok: true,
      state: {
        status: verificationStatus(scalar(parameters, "status")),
        page: positiveInteger(scalar(parameters, "page"), 1),
        pageSize: positiveInteger(scalar(parameters, "pageSize"), 20, 100)
      }
    };
  } catch {
    return { ok: false, message: "Liên kết hàng đợi xác minh không hợp lệ." };
  }
}

export function adminVerificationsUrl(state: AdminVerificationQueryState): string {
  const parameters = new URLSearchParams();
  if (state.status !== "PENDING") parameters.set("status", state.status);
  if (state.page > 1) parameters.set("page", String(state.page));
  if (state.pageSize !== 20) parameters.set("pageSize", String(state.pageSize));
  const query = parameters.toString();
  return query ? `/admin/verifications?${query}` : "/admin/verifications";
}

function serializeAdminVerificationReturnQuery(state: AdminVerificationQueryState): URLSearchParams {
  const parameters = new URLSearchParams();
  parameters.set("returnStatus", state.status);
  parameters.set("returnPage", String(state.page));
  parameters.set("returnPageSize", String(state.pageSize));
  return parameters;
}

export function adminVerificationDetailUrl(verificationId: number, state: AdminVerificationQueryState): string {
  return `/admin/verifications/${verificationId}?${serializeAdminVerificationReturnQuery(state).toString()}`;
}

export function parseAdminVerificationReturnQuery(parameters: URLSearchParams): AdminVerificationQueryState | null {
  try {
    return {
      status: verificationStatus(scalar(parameters, "returnStatus")),
      page: positiveInteger(scalar(parameters, "returnPage"), 1),
      pageSize: positiveInteger(scalar(parameters, "returnPageSize"), 20, 100)
    };
  } catch {
    return null;
  }
}

export function adminVerificationReturnUrl(parameters: URLSearchParams): string {
  const state = parseAdminVerificationReturnQuery(parameters);
  return state ? adminVerificationsUrl(state) : "/admin/verifications";
}

export function withAdminVerificationStatus(
  state: AdminVerificationQueryState,
  status: VerificationStatus
): AdminVerificationQueryState {
  return { ...state, status, page: 1 };
}

export function withAdminVerificationPage(
  state: AdminVerificationQueryState,
  page: number
): AdminVerificationQueryState {
  return { ...state, page };
}

export function toVerificationQuery(state: AdminVerificationQueryState): VerificationQuery {
  return { status: state.status, page: state.page, pageSize: state.pageSize };
}
