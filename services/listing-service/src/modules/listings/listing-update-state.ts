import { createValidationError } from "../../../../shared/src/runtime/shared/errors/application-error.js";
import { validationDetail } from "../../../../shared/src/runtime/shared/validation/issues.js";
import { findMissingListingCompletenessFields } from "./listing-completeness.js";
import { resolveListingStatusAfterMutation } from "./listing-lifecycle-policy.js";
import type { ListingStatus } from "./mappers/owner-listing-mapper.js";
import type { ListingUpdateInput } from "./validations/listing-update-validation.js";

export interface ListingContentState {
  readonly status: ListingStatus;
  readonly title: string | null;
  readonly description: string | null;
  readonly monthlyRent: number | null;
  readonly roomAreaSqm: number | null;
  readonly addressText: string | null;
  readonly areaName: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly propertyTypeCode: string | null;
  readonly amenityCodes: readonly string[];
}

export interface ListingUpdateState extends ListingContentState {
  readonly changed: boolean;
  readonly amenitiesChanged: boolean;
  readonly retainedAmenityCodes: readonly string[];
  readonly addedAmenityCodes: readonly string[];
  readonly removedAmenityCodes: readonly string[];
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return values.size === right.length && right.every((value) => values.has(value));
}

function value<Value>(field: ListingUpdateInput[keyof ListingUpdateInput], fallback: Value): Value {
  return (field.provided ? field.value : fallback) as Value;
}

export function resolveListingUpdateState(
  current: Readonly<ListingContentState>,
  input: Readonly<ListingUpdateInput>
): ListingUpdateState {
  const desiredAmenities = value<readonly string[]>(input.amenityCodes, current.amenityCodes);
  const currentSet = new Set(current.amenityCodes);
  const desiredSet = new Set(desiredAmenities);
  const amenitiesChanged = !sameSet(current.amenityCodes, desiredAmenities);
  const coordinates = value(input.coordinates, { latitude: current.latitude, longitude: current.longitude });
  const next = {
    title: value(input.title, current.title),
    description: value(input.description, current.description),
    monthlyRent: value(input.monthlyRent, current.monthlyRent),
    roomAreaSqm: value(input.roomAreaSqm, current.roomAreaSqm),
    addressText: value(input.addressText, current.addressText),
    areaName: value(input.areaName, current.areaName),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    propertyTypeCode: value(input.propertyTypeCode, current.propertyTypeCode)
  };
  const scalarChanged =
    next.title !== current.title ||
    next.description !== current.description ||
    next.monthlyRent !== current.monthlyRent ||
    next.roomAreaSqm !== current.roomAreaSqm ||
    next.addressText !== current.addressText ||
    next.areaName !== current.areaName ||
    next.latitude !== current.latitude ||
    next.longitude !== current.longitude ||
    next.propertyTypeCode !== current.propertyTypeCode;
  const changed = scalarChanged || amenitiesChanged;
  const status = resolveListingStatusAfterMutation(
    current.status,
    changed ? "SIGNIFICANT_CONTENT_CHANGE" : "NO_STATUS_CHANGE"
  );

  const missingFields = findMissingListingCompletenessFields({
    propertyType: next.propertyTypeCode,
    title: next.title,
    description: next.description,
    monthlyRent: next.monthlyRent,
    roomAreaSqm: next.roomAreaSqm,
    addressText: next.addressText,
    areaName: next.areaName,
    latitude: next.latitude,
    longitude: next.longitude
  });

  if (status !== "DRAFT" && missingFields.length > 0) {
    throw createValidationError([
      validationDetail("body", "INVALID_VALUE", "The resulting non-draft listing must contain all required content.")
    ]);
  }

  return Object.freeze({
    status,
    ...next,
    amenityCodes: Object.freeze([...desiredAmenities]),
    changed,
    amenitiesChanged,
    retainedAmenityCodes: Object.freeze(desiredAmenities.filter((code) => currentSet.has(code))),
    addedAmenityCodes: Object.freeze(desiredAmenities.filter((code) => !currentSet.has(code))),
    removedAmenityCodes: Object.freeze(current.amenityCodes.filter((code) => !desiredSet.has(code)))
  });
}
