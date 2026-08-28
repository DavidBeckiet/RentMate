import { normalizeControlledCode } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePagination, parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateJsonIntegerId } from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

export const roommateReportTargetTypes = ["ROOMMATE_PROFILE", "ROOMMATE_REQUEST", "ROOMMATE_MESSAGE"] as const;
export const roommateReportCategories = [
  "FRAUD",
  "PAYMENT_SCAM",
  "SPAM",
  "HARASSMENT",
  "IMPERSONATION",
  "INAPPROPRIATE_CONTENT",
  "OTHER"
] as const;
export const roommateReportStatuses = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"] as const;
export const roommateModerationStates = ["VISIBLE", "HIDDEN"] as const;
export const roommateReviewPriorities = ["ELEVATED", "STANDARD"] as const;

export type RoommateReportTargetType = (typeof roommateReportTargetTypes)[number];
export type RoommateReportCategory = (typeof roommateReportCategories)[number];
export type RoommateReportStatus = (typeof roommateReportStatuses)[number];
export type RoommateModerationState = (typeof roommateModerationStates)[number];
export type RoommateReviewPriority = (typeof roommateReviewPriorities)[number];

export interface CreateRoommateRequestReportInput {
  readonly targetType: Extract<RoommateReportTargetType, "ROOMMATE_PROFILE" | "ROOMMATE_REQUEST">;
  readonly category: RoommateReportCategory;
  readonly details: string | null;
}

export interface CreateRoommateInterestReportInput {
  readonly category: RoommateReportCategory;
  readonly details: string | null;
}

export interface CreateRoommateMessageReportInput {
  readonly category: RoommateReportCategory;
  readonly details: string | null;
}

export interface RoommateReportCollectionQuery {
  readonly source: "ROOMMATE";
  readonly status: RoommateReportStatus;
  readonly category: RoommateReportCategory | null;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
  readonly reviewPriority?: RoommateReviewPriority | null;
}

export interface RoommateBlockPageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export interface UpdateRoommateReportStatusInput {
  readonly status: Exclude<RoommateReportStatus, "OPEN">;
  readonly note: string | null;
}

export interface RoommateModerationInput {
  readonly state: RoommateModerationState;
  readonly note: string | null;
  readonly reportId: number;
}

function normalizeDetails(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throwValidationIssue("details", "INVALID_TYPE", "details must be a string or null.");
  const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  if (!normalized) throwValidationIssue("details", "REQUIRED", "details must not be blank when provided.");
  for (const character of normalized) {
    if (character !== "\n" && /\p{Cc}/u.test(character)) {
      throwValidationIssue("details", "INVALID_VALUE", "details must not contain control characters or tabs.");
    }
  }
  if ([...normalized].length > 2_000)
    throwValidationIssue("details", "TOO_LONG", "details exceeds the allowed length.");
  return normalized;
}

function reportBody(
  value: unknown,
  allowedTargets: readonly RoommateReportTargetType[] | null
): {
  readonly targetType: RoommateReportTargetType | undefined;
  readonly category: RoommateReportCategory;
  readonly details: string | null;
} {
  const body = validateBodyFields(value, ["category", "details", ...(allowedTargets === null ? [] : ["targetType"])]);
  if (!Object.prototype.hasOwnProperty.call(body, "category")) {
    throwValidationIssue("category", "REQUIRED", "category is required.");
  }
  const targetType =
    allowedTargets !== null && Object.prototype.hasOwnProperty.call(body, "targetType")
      ? (normalizeControlledCode(body.targetType, "targetType", allowedTargets) as RoommateReportTargetType)
      : undefined;
  return Object.freeze({
    targetType,
    category: normalizeControlledCode(body.category, "category", roommateReportCategories) as RoommateReportCategory,
    details: normalizeDetails(body.details)
  });
}

export function validateRoommateRequestReportBody(value: unknown): CreateRoommateRequestReportInput {
  const result = reportBody(value, ["ROOMMATE_PROFILE", "ROOMMATE_REQUEST"]);
  if (!result.targetType) throwValidationIssue("targetType", "REQUIRED", "targetType is required.");
  return Object.freeze({
    targetType: result.targetType as Extract<RoommateReportTargetType, "ROOMMATE_PROFILE" | "ROOMMATE_REQUEST">,
    category: result.category,
    details: result.details
  });
}

export function validateRoommateInterestReportBody(value: unknown): CreateRoommateInterestReportInput {
  const result = reportBody(value, null);
  return Object.freeze({ category: result.category, details: result.details });
}

export function validateRoommateMessageReportBody(value: unknown): CreateRoommateMessageReportInput {
  const result = reportBody(value, null);
  return Object.freeze({ category: result.category, details: result.details });
}

export function validateRoommateReportCollectionQuery(value: unknown): RoommateReportCollectionQuery {
  const query = validateQueryKeys(value, ["source", "status", "category", "page", "pageSize", "reviewPriority"]);
  const source = normalizeControlledCode(readScalarQueryValue(query.source, "source") ?? "", "source", ["ROOMMATE"]);
  const status = normalizeControlledCode(
    readScalarQueryValue(query.status, "status") ?? "OPEN",
    "status",
    roommateReportStatuses
  ) as RoommateReportStatus;
  const categoryValue = readScalarQueryValue(query.category, "category");
  const category =
    categoryValue === undefined
      ? null
      : (normalizeControlledCode(categoryValue, "category", roommateReportCategories) as RoommateReportCategory);
  const reviewPriorityValue = readScalarQueryValue(query.reviewPriority, "reviewPriority");
  const reviewPriority =
    reviewPriorityValue === undefined
      ? null
      : (normalizeControlledCode(
          reviewPriorityValue,
          "reviewPriority",
          roommateReviewPriorities
        ) as RoommateReviewPriority);
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({ source: source as "ROOMMATE", status, category, page, pageSize, offset, reviewPriority });
}

export function validateRoommateBlockPageQuery(value: unknown): RoommateBlockPageQuery {
  const query = validateQueryKeys(value, ["page", "pageSize"]);
  const { page, pageSize } = parsePagination(query);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({ page, pageSize, offset });
}

export function validateUpdateRoommateReportStatusBody(value: unknown): UpdateRoommateReportStatusInput {
  const body = validateBodyFields(value, ["status", "note"]);
  if (!Object.prototype.hasOwnProperty.call(body, "status")) {
    throwValidationIssue("status", "REQUIRED", "status is required.");
  }
  const status = normalizeControlledCode(body.status, "status", roommateReportStatuses.slice(1)) as Exclude<
    RoommateReportStatus,
    "OPEN"
  >;
  const note = normalizeDetails(body.note);
  if ((status === "RESOLVED" || status === "DISMISSED") && note === null) {
    throwValidationIssue("note", "REQUIRED", "note is required for a terminal report status.");
  }
  return Object.freeze({ status, note });
}

export function validateRoommateModerationBody(value: unknown): RoommateModerationInput {
  const body = validateBodyFields(value, ["state", "note", "reportId"]);
  for (const field of ["state", "reportId"] as const) {
    if (!Object.prototype.hasOwnProperty.call(body, field))
      throwValidationIssue(field, "REQUIRED", `${field} is required.`);
  }
  const note = normalizeDetails(body.note);
  return Object.freeze({
    state: normalizeControlledCode(body.state, "state", roommateModerationStates) as RoommateModerationState,
    note,
    reportId: validateJsonIntegerId(body.reportId, "reportId")
  });
}

export function parseRoommateReportId(value: string | string[]): number {
  if (typeof value !== "string")
    throwValidationIssue("reportId", "INVALID_TYPE", "reportId must be provided exactly once.");
  return parsePathId(value, "reportId");
}

export function parseRoommateTenantId(value: string | string[]): number {
  if (typeof value !== "string")
    throwValidationIssue("tenantId", "INVALID_TYPE", "tenantId must be provided exactly once.");
  return parsePathId(value, "tenantId");
}
