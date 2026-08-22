import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePagination, parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { readScalarQueryValue, validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import { isListingStatus, type ListingStatus } from "../mappers/owner-listing-mapper.js";

const collectionQueryKeys = ["status", "page", "pageSize"] as const;
const historyQueryKeys = ["page", "pageSize"] as const;

interface PaginatedAdminReadQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export interface AdminListingCollectionQuery extends PaginatedAdminReadQuery {
  readonly status: ListingStatus;
}

export type AdminModerationHistoryQuery = PaginatedAdminReadQuery;

function checkedPagination(query: Readonly<Record<string, unknown>>): PaginatedAdminReadQuery {
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(pageSize + 1)) {
    throwValidationIssue("page", "OUT_OF_RANGE", "page produces an offset outside the allowed range.");
  }
  return Object.freeze({ page, pageSize, offset });
}

function parseStatus(value: unknown): ListingStatus {
  const scalar = readScalarQueryValue(value, "status");
  if (scalar === undefined) return "PENDING";
  const normalized = scalar.trim().toUpperCase();
  if (!isListingStatus(normalized)) {
    throwValidationIssue("status", "INVALID_VALUE", "status must be a valid listing status.");
  }
  return normalized;
}

export function validateAdminListingCollectionQuery(value: unknown): AdminListingCollectionQuery {
  const query = validateQueryKeys(value, collectionQueryKeys);
  return Object.freeze({ status: parseStatus(query.status), ...checkedPagination(query) });
}

export function validateAdminModerationHistoryQuery(value: unknown): AdminModerationHistoryQuery {
  return checkedPagination(validateQueryKeys(value, historyQueryKeys));
}

export function validateAdminDetailQuery(value: unknown): void {
  validateQueryKeys(value, []);
}

export function validateAdminReadBody(value: unknown): void {
  if (value !== undefined) {
    throwValidationIssue("body", "INVALID_VALUE", "body must be omitted.");
  }
}

export function parseAdminListingId(value: string | string[]): number {
  if (typeof value !== "string") {
    throwValidationIssue("listingId", "INVALID_TYPE", "listingId must be provided exactly once.");
  }
  return parsePathId(value, "listingId");
}
