import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { sendObject, sendPaginated } from "../../shared/http/responses.js";
import { authenticationRequiredMessage } from "../../shared/middleware/authentication.js";
import { throwValidationIssue } from "../../shared/validation/issues.js";
import { parsePathId } from "../../shared/validation/parsing.js";
import { validateQueryKeys } from "../../shared/validation/request.js";
import { validateOwnerListingCollectionQuery, validateOwnerListingReadBody } from "./owner-listing-read-validation.js";
import type { OwnerListingReadService } from "./owner-listing-read-service.js";
import { mapOwnerListingToDto } from "./owner-listing-mapper.js";
import { mapOwnerListingSummaryToDto } from "./owner-listing-summary-mapper.js";

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
      sendPaginated(response, page.summaries.map(mapOwnerListingSummaryToDto), {
        page: page.page,
        pageSize: page.pageSize,
        hasNextPage: page.hasNextPage
      });
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
