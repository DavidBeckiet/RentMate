import { throwValidationIssue } from "./issues.js";

export const textMaximumLengths = Object.freeze({
  title: 160,
  description: 5_000,
  addressText: 500,
  areaName: 120,
  altText: 255,
  moderationReason: 1_000
});

interface TextValidationPolicy {
  readonly maximumLength: number;
  readonly nullable: boolean;
  readonly nonblank: boolean;
  readonly blankAsNull?: boolean;
  readonly trim?: boolean;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a finite JSON number.`);
  }

  return value;
}

function decimalScale(value: number): number {
  const [coefficient, exponentText] = value.toString().toLowerCase().split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const fractionLength = coefficient.includes(".") ? (coefficient.split(".")[1]?.length ?? 0) : 0;
  return Math.max(0, fractionLength - exponent);
}

export function validateJsonIntegerId(value: unknown, field: string): number {
  const parsed = requireFiniteNumber(value, field);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} must be a positive 32-bit integer.`);
  }

  return parsed;
}

export function validateMonthlyRent(value: unknown, field = "monthlyRent"): number {
  const parsed = requireFiniteNumber(value, field);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 999_999_999_999) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} must be a positive whole VND amount.`);
  }

  return parsed;
}

export function validateRoomArea(value: unknown, field = "roomAreaSqm"): number {
  const parsed = requireFiniteNumber(value, field);
  if (parsed <= 0 || parsed > 999_999.99) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} is outside the allowed range.`);
  }

  if (decimalScale(parsed) > 2) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must have at most two decimal places.`);
  }

  return parsed;
}

function validateCoordinate(value: unknown, field: string, minimum: number, maximum: number): number {
  const parsed = requireFiniteNumber(value, field);
  if (parsed < minimum || parsed > maximum) {
    throwValidationIssue(field, "OUT_OF_RANGE", `${field} is outside the allowed range.`);
  }

  return parsed;
}

export function validateLatitude(value: unknown, field = "latitude"): number {
  return validateCoordinate(value, field, -90, 90);
}

export function validateLongitude(value: unknown, field = "longitude"): number {
  return validateCoordinate(value, field, -180, 180);
}

export function validateJsonText(value: unknown, field: string, policy: TextValidationPolicy): string | null {
  if (value === null) {
    if (policy.nullable) {
      return null;
    }

    throwValidationIssue(field, "REQUIRED", `${field} must not be null.`);
  }

  if (typeof value !== "string") {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string.`);
  }

  const isBlank = value.trim().length === 0;
  const normalized = policy.trim === false ? value : value.trim();
  if (isBlank && policy.blankAsNull && policy.nullable) {
    return null;
  }

  if (isBlank && policy.nonblank) {
    throwValidationIssue(field, "REQUIRED", `${field} must not be blank.`);
  }

  if ([...normalized].length > policy.maximumLength) {
    throwValidationIssue(field, "TOO_LONG", `${field} exceeds its maximum length.`);
  }

  return normalized;
}
