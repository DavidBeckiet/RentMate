import { ValidationIssueCollector, validationDetail } from "../../../../shared/src/runtime/shared/validation/issues.js";
import { validateBodyFields } from "../../../../shared/src/runtime/shared/validation/request.js";

const maximumImageId = 2_147_483_647;

export interface ValidatedListingImageOrder {
  readonly imageIds: readonly number[];
}

export function validateListingImageOrder(value: unknown): ValidatedListingImageOrder {
  const body = validateBodyFields(value, ["imageIds"]);
  const collector = new ValidationIssueCollector();

  if (!Object.prototype.hasOwnProperty.call(body, "imageIds")) {
    collector.add(validationDetail("imageIds", "REQUIRED", "imageIds is required."));
    collector.throwIfAny();
  }

  const rawImageIds = body.imageIds;
  if (!Array.isArray(rawImageIds)) {
    collector.add(validationDetail("imageIds", "INVALID_TYPE", "imageIds must be an array."));
    collector.throwIfAny();
    throw new Error("Listing image-order validation did not produce an issue.");
  }

  if (rawImageIds.length > 8) {
    collector.add(validationDetail("imageIds", "TOO_LONG", "imageIds must contain at most eight items."));
  }

  const imageIds: number[] = [];
  const seen = new Set<number>();
  for (const [index, value] of rawImageIds.entries()) {
    if (!Number.isInteger(value)) {
      collector.add(
        validationDetail(`imageIds[${index}]`, "INVALID_TYPE", "Each imageIds item must be an integer number.")
      );
      continue;
    }

    const imageId = value as number;
    if (imageId < 1 || imageId > maximumImageId) {
      collector.add(
        validationDetail(`imageIds[${index}]`, "OUT_OF_RANGE", "Each imageIds item must be between 1 and 2147483647.")
      );
      continue;
    }

    if (seen.has(imageId)) {
      collector.add(validationDetail("imageIds", "DUPLICATE_VALUE", "imageIds must not contain duplicates."));
      continue;
    }

    seen.add(imageId);
    imageIds.push(imageId);
  }

  collector.throwIfAny();
  return Object.freeze({ imageIds: Object.freeze(imageIds) });
}
