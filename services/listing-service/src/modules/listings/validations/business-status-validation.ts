import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import {
  validateBodyFields,
  requirePlainJsonObject
} from "../../../../../shared/src/runtime/shared/validation/request.js";
import { isListingBusinessStatus, type ListingBusinessStatus } from "../../../../../shared/listing-business-status.js";

const businessStatusFields = ["businessStatus"] as const;

export interface ListingBusinessStatusInput {
  readonly businessStatus: ListingBusinessStatus;
}

export function validateListingBusinessStatusInput(value: unknown): ListingBusinessStatusInput {
  const body = validateBodyFields(value, businessStatusFields);
  requirePlainJsonObject(body);
  if (!Object.prototype.hasOwnProperty.call(body, "businessStatus")) {
    throwValidationIssue("businessStatus", "REQUIRED", "businessStatus is required.");
  }

  if (typeof body.businessStatus !== "string") {
    throwValidationIssue("businessStatus", "INVALID_TYPE", "businessStatus must be a string.");
  }

  const normalized = body.businessStatus.trim().toUpperCase();
  if (!isListingBusinessStatus(normalized)) {
    throwValidationIssue("businessStatus", "INVALID_VALUE", "businessStatus must be a valid business status.");
  }

  return Object.freeze({ businessStatus: normalized });
}
