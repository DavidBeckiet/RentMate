import { textMaximumLengths, validateJsonText } from "../../shared/validation/primitives.js";
import { validateBodyFields } from "../../shared/validation/request.js";
import { throwValidationIssue } from "../../shared/validation/issues.js";

export interface ForwardGeocodingInput {
  readonly addressText: string;
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
