import {
  textMaximumLengths,
  validateJsonText,
  validateLatitude,
  validateLongitude
} from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import { validateBodyFields } from "../../../../../shared/src/runtime/shared/validation/request.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";

export interface ForwardGeocodingInput {
  readonly addressText: string;
}

export interface ReverseGeocodingInput {
  readonly latitude: number;
  readonly longitude: number;
}

export function validateForwardGeocodingInput(value: unknown): ForwardGeocodingInput {
  const body = validateBodyFields(value, ["addressText"]);
  if (!Object.prototype.hasOwnProperty.call(body, "addressText")) {
    throwValidationIssue("addressText", "REQUIRED", "addressText is required.");
  }

  const addressText = validateJsonText(body.addressText, "addressText", {
    maximumLength: textMaximumLengths.addressText,
    nullable: false,
    nonblank: true,
    trim: true
  });
  if (addressText === null) throw new Error("Forward-geocoding address validation returned null.");

  return Object.freeze({ addressText });
}

export function validateReverseGeocodingInput(value: unknown): ReverseGeocodingInput {
  const body = validateBodyFields(value, ["latitude", "longitude"]);
  if (!Object.prototype.hasOwnProperty.call(body, "latitude")) {
    throwValidationIssue("latitude", "REQUIRED", "latitude is required.");
  }
  if (!Object.prototype.hasOwnProperty.call(body, "longitude")) {
    throwValidationIssue("longitude", "REQUIRED", "longitude is required.");
  }

  return Object.freeze({
    latitude: validateLatitude(body.latitude),
    longitude: validateLongitude(body.longitude)
  });
}
