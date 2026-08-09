import { throwValidationIssue } from "../../shared/validation/issues.js";
import { parsePagination, parsePathId } from "../../shared/validation/parsing.js";
import { validateQueryKeys } from "../../shared/validation/request.js";

const collectionQueryKeys = ["page", "pageSize"] as const;

export interface FavoriteCollectionQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export function validateFavoriteCollectionQuery(value: unknown): FavoriteCollectionQuery {
  const query = validateQueryKeys(value, collectionQueryKeys);
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;

  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(pageSize + 1)) {
    throwValidationIssue("page", "OUT_OF_RANGE", "page produces an offset outside the allowed range.");
  }

  return Object.freeze({ page, pageSize, offset });
}

export function parseFavoriteListingId(value: string | string[]): number {
  if (typeof value !== "string") {
    throwValidationIssue("listingId", "INVALID_TYPE", "listingId must be provided exactly once.");
  }
  return parsePathId(value, "listingId");
}

export function validateFavoriteMutationQuery(value: unknown): void {
  validateQueryKeys(value, []);
}

export function validateFavoriteBody(value: unknown): void {
  if (value !== undefined) {
    throwValidationIssue("body", "INVALID_VALUE", "body must be omitted.");
  }
}
