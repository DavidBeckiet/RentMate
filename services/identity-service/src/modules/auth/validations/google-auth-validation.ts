import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import {
  normalizeControlledCode,
  normalizePhone
} from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import {
  requirePlainJsonObject,
  validateBodyFields,
  type PlainJsonObject
} from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { GoogleAuthIntent, GoogleAuthRole } from "../google-oauth-state.js";

const googleStartFields = ["intent", "role", "phone"] as const;

export interface GoogleAuthStartInput {
  readonly intent: GoogleAuthIntent;
  readonly role: GoogleAuthRole | null;
  readonly phone: string | null;
}

function requireBody(value: unknown): PlainJsonObject {
  return requirePlainJsonObject(value);
}

export function validateGoogleAuthStartInput(value: unknown): GoogleAuthStartInput {
  const body = requireBody(value);
  validateBodyFields(body, googleStartFields);
  const intent = normalizeControlledCode(body.intent, "intent", ["LOGIN", "REGISTER"]) as GoogleAuthIntent;
  const hasRole = Object.prototype.hasOwnProperty.call(body, "role");
  const hasPhone = Object.prototype.hasOwnProperty.call(body, "phone");

  if (intent === "LOGIN") {
    if (hasRole || hasPhone) {
      throwValidationIssue(
        hasRole ? "role" : "phone",
        "INVALID_VALUE",
        "Registration fields are not allowed for Google login."
      );
    }
    return Object.freeze({ intent, role: null, phone: null });
  }

  const role = normalizeControlledCode(body.role, "role", ["TENANT", "LANDLORD"]) as GoogleAuthRole;
  if (role === "LANDLORD") {
    const phone = normalizePhone(body.phone, "phone", "nullable");
    return Object.freeze({ intent, role, phone: phone ?? null });
  }

  if (hasPhone) {
    throwValidationIssue(
      "phone",
      "INVALID_VALUE",
      "A tenant Google registration does not accept a phone in this step."
    );
  }

  return Object.freeze({ intent, role, phone: null });
}
