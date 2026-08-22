import { throwValidationIssue } from "./issues.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9][0-9]{7,14}$/;

export function normalizeEmail(value: unknown, field = "email"): string {
  if (typeof value !== "string") {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string.`);
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throwValidationIssue(field, "REQUIRED", `${field} is required.`);
  }

  if (normalized.length > 320) {
    throwValidationIssue(field, "TOO_LONG", `${field} must not exceed 320 characters.`);
  }

  if (!emailPattern.test(normalized)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must use a valid email format.`);
  }

  return normalized;
}

export function validatePasswordRepresentation(value: unknown, field = "password"): string {
  if (typeof value !== "string") {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string.`);
  }

  if ([...value].length < 8) {
    throwValidationIssue(field, "TOO_SHORT", `${field} must contain at least 8 characters.`);
  }

  if (Buffer.byteLength(value, "utf8") > 72) {
    throwValidationIssue(field, "TOO_LONG", `${field} must not exceed 72 UTF-8 bytes.`);
  }

  return value;
}

export function normalizePhone(value: unknown, field: string, policy: "required"): string;
export function normalizePhone(value: unknown, field: string, policy: "nullable"): string | null | undefined;
export function normalizePhone(
  value: unknown,
  field: string,
  policy: "required" | "nullable"
): string | null | undefined {
  if (value === undefined) {
    if (policy === "required") {
      throwValidationIssue(field, "REQUIRED", `${field} is required.`);
    }

    return undefined;
  }

  if (value === null) {
    if (policy === "required") {
      throwValidationIssue(field, "REQUIRED", `${field} is required.`);
    }

    return null;
  }

  if (typeof value !== "string") {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string or null.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    if (policy === "required") {
      throwValidationIssue(field, "REQUIRED", `${field} is required.`);
    }

    return null;
  }

  if (!phonePattern.test(normalized)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must use E.164 format.`);
  }

  return normalized;
}

export function normalizeControlledCode(value: unknown, field: string, allowedCodes: readonly string[]): string {
  if (typeof value !== "string") {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string.`);
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized || !allowedCodes.includes(normalized)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must be an allowed code.`);
  }

  return normalized;
}

export function normalizeNullableString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string or null.`);
  }

  const normalized = value.trim();
  return normalized || null;
}
