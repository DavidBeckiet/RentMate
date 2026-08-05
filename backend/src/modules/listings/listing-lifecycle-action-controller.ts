import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { sendObject } from "../../shared/http/responses.js";
import { authenticationRequiredMessage } from "../../shared/middleware/authentication.js";
import type { AuthenticatedPrincipal } from "../../shared/types/authentication.js";
import { throwValidationIssue } from "../../shared/validation/issues.js";
import { parsePathId } from "../../shared/validation/parsing.js";
import { validateQueryKeys } from "../../shared/validation/request.js";
import { mapOwnerListingToDto, type OwnerListingDetail } from "./owner-listing-mapper.js";
import type { ListingLifecycleActionService } from "./listing-lifecycle-action-service.js";

type LifecycleOperation = (principal: AuthenticatedPrincipal, listingId: number) => Promise<OwnerListingDetail>;

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

function createLifecycleActionHandler(operation: LifecycleOperation): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const listingId = parseListingId(request.params.listingId);
      validateQueryKeys(request.query, []);
      validateAbsentBody(request.body);
      const listing = await operation(principal, listingId);
      sendObject(response, mapOwnerListingToDto(listing), 200);
    })().catch(next);
  };
}

export function createDeactivateOwnerListingHandler(service: ListingLifecycleActionService): RequestHandler {
  return createLifecycleActionHandler(service.deactivateOwnedListing);
}

export function createReactivateOwnerListingHandler(service: ListingLifecycleActionService): RequestHandler {
  return createLifecycleActionHandler(service.reactivateOwnedListing);
}
