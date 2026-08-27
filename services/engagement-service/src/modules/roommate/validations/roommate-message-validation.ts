import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

export interface CreateRoommateMessageInput {
  readonly body: string;
}

export interface RoommateMessagePageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

const maximumPageSize = 100;
const maximumPage = 2_147_483_647;

function normalizeMultiline(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== "string") throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string.`);
  const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  if (normalized.length === 0) throwValidationIssue(field, "REQUIRED", `${field} must not be blank.`);
  for (const character of normalized) {
    if (character !== "\n" && /\p{Cc}/u.test(character)) {
      throwValidationIssue(field, "INVALID_VALUE", `${field} must not contain control characters or tabs.`);
    }
  }
  if ([...normalized].length > maximumLength) {
    throwValidationIssue(field, "TOO_LONG", `${field} exceeds the allowed length.`);
  }
  return normalized;
}

function parseQueryInteger(value: unknown, field: string, maximum: number): number | undefined {
  const scalar = readScalarQueryValue(value, field);
  if (scalar === undefined) return undefined;
  if (!/^\d+$/u.test(scalar)) throwValidationIssue(field, "INVALID_VALUE", `${field} must be a decimal integer.`);
  const parsed = Number(scalar);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} is outside the allowed range.`);
  }
  return parsed;
}

export function validateCreateRoommateMessageBody(value: unknown): CreateRoommateMessageInput {
  const body = validateBodyFields(value, ["body"]);
  if (!Object.prototype.hasOwnProperty.call(body, "body")) {
    throwValidationIssue("body", "REQUIRED", "body is required.");
  }
  return Object.freeze({ body: normalizeMultiline(body.body, "body", 2_000) });
}

export function validateRoommateMessagePageQuery(value: unknown): RoommateMessagePageQuery {
  const query = validateQueryKeys(value, ["page", "pageSize"]);
  const page = parseQueryInteger(query.page, "page", maximumPage) ?? 1;
  const pageSize = parseQueryInteger(query.pageSize, "pageSize", maximumPageSize) ?? 50;
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({ page, pageSize, offset });
}

export function parseRoommateMessageId(value: string | string[]): number {
  if (typeof value !== "string") {
    throwValidationIssue("messageId", "INVALID_TYPE", "messageId must be provided exactly once.");
  }
  return parsePathId(value, "messageId");
}
