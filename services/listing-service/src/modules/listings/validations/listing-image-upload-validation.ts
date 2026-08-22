import type { ListingImageMimeType } from "../../../../../shared/src/runtime/integrations/cloudinary.client.js";
import {
  ApplicationError,
  createValidationError
} from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { normalizeNullableString } from "../../../../../shared/src/runtime/shared/validation/normalization.js";
import { validationDetail } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { validateBodyFields } from "../../../../../shared/src/runtime/shared/validation/request.js";

export const maximumListingImageBytes = 5_242_880;
const maximumAltTextCodePoints = 255;
const unsupportedImageTypeMessage =
  "The image must be JPEG, PNG, or WebP and its declared type must match its content.";

export interface ValidatedListingImageUpload {
  readonly buffer: Buffer;
  readonly mimeType: ListingImageMimeType;
  readonly altText: string | null;
}

type DetectedImageFormat = "jpeg" | "png" | "webp";

function detectImageFormat(buffer: Buffer): DetectedImageFormat | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

function expectedFormat(mimeType: string): DetectedImageFormat | null {
  switch (mimeType) {
    case "image/jpeg":
      return "jpeg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

function unsupportedImageType(): ApplicationError {
  return new ApplicationError("UNSUPPORTED_IMAGE_TYPE", unsupportedImageTypeMessage);
}

export function validateListingImageUpload(
  file: Express.Multer.File | undefined,
  multipartBody: unknown
): ValidatedListingImageUpload {
  const body = validateBodyFields(multipartBody ?? {}, ["altText"]);
  if (!file) {
    throw createValidationError([validationDetail("image", "REQUIRED", "image is required.")]);
  }
  if (file.size > maximumListingImageBytes || file.buffer.length > maximumListingImageBytes) {
    throw new ApplicationError("PAYLOAD_TOO_LARGE", "The request payload is too large.");
  }

  const declaredFormat = expectedFormat(file.mimetype);
  const detectedFormat = detectImageFormat(file.buffer);
  if (declaredFormat === null || detectedFormat === null || declaredFormat !== detectedFormat) {
    throw unsupportedImageType();
  }

  const normalizedAltText = normalizeNullableString(body.altText, "altText") ?? null;
  if (normalizedAltText !== null && [...normalizedAltText].length > maximumAltTextCodePoints) {
    throw createValidationError([validationDetail("altText", "TOO_LONG", "altText must not exceed 255 characters.")]);
  }

  return Object.freeze({
    buffer: Buffer.from(file.buffer),
    mimeType: file.mimetype as ListingImageMimeType,
    altText: normalizedAltText
  });
}
