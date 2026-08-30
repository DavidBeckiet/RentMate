import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { validateBodyFields } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { RoommateDiscoveryQuery } from "../../roommate/validations/roommate-validation.js";
import { roommateAiLocales, type RoommateAiLocale } from "../schemas/preference-preview-schema.js";

export interface RoommateAiRecommendationInput {
  readonly filters: Omit<RoommateDiscoveryQuery, "page" | "pageSize" | "offset">;
  readonly limit: number;
  readonly locale: RoommateAiLocale;
}

const filterNames = [
  "area",
  "budgetMinPerPerson",
  "budgetMaxPerPerson",
  "moveInFrom",
  "moveInUntil",
  "listingMode"
] as const;

function text(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throwValidationIssue(`filters.${field}`, "INVALID_TYPE", `${field} must be a string.`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized) throwValidationIssue(`filters.${field}`, "INVALID_VALUE", `${field} must not be blank.`);
  return normalized;
}

function amount(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throwValidationIssue(`filters.${field}`, "INVALID_VALUE", `${field} must be a positive integer.`);
  }
  return value;
}

function date(value: unknown, field: string): string | null {
  const normalized = text(value, field);
  if (normalized === null || !/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    if (normalized === null) return null;
    throwValidationIssue(`filters.${field}`, "INVALID_VALUE", `${field} must be an ISO calendar date.`);
  }
  return normalized;
}

function listingMode(value: unknown): RoommateDiscoveryQuery["listingMode"] {
  const normalized = text(value, "listingMode")?.toUpperCase() ?? "ALL";
  if (normalized !== "ALL" && normalized !== "LINKED" && normalized !== "UNLINKED") {
    throwValidationIssue("filters.listingMode", "INVALID_VALUE", "listingMode must be ALL, LINKED, or UNLINKED.");
  }
  return normalized;
}

export function validateRoommateAiRecommendationBody(value: unknown): RoommateAiRecommendationInput {
  const body = validateBodyFields(value, ["filters", "limit", "locale"]);
  if (!("filters" in body)) throwValidationIssue("filters", "REQUIRED", "filters is required.");
  if (body.filters === null || typeof body.filters !== "object" || Array.isArray(body.filters)) {
    throwValidationIssue("filters", "INVALID_TYPE", "filters must be an object.");
  }
  const rawFilters = validateBodyFields(body.filters, filterNames);
  const budgetMinPerPerson = amount(rawFilters.budgetMinPerPerson, "budgetMinPerPerson");
  const budgetMaxPerPerson = amount(rawFilters.budgetMaxPerPerson, "budgetMaxPerPerson");
  if (budgetMinPerPerson !== null && budgetMaxPerPerson !== null && budgetMinPerPerson > budgetMaxPerPerson) {
    throwValidationIssue(
      "filters.budgetMaxPerPerson",
      "INVALID_VALUE",
      "budgetMaxPerPerson must be at least budgetMinPerPerson."
    );
  }
  const moveInFrom = date(rawFilters.moveInFrom, "moveInFrom");
  const moveInUntil = date(rawFilters.moveInUntil, "moveInUntil");
  if (moveInFrom !== null && moveInUntil !== null && moveInFrom > moveInUntil) {
    throwValidationIssue("filters.moveInUntil", "INVALID_VALUE", "moveInUntil must be on or after moveInFrom.");
  }
  const limit = body.limit === undefined ? 10 : body.limit;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 10) {
    throwValidationIssue("limit", "OUT_OF_RANGE", "limit must be an integer between 1 and 10.");
  }
  if (body.locale === undefined) throwValidationIssue("locale", "REQUIRED", "locale is required.");
  const locale = body.locale;
  if (typeof locale !== "string" || !roommateAiLocales.includes(locale as RoommateAiLocale)) {
    throwValidationIssue("locale", "INVALID_VALUE", "locale must be vi or en.");
  }
  return Object.freeze({
    filters: Object.freeze({
      area: text(rawFilters.area, "area"),
      budgetMinPerPerson,
      budgetMaxPerPerson,
      moveInFrom,
      moveInUntil,
      listingMode: listingMode(rawFilters.listingMode)
    }),
    limit,
    locale: locale as RoommateAiLocale
  });
}
