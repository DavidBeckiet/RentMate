import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

export type RoommateInterestStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "LEFT";
export type RoommateInterestDirection = "INCOMING" | "OUTGOING";

export interface CreateRoommateInterestInput {
  readonly message: string;
}

export interface RoommateInterestCollectionQuery {
  readonly direction: RoommateInterestDirection;
  readonly status: RoommateInterestStatus | null;
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export interface RoommateInterestPageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

const maximumPageSize = 50;
const maximumPage = 2_147_483_647;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    if (character !== "\n" && /\p{Cc}/u.test(character)) return true;
  }
  return false;
}

function normalizeMessage(value: unknown): string {
  if (typeof value !== "string") throwValidationIssue("message", "INVALID_TYPE", "message must be a string.");
  const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  if (!normalized) throwValidationIssue("message", "REQUIRED", "message must not be blank.");
  if (hasControlCharacter(normalized)) {
    throwValidationIssue("message", "INVALID_VALUE", "message must not contain control characters or tabs.");
  }
  const length = [...normalized].length;
  if (length > 2_000) {
    throwValidationIssue("message", "TOO_LONG", "message exceeds the allowed length.");
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

function pageQuery(value: unknown, allowedKeys: readonly string[]): RoommateInterestPageQuery {
  const query = validateQueryKeys(value, allowedKeys);
  const page = parseQueryInteger(query.page, "page", maximumPage) ?? 1;
  const pageSize = parseQueryInteger(query.pageSize, "pageSize", maximumPageSize) ?? 20;
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throwValidationIssue("page", "OUT_OF_RANGE", "page is too large.");
  return Object.freeze({ page, pageSize, offset });
}

export function validateCreateRoommateInterestBody(value: unknown): CreateRoommateInterestInput {
  const body = validateBodyFields(value, ["message"]);
  if (!Object.prototype.hasOwnProperty.call(body, "message")) {
    throwValidationIssue("message", "REQUIRED", "message is required.");
  }
  return Object.freeze({ message: normalizeMessage(body.message) });
}

export function validateRoommateInterestCollectionQuery(value: unknown): RoommateInterestCollectionQuery {
  const query = validateQueryKeys(value, ["direction", "status", "page", "pageSize"]);
  const directionValue = readScalarQueryValue(query.direction, "direction");
  if (directionValue === undefined) throwValidationIssue("direction", "REQUIRED", "direction is required.");
  const direction = directionValue.toUpperCase();
  if (direction !== "INCOMING" && direction !== "OUTGOING") {
    throwValidationIssue("direction", "INVALID_VALUE", "direction must be INCOMING or OUTGOING.");
  }
  const statusValue = readScalarQueryValue(query.status, "status");
  const status = statusValue === undefined ? null : statusValue.toUpperCase();
  if (
    status !== null &&
    !(["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN", "LEFT"] as readonly string[]).includes(status)
  ) {
    throwValidationIssue("status", "INVALID_VALUE", "status is not valid.");
  }
  return Object.freeze({
    direction: direction as RoommateInterestDirection,
    status: status as RoommateInterestStatus | null,
    ...pageQuery(value, ["direction", "status", "page", "pageSize"])
  });
}

export function validateRoommateInterestPageQuery(value: unknown): RoommateInterestPageQuery {
  return pageQuery(value, ["page", "pageSize"]);
}

export function parseRoommateInterestId(value: string | string[]): number {
  if (typeof value !== "string")
    throwValidationIssue("interestId", "INVALID_TYPE", "interestId must be provided once.");
  return parsePathId(value, "interestId");
}
