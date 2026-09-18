import { normalizeControlledCode } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePagination, parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import {
  validateJsonIntegerId,
  validateJsonText
} from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

export const contactReportCategories = ["SPAM", "FRAUD", "HARASSMENT", "INAPPROPRIATE", "OTHER"] as const;
export const contactReportStatuses = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"] as const;
export type ContactReportCategory = (typeof contactReportCategories)[number];
export type ContactReportStatus = (typeof contactReportStatuses)[number];

export interface CreateContactReportInput {
  readonly category: ContactReportCategory;
  readonly details: string | null;
  readonly messageId: number | null;
}

export interface UpdateContactReportStatusInput {
  readonly status: Extract<ContactReportStatus, "RESOLVED" | "DISMISSED">;
  readonly note: string | null;
}

export interface ContactReportCollectionQuery {
  readonly status: ContactReportStatus;
  readonly category: ContactReportCategory | null;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  const text = validateJsonText(value, field, { maximumLength: 2_000, nullable: false, nonblank: true }) as string;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} contains unsupported control characters.`);
  }
  return text;
}

export function validateCreateContactReportBody(value: unknown): CreateContactReportInput {
  const body = validateBodyFields(value, ["category", "details", "messageId"]);
  if (!("category" in body)) throwValidationIssue("category", "REQUIRED", "category is required.");
  return Object.freeze({
    category: normalizeControlledCode(body.category, "category", contactReportCategories) as ContactReportCategory,
    details: optionalText(body.details, "details"),
    messageId:
      body.messageId === undefined || body.messageId === null
        ? null
        : validateJsonIntegerId(body.messageId, "messageId")
  });
}

export function validateUpdateContactReportStatusBody(value: unknown): UpdateContactReportStatusInput {
  const body = validateBodyFields(value, ["status", "note"]);
  if (!("status" in body)) throwValidationIssue("status", "REQUIRED", "status is required.");
  const status = normalizeControlledCode(
    body.status,
    "status",
    contactReportStatuses.slice(2)
  ) as UpdateContactReportStatusInput["status"];
  const note = optionalText(body.note, "note");
  if ((status === "RESOLVED" || status === "DISMISSED") && note === null) {
    throwValidationIssue("note", "REQUIRED", "note is required for a terminal report status.");
  }
  return Object.freeze({ status, note });
}

export function validateContactReportCollectionQuery(value: unknown): ContactReportCollectionQuery {
  const query = validateQueryKeys(value, ["status", "category", "page", "pageSize"]);
  const status = normalizeControlledCode(
    readScalarQueryValue(query.status, "status") ?? "OPEN",
    "status",
    contactReportStatuses
  ) as ContactReportStatus;
  const categoryValue = readScalarQueryValue(query.category, "category");
  const category =
    categoryValue === undefined
      ? null
      : (normalizeControlledCode(categoryValue, "category", contactReportCategories) as ContactReportCategory);
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset < 0) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({ status, category, page, pageSize, offset });
}

export function parseContactReportId(value: string | string[], field = "reportId"): number {
  if (typeof value !== "string") throwValidationIssue(field, "INVALID_TYPE", `${field} must be provided exactly once.`);
  return parsePathId(value, field);
}
