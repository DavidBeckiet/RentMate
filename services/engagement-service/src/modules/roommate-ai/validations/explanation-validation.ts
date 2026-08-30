import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { validateBodyFields } from "../../../../../shared/src/runtime/shared/validation/request.js";
import { roommateAiLocales, type RoommateAiLocale } from "../schemas/preference-preview-schema.js";

export interface RoommateAiExplanationInput {
  readonly locale: RoommateAiLocale;
}

export function validateRoommateAiExplanationBody(value: unknown): RoommateAiExplanationInput {
  const body = validateBodyFields(value, ["locale"]);
  if (!("locale" in body)) throwValidationIssue("locale", "REQUIRED", "locale is required.");
  if (typeof body.locale !== "string" || !roommateAiLocales.includes(body.locale as RoommateAiLocale)) {
    throwValidationIssue("locale", "INVALID_VALUE", "locale must be vi or en.");
  }
  return Object.freeze({ locale: body.locale as RoommateAiLocale });
}
