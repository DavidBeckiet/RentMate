import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePagination } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { readScalarQueryValue, validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import { isListingStatus, type ListingStatus } from "../mappers/owner-listing-mapper.js";

const collectionQueryKeys = ["status", "page", "pageSize"] as const;

export interface OwnerListingCollectionQuery {
  readonly status: ListingStatus | null;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

function parseStatus(value: unknown): ListingStatus | null {
  const scalar = readScalarQueryValue(value, "status");
  if (scalar === undefined) {
    return null;
  }

  const normalized = scalar.trim().toUpperCase();
  if (!isListingStatus(normalized)) {
    throwValidationIssue("status", "INVALID_VALUE", "status must be a valid listing status.");
  }

  return normalized;
}

export function validateOwnerListingCollectionQuery(value: unknown): OwnerListingCollectionQuery {
  const query = validateQueryKeys(value, collectionQueryKeys);
  const status = parseStatus(query.status);
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;

  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(pageSize + 1)) {
    throwValidationIssue("page", "OUT_OF_RANGE", "page produces an offset outside the allowed range.");
  }

  return Object.freeze({ status, page, pageSize, offset });
}

export function validateOwnerListingReadBody(value: unknown): void {
  if (value !== undefined) {
    throwValidationIssue("body", "INVALID_VALUE", "body must be omitted.");
  }
}
