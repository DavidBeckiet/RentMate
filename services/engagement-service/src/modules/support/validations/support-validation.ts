import { normalizeControlledCode } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePagination, parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateJsonText } from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

export const supportRequestCategories = ["ACCOUNT", "LISTING", "SAFETY", "TECHNICAL", "OTHER"] as const;
export type SupportRequestCategory = (typeof supportRequestCategories)[number];

export const supportRequestStatuses = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type SupportRequestStatus = (typeof supportRequestStatuses)[number];

export interface CreateSupportRequestInput {
  readonly category: SupportRequestCategory;
  readonly subject: string;
  readonly message: string;
}

export interface SupportRequestCollectionQuery {
  readonly status: SupportRequestStatus;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export interface UpdateSupportRequestStatusInput {
  readonly status: Exclude<SupportRequestStatus, "OPEN">;
  readonly note: string | null;
}

function requiredText(value: unknown, field: string, maximumLength: number): string {
  const text = validateJsonText(value, field, { maximumLength, nullable: false, nonblank: true }) as string;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} contains unsupported control characters.`);
  }
  return text;
}

function optionalText(value: unknown, field: string, maximumLength: number): string | null {
  if (value === undefined || value === null) return null;
  return requiredText(value, field, maximumLength);
}

function pagination(value: unknown): Omit<SupportRequestCollectionQuery, "status"> {
  const query = validateQueryKeys(value, ["status", "page", "pageSize"]);
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  }
  return Object.freeze({ page, pageSize, offset });
}

export function validateCreateSupportRequestBody(value: unknown): CreateSupportRequestInput {
  const body = validateBodyFields(value, ["category", "subject", "message"]);
  if (!("category" in body)) throwValidationIssue("category", "REQUIRED", "category is required.");
  if (!("subject" in body)) throwValidationIssue("subject", "REQUIRED", "subject is required.");
  if (!("message" in body)) throwValidationIssue("message", "REQUIRED", "message is required.");
  return Object.freeze({
    category: normalizeControlledCode(body.category, "category", supportRequestCategories) as SupportRequestCategory,
    subject: requiredText(body.subject, "subject", 160),
    message: requiredText(body.message, "message", 4_000)
  });
}

export function validateSupportRequestCollectionQuery(value: unknown): SupportRequestCollectionQuery {
  const query = validateQueryKeys(value, ["status", "page", "pageSize"]);
  const status = normalizeControlledCode(
    readScalarQueryValue(query.status, "status") ?? "OPEN",
    "status",
    supportRequestStatuses
  ) as SupportRequestStatus;
  return Object.freeze({ ...pagination(query), status });
}

export function validateUpdateSupportRequestStatusBody(value: unknown): UpdateSupportRequestStatusInput {
  const body = validateBodyFields(value, ["status", "note"]);
  if (!("status" in body)) throwValidationIssue("status", "REQUIRED", "status is required.");
  const status = normalizeControlledCode(
    body.status,
    "status",
    supportRequestStatuses.slice(1)
  ) as Exclude<SupportRequestStatus, "OPEN">;
  const note = optionalText(body.note, "note", 2_000);
  if (status === "RESOLVED" && note === null) {
    throwValidationIssue("note", "REQUIRED", "note is required when resolving a support request.");
  }
  return Object.freeze({ status, note });
}

export function parseSupportRequestId(value: string | string[]): number {
  if (typeof value !== "string") {
    throwValidationIssue("supportRequestId", "INVALID_TYPE", "supportRequestId must be provided exactly once.");
  }
  return parsePathId(value, "supportRequestId");
}
