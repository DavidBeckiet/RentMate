import { normalizeControlledCode } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePagination, parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateJsonText } from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

export const reportCategories = [
  "PRICE_INCORRECT",
  "LOCATION_INCORRECT",
  "IMAGE_INCORRECT",
  "ALREADY_RENTED",
  "FRAUD",
  "INAPPROPRIATE"
] as const;
export const reportStatuses = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"] as const;
export type ReportCategory = (typeof reportCategories)[number];
export type ReportStatus = (typeof reportStatuses)[number];

export interface CreateReportInput {
  readonly category: ReportCategory;
  readonly details: string | null;
}
export interface UpdateReportStatusInput {
  readonly status: Exclude<ReportStatus, "OPEN">;
  readonly note: string | null;
}
export interface ReportCollectionQuery {
  readonly status: ReportStatus;
  readonly category: ReportCategory | null;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  return validateJsonText(value, field, { maximumLength: 2_000, nullable: false, nonblank: true }) as string;
}

export function validateCreateReportBody(value: unknown): CreateReportInput {
  const body = validateBodyFields(value, ["category", "details"]);
  if (!("category" in body)) throwValidationIssue("category", "REQUIRED", "category is required.");
  return Object.freeze({
    category: normalizeControlledCode(body.category, "category", reportCategories) as ReportCategory,
    details: optionalText(body.details, "details")
  });
}

export function validateUpdateReportStatusBody(value: unknown): UpdateReportStatusInput {
  const body = validateBodyFields(value, ["status", "note"]);
  if (!("status" in body)) throwValidationIssue("status", "REQUIRED", "status is required.");
  const status = normalizeControlledCode(body.status, "status", reportStatuses.slice(1)) as Exclude<
    ReportStatus,
    "OPEN"
  >;
  const note = optionalText(body.note, "note");
  if ((status === "RESOLVED" || status === "DISMISSED") && note === null) {
    throwValidationIssue("note", "REQUIRED", "note is required for a terminal report status.");
  }
  return Object.freeze({ status, note });
}

export function validateReportCollectionQuery(value: unknown): ReportCollectionQuery {
  const query = validateQueryKeys(value, ["status", "category", "page", "pageSize"]);
  const statusValue = readScalarQueryValue(query.status, "status") ?? "OPEN";
  const status = normalizeControlledCode(statusValue, "status", reportStatuses) as ReportStatus;
  const categoryValue = readScalarQueryValue(query.category, "category");
  const category =
    categoryValue === undefined
      ? null
      : (normalizeControlledCode(categoryValue, "category", reportCategories) as ReportCategory);
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({ status, category, page, pageSize, offset });
}

export function parseReportId(value: string | string[], field = "reportId"): number {
  if (typeof value !== "string") throwValidationIssue(field, "INVALID_TYPE", `${field} must be provided exactly once.`);
  return parsePathId(value, field);
}
