import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateJsonText } from "../../../../../shared/src/runtime/shared/validation/primitives.js";
import {
  readScalarQueryValue,
  validateBodyFields,
  validateQueryKeys
} from "../../../../../shared/src/runtime/shared/validation/request.js";

export interface ListingNoteInput {
  readonly note: string;
}

export function validateListingNoteBody(value: unknown): ListingNoteInput {
  const body = validateBodyFields(value, ["note"]);
  if (!("note" in body)) throwValidationIssue("note", "REQUIRED", "note is required.");
  const note = validateJsonText(body.note, "note", {
    maximumLength: 2_000,
    nullable: false,
    nonblank: true
  }) as string;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(note)) {
    throwValidationIssue("note", "INVALID_VALUE", "note contains unsupported control characters.");
  }
  return Object.freeze({ note });
}

export function validateListingNoteQuery(value: unknown): readonly number[] {
  const query = validateQueryKeys(value, ["listingIds"]);
  const raw = readScalarQueryValue(query.listingIds, "listingIds");
  if (!raw) throwValidationIssue("listingIds", "REQUIRED", "listingIds is required.");
  const parts = raw.split(",");
  if (parts.length < 1 || parts.length > 4) {
    throwValidationIssue("listingIds", "OUT_OF_RANGE", "listingIds must contain between 1 and 4 IDs.");
  }
  const ids = parts.map((part) => parsePathId(part, "listingIds"));
  if (new Set(ids).size !== ids.length) {
    throwValidationIssue("listingIds", "INVALID_VALUE", "listingIds must not contain duplicates.");
  }
  return Object.freeze(ids);
}

export function parseListingNoteId(value: string | string[]): number {
  if (typeof value !== "string") {
    throwValidationIssue("listingId", "INVALID_TYPE", "listingId must be provided exactly once.");
  }
  return parsePathId(value, "listingId");
}
