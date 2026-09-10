import { normalizeControlledCode } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePagination, parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateJsonText } from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

export const verificationStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];

export interface CreateVerificationInput {
  readonly displayName: string;
  readonly note: string | null;
}
export interface ReviewVerificationInput {
  readonly status: Exclude<VerificationStatus, "PENDING">;
  readonly note: string;
}
export interface ConfirmEmailVerificationInput {
  readonly code: string;
}
export interface ConfirmPhoneVerificationInput {
  readonly code: string;
}
export interface VerificationCollectionQuery {
  readonly status: VerificationStatus;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

function optionalNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return validateJsonText(value, "note", { maximumLength: 1_000, nullable: false, nonblank: true }) as string;
}

export function validateCreateVerificationBody(value: unknown): CreateVerificationInput {
  const body = validateBodyFields(value, ["displayName", "note"]);
  if (!("displayName" in body)) throwValidationIssue("displayName", "REQUIRED", "displayName is required.");
  return Object.freeze({
    displayName: validateJsonText(body.displayName, "displayName", {
      maximumLength: 120,
      nullable: false,
      nonblank: true
    }) as string,
    note: optionalNote(body.note)
  });
}

export function validateReviewVerificationBody(value: unknown): ReviewVerificationInput {
  const body = validateBodyFields(value, ["status", "note"]);
  if (!("status" in body)) throwValidationIssue("status", "REQUIRED", "status is required.");
  if (!("note" in body)) throwValidationIssue("note", "REQUIRED", "note is required.");
  const status = normalizeControlledCode(body.status, "status", ["APPROVED", "REJECTED"] as const) as Exclude<
    VerificationStatus,
    "PENDING"
  >;
  const note = optionalNote(body.note);
  if (note === null) throwValidationIssue("note", "REQUIRED", "note is required for a verification decision.");
  return Object.freeze({ status, note });
}

export function validateConfirmEmailVerificationBody(value: unknown): ConfirmEmailVerificationInput {
  const body = validateBodyFields(value, ["code"]);
  if (!("code" in body)) throwValidationIssue("code", "REQUIRED", "code is required.");
  const code = validateJsonText(body.code, "code", {
    maximumLength: 6,
    nullable: false,
    nonblank: true
  }) as string;
  if (!/^\d{6}$/u.test(code)) {
    throwValidationIssue("code", "INVALID_VALUE", "code is invalid.");
  }
  return Object.freeze({ code });
}

export function validateConfirmPhoneVerificationBody(value: unknown): ConfirmPhoneVerificationInput {
  const body = validateBodyFields(value, ["code"]);
  if (!("code" in body)) throwValidationIssue("code", "REQUIRED", "code is required.");
  const code = validateJsonText(body.code, "code", {
    maximumLength: 6,
    nullable: false,
    nonblank: true,
    trim: false
  }) as string;
  if (!/^\d{6}$/u.test(code)) {
    throwValidationIssue("code", "INVALID_VALUE", "code must contain six digits.");
  }
  return Object.freeze({ code });
}

export function validateVerificationCollectionQuery(value: unknown): VerificationCollectionQuery {
  const query = validateQueryKeys(value, ["status", "page", "pageSize"]);
  const rawStatus = readScalarQueryValue(query.status, "status") ?? "PENDING";
  const status = normalizeControlledCode(rawStatus, "status", verificationStatuses) as VerificationStatus;
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({ status, page, pageSize, offset });
}

export function parseVerificationId(value: string | string[]): number {
  if (typeof value !== "string") {
    throwValidationIssue("verificationId", "INVALID_TYPE", "verificationId must be provided exactly once.");
  }
  return parsePathId(value, "verificationId");
}
