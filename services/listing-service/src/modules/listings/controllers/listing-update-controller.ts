import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import { mapOwnerListingToDto } from "../mappers/owner-listing-mapper.js";
import type { ListingUpdateService } from "../services/listing-update-service.js";
import { validateListingUpdateInput } from "../validations/listing-update-validation.js";

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
