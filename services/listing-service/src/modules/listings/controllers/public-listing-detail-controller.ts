import type { RequestHandler } from "express";
import { sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { throwValidationIssue } from "../../../../../shared/src/runtime/shared/validation/issues.js";
import { parsePathId } from "../../../../../shared/src/runtime/shared/validation/parsing.js";
import { validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { PublicListingDetailService } from "../services/public-listing-detail-service.js";

function parseListingId(value: string | string[]): number {
  if (typeof value !== "string") {
    throwValidationIssue("listingId", "INVALID_TYPE", "listingId must be provided exactly once.");
  }
  return parsePathId(value, "listingId");
}

function validateBody(value: unknown): void {
  if (value !== undefined) {
    throwValidationIssue("body", "INVALID_VALUE", "body must be omitted.");
  }
}

export function createPublicListingDetailHandler(service: PublicListingDetailService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const listingId = parseListingId(request.params.listingId);
      validateQueryKeys(request.query, []);
      validateBody(request.body);
      sendObject(response, await service.getPublicDetail(listingId, request.auth));
    })().catch(next);
  };
}
