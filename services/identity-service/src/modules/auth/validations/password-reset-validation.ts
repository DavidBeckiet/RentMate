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
  readonly token: string;
  readonly password: string;
}

export function validatePasswordResetRequestBody(value: unknown): PasswordResetRequestInput {
  const body = validateBodyFields(value, ["email"]);
  if (!("email" in body)) throwValidationIssue("email", "REQUIRED", "email is required.");
  return Object.freeze({ email: normalizeEmail(body.email) });
}

export function validatePasswordResetConfirmationBody(value: unknown): PasswordResetConfirmationInput {
  const body = validateBodyFields(value, ["token", "password"]);
  if (!("token" in body)) throwValidationIssue("token", "REQUIRED", "token is required.");
  if (!("password" in body)) throwValidationIssue("password", "REQUIRED", "password is required.");

  const token = validateJsonText(body.token, "token", {
    maximumLength: 128,
    nullable: false,
    nonblank: true,
    trim: false
  }) as string;
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(token)) {
    throwValidationIssue("token", "INVALID_VALUE", "token is invalid.");
  }

  return Object.freeze({ token, password: validatePasswordRepresentation(body.password) });
}
