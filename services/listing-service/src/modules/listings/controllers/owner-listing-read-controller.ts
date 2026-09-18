import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import {
  validateOwnerListingCollectionQuery,
  validateOwnerListingReadBody
} from "../validations/owner-listing-read-validation.js";
import type { OwnerListingReadService } from "../services/owner-listing-read-service.js";
import { mapOwnerListingToDto } from "../mappers/owner-listing-mapper.js";
import { mapOwnerListingSummaryToDto } from "../mappers/owner-listing-summary-mapper.js";

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) {
    throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  }
  return request.auth;
}

function parseListingId(value: string | string[]): number {
  if (typeof value !== "string") {
    throwValidationIssue("listingId", "INVALID_TYPE", "listingId must be provided exactly once.");
  }
  return parsePathId(value, "listingId");
}

export function createListOwnerListingsHandler(service: OwnerListingReadService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const query = validateOwnerListingCollectionQuery(request.query);
      validateOwnerListingReadBody(request.body);
      const page = await service.listOwned(principal, query);
      sendPaginated(
        response,
        page.summaries.map(mapOwnerListingSummaryToDto),
        {
          page: page.page,
          pageSize: page.pageSize,
          hasNextPage: page.hasNextPage
        },
        200,
        { hasEverApprovedListing: page.hasEverApprovedListing }
      );
    })().catch(next);
  };
}

export function createGetOwnerListingDetailHandler(service: OwnerListingReadService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const listingId = parseListingId(request.params.listingId);
      validateQueryKeys(request.query, []);
      validateOwnerListingReadBody(request.body);
      const listing = await service.getOwnedDetail(principal, listingId);
      sendObject(response, mapOwnerListingToDto(listing));
    })().catch(next);
  };
}
