import type { ListingBusinessStatus, ListingStatus, OwnedListingQuery } from "../../types/api";

export const ownerListingStatuses = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "HIDDEN", "INACTIVE"] as const;
export const ownerBusinessStatuses = ["AVAILABLE", "PAUSED", "RENTED", "UNKNOWN"] as const;
export const ownerDefaultPageSize = 6;

export interface OwnerQueryState {
  readonly status?: ListingStatus;
  readonly businessStatus?: ListingBusinessStatus;
  readonly page: number;
  readonly pageSize?: number;
}

export type ParsedOwnerQuery =
  | { readonly ok: true; readonly state: OwnerQueryState }
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

function listingStatus(value: string | undefined): ListingStatus | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toUpperCase();
  return ownerListingStatuses.includes(normalized as ListingStatus) ? (normalized as ListingStatus) : undefined;
}

function businessStatus(value: string | undefined): ListingBusinessStatus | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toUpperCase();
  return ownerBusinessStatuses.includes(normalized as ListingBusinessStatus)
    ? (normalized as ListingBusinessStatus)
    : undefined;
}

export function parseOwnerQuery(parameters: URLSearchParams): ParsedOwnerQuery {
  try {
    const rawStatus = scalar(parameters, "status");
    const status = listingStatus(rawStatus);
    if (rawStatus !== undefined && status === undefined) throw new Error("invalid");
    const rawBusinessStatus = scalar(parameters, "businessStatus");
    const parsedBusinessStatus = businessStatus(rawBusinessStatus);
    if (rawBusinessStatus !== undefined && parsedBusinessStatus === undefined) throw new Error("invalid");
    const pageSize = positiveInteger(scalar(parameters, "pageSize"), 100);
    return {
      ok: true,
      state: {
        ...(status === undefined ? {} : { status }),
        ...(parsedBusinessStatus === undefined ? {} : { businessStatus: parsedBusinessStatus }),
        page: positiveInteger(scalar(parameters, "page")) ?? 1,
        ...(pageSize === undefined ? {} : { pageSize })
      }
    };
  } catch {
    return { ok: false, message: "Liên kết quản lý tin đăng không hợp lệ." };
  }
}

export function serializeOwnerQuery(state: OwnerQueryState): URLSearchParams {
  const parameters = new URLSearchParams();
  if (state.status !== undefined) parameters.set("status", state.status);
  if (state.businessStatus !== undefined) parameters.set("businessStatus", state.businessStatus);
  if (state.page > 1) parameters.set("page", String(state.page));
  if (state.pageSize !== undefined) parameters.set("pageSize", String(state.pageSize));
  return parameters;
}

export function ownerListingsUrl(state: OwnerQueryState): string {
  const query = serializeOwnerQuery(state).toString();
  return query ? `/landlord?${query}` : "/landlord";
}

export function withOwnerStatus(state: OwnerQueryState, status?: ListingStatus): OwnerQueryState {
  return {
    ...(status === undefined ? {} : { status }),
    ...(state.businessStatus === undefined ? {} : { businessStatus: state.businessStatus }),
    page: 1,
    ...(state.pageSize === undefined ? {} : { pageSize: state.pageSize })
  };
}

export function withOwnerBusinessStatus(
  state: OwnerQueryState,
  businessStatusValue?: ListingBusinessStatus
): OwnerQueryState {
  return {
    ...(state.status === undefined ? {} : { status: state.status }),
    ...(businessStatusValue === undefined ? {} : { businessStatus: businessStatusValue }),
    page: 1,
    ...(state.pageSize === undefined ? {} : { pageSize: state.pageSize })
  };
}

export function withOwnerPage(state: OwnerQueryState, page: number): OwnerQueryState {
  return { ...state, page };
}

export function toOwnedListingQuery(state: OwnerQueryState): OwnedListingQuery {
  return {
    ...(state.status === undefined ? {} : { status: state.status }),
    ...(state.businessStatus === undefined ? {} : { businessStatus: state.businessStatus }),
    page: state.page,
    pageSize: state.pageSize ?? ownerDefaultPageSize
  };
}
