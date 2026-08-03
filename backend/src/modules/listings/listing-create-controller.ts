import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { sendObject } from "../../shared/http/responses.js";
import { authenticationRequiredMessage } from "../../shared/middleware/authentication.js";
import { validateQueryKeys } from "../../shared/validation/request.js";
import { validateCreateListingDraftInput } from "./listing-create-validation.js";
import type { ListingCreateService } from "./listing-create-service.js";
import { mapOwnerListingToDto } from "./owner-listing-mapper.js";

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) {
    throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  }

  return request.auth;
}

export function createListingDraftHandler(service: ListingCreateService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      validateQueryKeys(request.query, []);
      const input = validateCreateListingDraftInput(request.body);
      const listing = await service.createDraft(principal, input);
      sendObject(response, mapOwnerListingToDto(listing), 201);
    })().catch(next);
  };
}
