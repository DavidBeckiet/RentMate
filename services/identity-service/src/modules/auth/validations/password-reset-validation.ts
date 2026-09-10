import {
  normalizeEmail,
  validatePasswordRepresentation
} from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { validateJsonText } from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import { validateBodyFields } from "../../../../../shared/src/runtime/shared/validation/request.js";

export interface PasswordResetRequestInput {
  readonly email: string;
}

export interface PasswordResetConfirmationInput {
  readonly email: string;
  readonly code: string;
  readonly password: string;
}

export function validatePasswordResetRequestBody(value: unknown): PasswordResetRequestInput {
  const body = validateBodyFields(value, ["email"]);
  if (!("email" in body)) throwValidationIssue("email", "REQUIRED", "email is required.");
  return Object.freeze({ email: normalizeEmail(body.email) });
}

export function validatePasswordResetConfirmationBody(value: unknown): PasswordResetConfirmationInput {
  const body = validateBodyFields(value, ["email", "code", "password"]);
  if (!("email" in body)) throwValidationIssue("email", "REQUIRED", "email is required.");
  if (!("code" in body)) throwValidationIssue("code", "REQUIRED", "code is required.");
  if (!("password" in body)) throwValidationIssue("password", "REQUIRED", "password is required.");

  const code = validateJsonText(body.code, "code", {
    maximumLength: 6,
    nullable: false,
    nonblank: true,
    trim: false
  }) as string;
  if (!/^\d{6}$/u.test(code)) {
    throwValidationIssue("code", "INVALID_VALUE", "code is invalid.");
  }

  return Object.freeze({
    email: normalizeEmail(body.email),
    code,
    password: validatePasswordRepresentation(body.password)
  });
}
