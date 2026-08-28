import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { validateBodyFields } from "../../../../../shared/src/runtime/shared/validation/request.js";
import {
  roommateAiLocales,
  roommateAiPreferenceTargets,
  type RoommateAiLocale,
  type RoommateAiPreferenceTarget
} from "../schemas/preference-preview-schema.js";

export interface RoommateAiPreferencePreviewInput {
  readonly target: RoommateAiPreferenceTarget;
  readonly text: string;
  readonly locale: RoommateAiLocale;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") throwValidationIssue("text", "INVALID_TYPE", "text must be a string.");
  const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  for (const character of normalized) {
    if (character !== "\n" && /\p{Cc}/u.test(character)) {
      throwValidationIssue("text", "INVALID_VALUE", "text must not contain control characters.");
    }
  }
  const length = Array.from(normalized).length;
  if (length === 0) throwValidationIssue("text", "REQUIRED", "text must not be blank.");
  if (length < 20) throwValidationIssue("text", "TOO_SHORT", "text is shorter than the allowed length.");
  if (length > 2_000) throwValidationIssue("text", "TOO_LONG", "text exceeds the allowed length.");
  return normalized;
}

function enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must be an allowed value.`);
  }
  return value as T;
}

export function validateRoommateAiPreferencePreviewBody(value: unknown): RoommateAiPreferencePreviewInput {
  const body = validateBodyFields(value, ["target", "text", "locale"]);
  for (const field of ["target", "text", "locale"] as const) {
    if (!(field in body)) throwValidationIssue(field, "REQUIRED", `${field} is required.`);
  }
  return Object.freeze({
    target: enumValue(body.target, "target", roommateAiPreferenceTargets),
    text: normalizeText(body.text),
    locale: enumValue(body.locale, "locale", roommateAiLocales)
  });
}
