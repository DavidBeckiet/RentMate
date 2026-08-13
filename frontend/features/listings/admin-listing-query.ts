import type { AdminListingQuery, ListingStatus } from "../../types/api";

export const adminListingStatuses = ["PENDING", "APPROVED", "REJECTED", "HIDDEN", "DRAFT", "INACTIVE"] as const;

export interface AdminListingQueryState {
  readonly status: ListingStatus;
  readonly page: number;
  readonly pageSize?: number;
}

export type ParsedAdminListingQuery =
  | { readonly ok: true; readonly state: AdminListingQueryState }
  | { readonly ok: false; readonly message: string };

function scalar(parameters: URLSearchParams, key: string): string | undefined {
  const values = parameters.getAll(key);
  if (values.length > 1) throw new Error("duplicate");
  return values[0];
}

function positiveInteger(value: string | undefined, maximum?: number): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("invalid");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum)) throw new Error("invalid");
  return parsed;
}

function statusValue(value: string | undefined): ListingStatus {
  if (value === undefined) return "PENDING";
  const normalized = value.trim().toUpperCase();
  if (!adminListingStatuses.includes(normalized as ListingStatus)) throw new Error("invalid");
  return normalized as ListingStatus;
}

export function parseAdminListingQuery(parameters: URLSearchParams): ParsedAdminListingQuery {
  try {
    const pageSize = positiveInteger(scalar(parameters, "pageSize"), 100);
    return {
      ok: true,
      state: {
        status: statusValue(scalar(parameters, "status")),
        page: positiveInteger(scalar(parameters, "page")) ?? 1,
        ...(pageSize === undefined ? {} : { pageSize })
      }
    };
  } catch {
    return { ok: false, message: "Liên kết hàng đợi kiểm duyệt không hợp lệ." };
  }
}

export function serializeAdminListingQuery(state: AdminListingQueryState): URLSearchParams {
  const parameters = new URLSearchParams();
  if (state.status !== "PENDING") parameters.set("status", state.status);
  if (state.page > 1) parameters.set("page", String(state.page));
  if (state.pageSize !== undefined) parameters.set("pageSize", String(state.pageSize));
  return parameters;
}

export function adminListingsUrl(state: AdminListingQueryState): string {
  const query = serializeAdminListingQuery(state).toString();
  return query ? `/admin?${query}` : "/admin";
}

export function withAdminListingStatus(state: AdminListingQueryState, status: ListingStatus): AdminListingQueryState {
  return { status, page: 1, ...(state.pageSize === undefined ? {} : { pageSize: state.pageSize }) };
}

export function withAdminListingPage(state: AdminListingQueryState, page: number): AdminListingQueryState {
  return { ...state, page };
}

export function toAdminListingQuery(state: AdminListingQueryState): AdminListingQuery {
  return {
    status: state.status,
    page: state.page,
    ...(state.pageSize === undefined ? {} : { pageSize: state.pageSize })
  };
}
