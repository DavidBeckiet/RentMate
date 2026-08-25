import { normalizeControlledCode } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePagination, parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateJsonText } from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

export const reviewStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];
export const reviewReportCategories = ["INACCURATE", "OFFENSIVE", "HARASSMENT", "SPAM", "OTHER"] as const;
export const reviewReportStatuses = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"] as const;
export type ReviewReportCategory = (typeof reviewReportCategories)[number];
export type ReviewReportStatus = (typeof reviewReportStatuses)[number];

export interface CreateReviewInput {
  readonly overallRating: number;
  readonly accuracyRating: number;
  readonly responsivenessRating: number;
  readonly comment: string;
}
export interface ModerateReviewInput {
  readonly status: Exclude<ReviewStatus, "PENDING">;
  readonly note: string;
}
export interface ReviewCollectionQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}
export interface AdminReviewCollectionQuery extends ReviewCollectionQuery {
  readonly status: ReviewStatus;
}

export interface CreateReviewReportInput {
  readonly category: ReviewReportCategory;
  readonly details: string | null;
}

export interface UpdateReviewReportStatusInput {
  readonly status: Exclude<ReviewReportStatus, "OPEN">;
  readonly note: string | null;
}

export interface ReviewReportCollectionQuery {
  readonly status: ReviewReportStatus;
  readonly category: ReviewReportCategory | null;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

function rating(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} must be an integer from 1 to 5.`);
  }
  return value as number;
}
function pagination(value: unknown, allowed: readonly string[]): ReviewCollectionQuery {
  const query = validateQueryKeys(value, allowed);
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({ page, pageSize, offset });
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  const text = validateJsonText(value, field, { maximumLength: 2_000, nullable: false, nonblank: true }) as string;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} contains unsupported control characters.`);
  }
  return text;
}

export function validateCreateReviewBody(value: unknown): CreateReviewInput {
  const body = validateBodyFields(value, ["overallRating", "accuracyRating", "responsivenessRating", "comment"]);
  for (const field of ["overallRating", "accuracyRating", "responsivenessRating", "comment"] as const) {
    if (!(field in body)) throwValidationIssue(field, "REQUIRED", `${field} is required.`);
  }
  const comment = validateJsonText(body.comment, "comment", {
    maximumLength: 2_000,
    nullable: false,
    nonblank: true
  }) as string;
  if ([...comment].length < 20) {
    throwValidationIssue("comment", "OUT_OF_RANGE", "comment must contain at least 20 characters.");
  }
  return Object.freeze({
    overallRating: rating(body.overallRating, "overallRating"),
    accuracyRating: rating(body.accuracyRating, "accuracyRating"),
    responsivenessRating: rating(body.responsivenessRating, "responsivenessRating"),
    comment
  });
}

export function validateModerateReviewBody(value: unknown): ModerateReviewInput {
  const body = validateBodyFields(value, ["status", "note"]);
  if (!("status" in body)) throwValidationIssue("status", "REQUIRED", "status is required.");
  if (!("note" in body)) throwValidationIssue("note", "REQUIRED", "note is required.");
  const status = normalizeControlledCode(body.status, "status", ["APPROVED", "REJECTED"] as const) as Exclude<
    ReviewStatus,
    "PENDING"
  >;
  const note = validateJsonText(body.note, "note", {
    maximumLength: 1_000,
    nullable: false,
    nonblank: true
  }) as string;
  return Object.freeze({ status, note });
}

export function validatePublicReviewQuery(value: unknown): ReviewCollectionQuery {
  return pagination(value, ["page", "pageSize"]);
}
export function validateAdminReviewQuery(value: unknown): AdminReviewCollectionQuery {
  const query = validateQueryKeys(value, ["status", "page", "pageSize"]);
  const status = normalizeControlledCode(
    readScalarQueryValue(query.status, "status") ?? "PENDING",
    "status",
    reviewStatuses
  ) as ReviewStatus;
  const pageData = pagination(query, ["status", "page", "pageSize"]);
  return Object.freeze({ ...pageData, status });
}

export function validateCreateReviewReportBody(value: unknown): CreateReviewReportInput {
  const body = validateBodyFields(value, ["category", "details"]);
  if (!("category" in body)) throwValidationIssue("category", "REQUIRED", "category is required.");
  return Object.freeze({
    category: normalizeControlledCode(body.category, "category", reviewReportCategories) as ReviewReportCategory,
    details: optionalText(body.details, "details")
  });
}

export function validateUpdateReviewReportStatusBody(value: unknown): UpdateReviewReportStatusInput {
  const body = validateBodyFields(value, ["status", "note"]);
  if (!("status" in body)) throwValidationIssue("status", "REQUIRED", "status is required.");
  const status = normalizeControlledCode(body.status, "status", reviewReportStatuses.slice(1)) as Exclude<
    ReviewReportStatus,
    "OPEN"
  >;
  const note = optionalText(body.note, "note");
  if ((status === "RESOLVED" || status === "DISMISSED") && note === null) {
    throwValidationIssue("note", "REQUIRED", "note is required for a terminal review report status.");
  }
  return Object.freeze({ status, note });
}

export function validateReviewReportCollectionQuery(value: unknown): ReviewReportCollectionQuery {
  const query = validateQueryKeys(value, ["status", "category", "page", "pageSize"]);
  const status = normalizeControlledCode(
    readScalarQueryValue(query.status, "status") ?? "OPEN",
    "status",
    reviewReportStatuses
  ) as ReviewReportStatus;
  const categoryValue = readScalarQueryValue(query.category, "category");
  const category =
    categoryValue === undefined
      ? null
      : (normalizeControlledCode(categoryValue, "category", reviewReportCategories) as ReviewReportCategory);
  const pageData = pagination(query, ["status", "category", "page", "pageSize"]);
  return Object.freeze({ ...pageData, status, category });
}
export function parseReviewId(value: string | string[], field = "reviewId"): number {
  if (typeof value !== "string") throwValidationIssue(field, "INVALID_TYPE", `${field} must be provided exactly once.`);
  return parsePathId(value, field);
}
