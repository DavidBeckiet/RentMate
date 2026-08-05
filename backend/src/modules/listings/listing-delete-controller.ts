import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { sendNoContent } from "../../shared/http/responses.js";
import { authenticationRequiredMessage } from "../../shared/middleware/authentication.js";
import { throwValidationIssue } from "../../shared/validation/issues.js";
import { parsePathId } from "../../shared/validation/parsing.js";
import { validateQueryKeys } from "../../shared/validation/request.js";
import type { ListingDeleteService } from "./listing-delete-service.js";

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function parseListingId(value: string | string[]): number {
  if (typeof value !== "string") {
    throwValidationIssue("listingId", "INVALID_TYPE", "listingId must be provided exactly once.");
  }
  return parsePathId(value, "listingId");
}

function validateAbsentBody(value: unknown): void {
  if (value !== undefined) {
    throwValidationIssue("body", "INVALID_VALUE", "body must be omitted.");
  }
}

export function createDeleteOwnerListingHandler(service: ListingDeleteService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const listingId = parseListingId(request.params.listingId);
      validateQueryKeys(request.query, []);
      validateAbsentBody(request.body);
      await service.deleteOwnedListing(principal, listingId);
      sendNoContent(response);
    })().catch(next);
  };
}
