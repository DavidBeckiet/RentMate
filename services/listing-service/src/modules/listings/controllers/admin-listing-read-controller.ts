import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { mapAdminListingDetailToDto } from "../mappers/admin-listing-detail-mapper.js";
import type { AdminListingReadService } from "../services/admin-listing-read-service.js";
import {
  parseAdminListingId,
  validateAdminDetailQuery,
  validateAdminListingCollectionQuery,
  validateAdminModerationHistoryQuery,
  validateAdminReadBody
} from "../validations/admin-listing-read-validation.js";
import { mapAdminListingSummaryToDto } from "../mappers/admin-listing-summary-mapper.js";
import { mapModerationHistoryItemToDto } from "../mappers/moderation-history-mapper.js";

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

export function createListAdminListingsHandler(service: AdminListingReadService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const query = validateAdminListingCollectionQuery(request.query);
      validateAdminReadBody(request.body);
      const page = await service.listAdminListings(principal, query);
      sendPaginated(response, page.summaries.map(mapAdminListingSummaryToDto), page);
    })().catch(next);
  };
}

export function createGetAdminListingDetailHandler(service: AdminListingReadService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const listingId = parseAdminListingId(request.params.listingId);
      validateAdminDetailQuery(request.query);
      validateAdminReadBody(request.body);
      sendObject(response, mapAdminListingDetailToDto(await service.getAdminListingDetail(principal, listingId)));
    })().catch(next);
  };
}

export function createListModerationHistoryHandler(service: AdminListingReadService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const principal = requirePrincipal(request);
      const listingId = parseAdminListingId(request.params.listingId);
      const query = validateAdminModerationHistoryQuery(request.query);
      validateAdminReadBody(request.body);
      const page = await service.listModerationHistory(principal, listingId, query);
      sendPaginated(response, page.items.map(mapModerationHistoryItemToDto), page);
    })().catch(next);
  };
}
