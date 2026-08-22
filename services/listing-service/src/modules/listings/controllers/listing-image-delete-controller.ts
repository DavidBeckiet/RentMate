import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendNoContent } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { ListingImageDeleteService } from "../services/listing-image-delete-service.js";

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function parseIdentifier(value: string | string[], field: "listingId" | "imageId"): number {
  if (typeof value !== "string") {
    throwValidationIssue(field, "INVALID_TYPE", `${field} must be provided exactly once.`);
  }
  return parsePathId(value, field);
}

function validateAbsentBody(value: unknown): void {
  if (value !== undefined) {
    throwValidationIssue("body", "INVALID_VALUE", "body must be omitted.");
  }
}

export function createDeleteListingImageHandler(service: ListingImageDeleteService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const listingId = parseIdentifier(request.params.listingId, "listingId");
      const imageId = parseIdentifier(request.params.imageId, "imageId");
      validateQueryKeys(request.query, []);
      validateAbsentBody(request.body);
      await service.deleteOwnedImage(principal, listingId, imageId);
      sendNoContent(response);
    })().catch(next);
  };
}
