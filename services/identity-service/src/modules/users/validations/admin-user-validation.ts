import type { UserRole } from "../../../../../shared/src/runtime/shared/types/authentication.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { normalizeControlledCode } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { parsePagination, parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

const userRoles = ["TENANT", "LANDLORD", "ADMIN"] as const satisfies readonly UserRole[];
const collectionQueryKeys = ["q", "role", "isActive", "page", "pageSize"] as const;
const maximumSearchLength = 320;
const controlCharacterPattern = /\p{Cc}/u;
const nonScalarPattern = /[\uD800-\uDFFF]/u;

export interface AdminUserCollectionQuery {
  readonly q: string | null;
  readonly userId: number | null;
  readonly role: UserRole | null;
  readonly isActive: boolean | null;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export interface AdminUserActivationInput {
  readonly isActive: boolean;
}

function checkedPagination(
  query: Readonly<Record<string, unknown>>
): Pick<AdminUserCollectionQuery, "page" | "pageSize" | "offset"> {
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(pageSize + 1)) {
    throwValidationIssue("page", "OUT_OF_RANGE", "page produces an offset outside the allowed range.");
  }
  return Object.freeze({ page, pageSize, offset });
}

function parseRole(value: unknown): UserRole | null {
  const scalar = readScalarQueryValue(value, "role");
  if (scalar === undefined) return null;
  return normalizeControlledCode(scalar, "role", userRoles) as UserRole;
}

function parseIsActive(value: unknown): boolean | null {
  const scalar = readScalarQueryValue(value, "isActive");
  if (scalar === undefined) return null;
  if (scalar === "true") return true;
  if (scalar === "false") return false;
  throwValidationIssue("isActive", "INVALID_VALUE", "isActive must be either true or false.");
}

function parseSearch(value: unknown): Pick<AdminUserCollectionQuery, "q" | "userId"> {
  const scalar = readScalarQueryValue(value, "q");
  if (scalar === undefined) return Object.freeze({ q: null, userId: null });
  if (nonScalarPattern.test(scalar)) {
    throwValidationIssue("q", "INVALID_VALUE", "q must contain valid Unicode scalar values.");
  }

  const normalized = scalar.normalize("NFC").trim();
  if (!normalized) return Object.freeze({ q: null, userId: null });
  if (controlCharacterPattern.test(normalized)) {
    throwValidationIssue("q", "INVALID_VALUE", "q must not contain control characters.");
  }
  if ([...normalized].length > maximumSearchLength) {
    throwValidationIssue("q", "TOO_LONG", `q must not exceed ${maximumSearchLength} Unicode code points.`);
  }

  const numericId = /^[1-9][0-9]*$/.test(normalized) ? Number(normalized) : Number.NaN;
  const userId = Number.isInteger(numericId) && numericId <= 2_147_483_647 ? numericId : null;
  return Object.freeze({ q: normalized, userId });
}

export function validateAdminUserCollectionQuery(value: unknown): AdminUserCollectionQuery {
  const query = validateQueryKeys(value, collectionQueryKeys);
  return Object.freeze({
    ...parseSearch(query.q),
    role: parseRole(query.role),
    isActive: parseIsActive(query.isActive),
    ...checkedPagination(query)
  });
}

export function validateAdminUserReadBody(value: unknown): void {
  if (value !== undefined) {
    throwValidationIssue("body", "INVALID_VALUE", "body must be omitted.");
  }
}

export function validateAdminUserActivationQuery(value: unknown): void {
  validateQueryKeys(value, []);
}

export function validateAdminUserDetailQuery(value: unknown): void {
  validateQueryKeys(value, []);
}

export function parseAdminUserId(value: string | string[]): number {
  if (typeof value !== "string") {
    throwValidationIssue("userId", "INVALID_TYPE", "userId must be provided exactly once.");
  }
  return parsePathId(value, "userId");
}

export function validateAdminUserActivationBody(value: unknown): AdminUserActivationInput {
  const body = validateBodyFields(value, ["isActive"]);
  if (!("isActive" in body)) {
    throwValidationIssue("isActive", "REQUIRED", "isActive is required.");
  }
  if (typeof body.isActive !== "boolean") {
    throwValidationIssue("isActive", "INVALID_TYPE", "isActive must be a boolean.");
  }
  return Object.freeze({ isActive: body.isActive });
}
