import { ApplicationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import {
  ValidationIssueCollector,
  throwValidationIssue,
  validationDetail
} from "../../../../shared/src/runtime/shared/validation/issues.js";
import {
  textMaximumLengths,
  validateJsonText,
  validateLatitude,
  validateLongitude,
  validateMonthlyRent,
  validateRoomArea
} from "../../../../shared/src/runtime/shared/validation/primitives.js";
import {
  requirePlainJsonObject,
  validateBodyFields,
  type PlainJsonObject
} from "../../../../shared/src/runtime/shared/validation/request.js";

const createListingFields = [
  "title",
  "description",
  "monthlyRent",
  "propertyTypeCode",
  "roomAreaSqm",
  "addressText",
  "areaName",
  "latitude",
  "longitude",
  "amenityCodes"
] as const;
const controlledCodePattern = /^[A-Z][A-Z0-9_]*$/;

export interface CreateListingDraftInput {
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: number | null;
  readonly propertyTypeCode: string | null;
  readonly roomAreaSqm: number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly amenityCodes: readonly string[];
}

function appendValidationIssues(collector: ValidationIssueCollector, operation: () => unknown): void {
  try {
    operation();
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "VALIDATION_FAILED") {
      collector.addMany(error.details);
      return;
    }

    throw error;
  }
}

function requireBody(value: unknown, collector: ValidationIssueCollector): PlainJsonObject | undefined {
  try {
    return requirePlainJsonObject(value);
  } catch (error) {
    if (error instanceof ApplicationError && error.code === "VALIDATION_FAILED") {
      collector.addMany(error.details);
      return undefined;
    }

    throw error;
  }
}

function normalizeNullableText(value: unknown, field: string, maximumLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return validateJsonText(value, field, {
    maximumLength,
    nullable: true,
    nonblank: true,
    blankAsNull: true,
    trim: true
  });
}

function normalizeNullableNumber(
  value: unknown,
  field: string,
  validate: (input: unknown, name: string) => number
): number | null {
  return value === undefined || value === null ? null : validate(value, field);
}

function normalizeControlledCode(
  value: unknown,
  field: string,
  maximumLength: number,
  nullable: boolean
): string | null {
  if (value === undefined || (nullable && value === null)) {
    return null;
  }

  if (typeof value !== "string") {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be a string${nullable ? " or null" : ""}.`);
  }

  const normalized = value.trim().toUpperCase();
  if (nullable && normalized.length === 0) {
    return null;
  }

  if (normalized.length === 0 || !controlledCodePattern.test(normalized)) {
    throwValidationIssue(field, "INVALID_VALUE", `${field} must use a valid controlled code.`);
  }

  if ([...normalized].length > maximumLength) {
    throwValidationIssue(field, "TOO_LONG", `${field} exceeds its maximum length.`);
  }

  return normalized;
}

function normalizeAmenityCodes(value: unknown, collector: ValidationIssueCollector): readonly string[] {
  if (value === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(value)) {
    collector.add(validationDetail("amenityCodes", "INVALID_TYPE", "amenityCodes must be an array when provided."));
    return Object.freeze([]);
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const [index, item] of value.entries()) {
    let code: string | null = null;
    appendValidationIssues(collector, () => {
      code = normalizeControlledCode(item, `amenityCodes[${index}]`, 40, false);
    });

    if (code === null) {
      continue;
    }

    if (seen.has(code)) {
      collector.add(validationDetail("amenityCodes", "DUPLICATE_VALUE", "amenityCodes must not contain duplicates."));
      continue;
    }

    seen.add(code);
    normalized.push(code);
  }

  return Object.freeze(normalized);
}

function normalizeCoordinates(
  body: PlainJsonObject,
  collector: ValidationIssueCollector
): Readonly<{ latitude: number | null; longitude: number | null }> {
  const hasLatitude = Object.prototype.hasOwnProperty.call(body, "latitude");
  const hasLongitude = Object.prototype.hasOwnProperty.call(body, "longitude");

  if (!hasLatitude && !hasLongitude) {
    return Object.freeze({ latitude: null, longitude: null });
  }

  if (!hasLatitude) {
    collector.add(validationDetail("latitude", "REQUIRED", "latitude is required when longitude is provided."));
    return Object.freeze({ latitude: null, longitude: null });
  }

  if (!hasLongitude) {
    collector.add(validationDetail("longitude", "REQUIRED", "longitude is required when latitude is provided."));
    return Object.freeze({ latitude: null, longitude: null });
  }

  if (body.latitude === null && body.longitude === null) {
    return Object.freeze({ latitude: null, longitude: null });
  }

  if (body.latitude === null || body.longitude === null) {
    collector.add(
      validationDetail(
        "latitude",
        "INVALID_VALUE",
        "latitude and longitude must both be null or both be valid numbers."
      )
    );
    collector.add(
      validationDetail(
        "longitude",
        "INVALID_VALUE",
        "latitude and longitude must both be null or both be valid numbers."
      )
    );
    return Object.freeze({ latitude: null, longitude: null });
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  appendValidationIssues(collector, () => {
    latitude = validateLatitude(body.latitude);
  });
  appendValidationIssues(collector, () => {
    longitude = validateLongitude(body.longitude);
  });

  return Object.freeze({ latitude, longitude });
}

export function validateCreateListingDraftInput(value: unknown): CreateListingDraftInput {
  const collector = new ValidationIssueCollector();
  const body = requireBody(value, collector);

  if (!body) {
    collector.throwIfAny();
    throw new Error("Listing-create body validation did not produce an issue.");
  }

  appendValidationIssues(collector, () => validateBodyFields(body, createListingFields));

  let title: string | null = null;
  let description: string | null = null;
  let monthlyRent: number | null = null;
  let propertyTypeCode: string | null = null;
  let roomAreaSqm: number | null = null;
  let addressText: string | null = null;
  let areaName: string | null = null;

  appendValidationIssues(collector, () => {
    title = normalizeNullableText(body.title, "title", textMaximumLengths.title);
  });
  appendValidationIssues(collector, () => {
    description = normalizeNullableText(body.description, "description", textMaximumLengths.description);
  });
  appendValidationIssues(collector, () => {
    monthlyRent = normalizeNullableNumber(body.monthlyRent, "monthlyRent", validateMonthlyRent);
  });
  appendValidationIssues(collector, () => {
    propertyTypeCode = normalizeControlledCode(body.propertyTypeCode, "propertyTypeCode", 32, true);
  });
  appendValidationIssues(collector, () => {
    roomAreaSqm = normalizeNullableNumber(body.roomAreaSqm, "roomAreaSqm", validateRoomArea);
  });
  appendValidationIssues(collector, () => {
    addressText = normalizeNullableText(body.addressText, "addressText", textMaximumLengths.addressText);
  });
  appendValidationIssues(collector, () => {
    areaName = normalizeNullableText(body.areaName, "areaName", textMaximumLengths.areaName);
  });

  const coordinates = normalizeCoordinates(body, collector);
  const amenityCodes = normalizeAmenityCodes(body.amenityCodes, collector);

  collector.throwIfAny();

  return Object.freeze({
    title,
    description,
    monthlyRent,
    propertyTypeCode,
    roomAreaSqm,
    addressText,
    areaName,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    amenityCodes
  });
}
