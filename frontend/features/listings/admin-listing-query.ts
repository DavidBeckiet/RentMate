import type { AdminListingQuery, ListingStatus } from "../../types/api";

export const adminListingStatuses = ["PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const;

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
  if (!adminListingStatuses.some((status) => status === normalized)) throw new Error("invalid");
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
  return query ? `/admin/listings?${query}` : "/admin/listings";
}

export type LegacyAdminListingSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

/**
 * Carries only the former queue parameters from /admin to its canonical route.
 * Values intentionally remain unparsed here so the existing queue validator can
 * still surface malformed legacy links instead of silently changing their state.
 */
export function legacyAdminListingsUrl(searchParams: LegacyAdminListingSearchParams): string | null {
  const parameters = new URLSearchParams();
  let hasQueueParameter = false;

  for (const key of ["status", "page", "pageSize"] as const) {
    const value = searchParams[key];
    if (value === undefined) continue;
    hasQueueParameter = true;
    const values = typeof value === "string" ? [value] : value;
    values.forEach((entry) => parameters.append(key, entry));
  }

  if (!hasQueueParameter) return null;
  const query = parameters.toString();
  return query ? `/admin/listings?${query}` : "/admin/listings";
}

function serializeAdminListingReturnQuery(state: AdminListingQueryState): URLSearchParams {
  const parameters = new URLSearchParams();
  if (state.status !== "PENDING") parameters.set("returnStatus", state.status);
  if (state.page > 1) parameters.set("returnPage", String(state.page));
  if (state.pageSize !== undefined) parameters.set("returnPageSize", String(state.pageSize));
  return parameters;
}

export function adminListingDetailUrl(listingId: number, state: AdminListingQueryState): string {
  const query = serializeAdminListingReturnQuery(state).toString();
  return `/admin/listings/${listingId}${query ? `?${query}` : ""}`;
}

export function parseAdminListingReturnQuery(parameters: URLSearchParams): AdminListingQueryState | null {
  try {
    const pageSize = positiveInteger(scalar(parameters, "returnPageSize"), 100);
    return {
      status: statusValue(scalar(parameters, "returnStatus")),
      page: positiveInteger(scalar(parameters, "returnPage")) ?? 1,
      ...(pageSize === undefined ? {} : { pageSize })
    };
  } catch {
    return null;
  }
}

export function adminListingReturnUrl(parameters: URLSearchParams): string {
  const state = parseAdminListingReturnQuery(parameters);
  return state ? adminListingsUrl(state) : "/admin/listings";
}

export function appendAdminListingReturnQuery(target: URLSearchParams, source: URLSearchParams): void {
  const state = parseAdminListingReturnQuery(source);
  if (!state) return;
  serializeAdminListingReturnQuery(state).forEach((value, key) => target.set(key, value));
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
