import { normalizePhone } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import {
  requirePlainJsonObject,
  validateBodyFields,
  type PlainJsonObject
} from "../../../../../shared/src/runtime/shared/validation/request.js";

const fields = ["phone"] as const;

export interface GoogleLandlordCompletionInput {
  readonly phone: string;
}

export function validateGoogleLandlordCompletionInput(value: unknown): GoogleLandlordCompletionInput {
  const body: PlainJsonObject = requirePlainJsonObject(value);
  validateBodyFields(body, fields);
  const phone = normalizePhone(body.phone, "phone", "required");
  if (!phone) throw new Error("Google landlord completion phone validation did not produce a value.");
  return Object.freeze({ phone });
}
