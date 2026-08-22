import type { RequestHandler } from "express";
import multer from "multer";
import {
  ApplicationError,
  createValidationError
} from "../../../../shared/src/runtime/shared/errors/application-error.js";
import { validationDetail } from "../../../../shared/src/runtime/shared/validation/issues.js";
import { maximumListingImageBytes } from "./validations/listing-image-upload-validation.js";

const parser = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Busboy reports its limit event when the boundary is reached, so one extra
    // unit keeps the contract boundary inclusive; post-parse validation enforces
    // the exact 5 MiB/2-part maximum.
    fileSize: maximumListingImageBytes + 1,
    files: 1,
    fields: 1,
    parts: 3,
    fieldSize: 1_024
  }
}).single("image");

function mapMultipartError(error: unknown): Error {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new ApplicationError("PAYLOAD_TOO_LARGE", "The request payload is too large.");
    }
    if (error.code === "MISSING_FIELD_NAME") {
      return new ApplicationError("MALFORMED_REQUEST", "The multipart request is malformed.");
    }
    return createValidationError([
      validationDetail(
        error.field ?? "multipart",
        error.code === "LIMIT_UNEXPECTED_FILE" ? "DUPLICATE_VALUE" : "INVALID_VALUE",
        "The multipart request must contain exactly one image and at most one altText field."
      )
    ]);
  }
  return new ApplicationError("MALFORMED_REQUEST", "The multipart request is malformed.");
}

export const listingImageUploadMultipartMiddleware: RequestHandler = (request, response, next): void => {
  parser(request, response, (error?: unknown) => {
    if (error !== undefined) next(mapMultipartError(error));
    else next();
  });
};
