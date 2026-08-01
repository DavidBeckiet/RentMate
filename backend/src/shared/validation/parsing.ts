import { readScalarQueryValue, type PlainJsonObject } from "./request.js";
import { throwValidationIssue } from "./issues.js";

const positiveIntegerPattern = /^[0-9]+$/;
const ordinaryDecimalPattern = /^-?[0-9]+(?:\.[0-9]+)?$/;
const maximumPostgresIntegerId = 2_147_483_647;

export interface PaginationInput {
  readonly page: number;
  readonly pageSize: number;
}

export function parsePathId(value: string, field: string): number {
  if (!positiveIntegerPattern.test(value)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must be a positive integer ID.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximumPostgresIntegerId) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} must be between 1 and 2147483647.`);
  }

  return parsed;
}

export function parsePositiveQueryInteger(
  value: unknown,
  field: string,
  maximum = Number.MAX_SAFE_INTEGER
): number | undefined {
  const scalar = readScalarQueryValue(value, field);
  if (scalar === undefined) {
    return undefined;
  }

  if (!positiveIntegerPattern.test(scalar)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must be a positive decimal integer.`);
  }

  const parsed = Number(scalar);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} is outside the allowed range.`);
  }

  return parsed;
}

export function parseFiniteQueryDecimal(value: unknown, field: string): number | undefined {
  const scalar = readScalarQueryValue(value, field);
  if (scalar === undefined) {
    return undefined;
  }

  if (!ordinaryDecimalPattern.test(scalar)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must be an ordinary decimal number.`);
  }

  const parsed = Number(scalar);
  if (!Number.isFinite(parsed)) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} must be a finite number.`);
  }

  return parsed;
}

export function parsePagination(query: PlainJsonObject): PaginationInput {
  const page = parsePositiveQueryInteger(query.page, "page") ?? 1;
  const pageSize = parsePositiveQueryInteger(query.pageSize, "pageSize", 100) ?? 20;

  return Object.freeze({ page, pageSize });
}
