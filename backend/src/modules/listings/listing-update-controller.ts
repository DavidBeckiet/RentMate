import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { sendObject } from "../../shared/http/responses.js";
import { authenticationRequiredMessage } from "../../shared/middleware/authentication.js";
import { throwValidationIssue } from "../../shared/validation/issues.js";
import { parsePathId } from "../../shared/validation/parsing.js";
import { validateQueryKeys } from "../../shared/validation/request.js";
import { mapOwnerListingToDto } from "./owner-listing-mapper.js";
import type { ListingUpdateService } from "./listing-update-service.js";
import { validateListingUpdateInput } from "./listing-update-validation.js";

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}
function parseListingId(value: string | string[]): number {
  if (typeof value !== "string")
    throwValidationIssue("listingId", "INVALID_TYPE", "listingId must be provided exactly once.");
  return parsePathId(value, "listingId");
}
export function createUpdateOwnerListingHandler(service: ListingUpdateService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const listingId = parseListingId(request.params.listingId);
      validateQueryKeys(request.query, []);
      const input = validateListingUpdateInput(request.body);
      const listing = await service.updateOwnedListing(principal, listingId, input);
      sendObject(response, mapOwnerListingToDto(listing));
    })().catch(next);
  };
}
