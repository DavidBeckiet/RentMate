import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { sendObject } from "../../shared/http/responses.js";
import { authenticationRequiredMessage } from "../../shared/middleware/authentication.js";
import { parsePathId } from "../../shared/validation/parsing.js";
import { validateQueryKeys } from "../../shared/validation/request.js";
import { mapOwnerImageToDto } from "./owner-image-mapper.js";
import type { ListingImageUploadPreflight, ListingImageUploadService } from "./listing-image-upload-service.js";
import { validateListingImageUpload } from "./listing-image-upload-validation.js";

interface UploadLocals {
  listingImageUploadPreflight?: ListingImageUploadPreflight;
}

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function parseListingId(value: string | string[]): number {
  if (typeof value !== "string") {
    throw new ApplicationError("VALIDATION_FAILED", "The request contains invalid data.", {
      details: [{ field: "listingId", code: "INVALID_TYPE", message: "listingId must be provided exactly once." }]
    });
  }
  return parsePathId(value, "listingId");
}

function requireMultipartContentType(request: Request): void {
  if (!request.is("multipart/form-data")) {
    throw new ApplicationError("MALFORMED_REQUEST", "The multipart request is malformed.");
  }
}

export function createListingImageUploadPreflightHandler(service: ListingImageUploadService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const listingId = parseListingId(request.params.listingId);
      validateQueryKeys(request.query, []);
      requireMultipartContentType(request);
      const preflight = await service.preflightOwnedUpload(principal, listingId);
      (response.locals as UploadLocals).listingImageUploadPreflight = preflight;
      next();
    })().catch(next);
  };
}

export function createListingImageUploadHandler(service: ListingImageUploadService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const preflight = (response.locals as UploadLocals).listingImageUploadPreflight;
      if (!preflight) throw new Error("Listing image upload preflight is unavailable.");
      const upload = validateListingImageUpload(request.file, request.body);
      const image = await service.completeOwnedUpload(preflight, upload);
      sendObject(response, mapOwnerImageToDto(image), 201);
    })().catch(next);
  };
}
