import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { sendNoContent, sendPaginated } from "../../shared/http/responses.js";
import { authenticationRequiredMessage } from "../../shared/middleware/authentication.js";
import type { FavoriteService } from "./favorite-service.js";
import {
  parseFavoriteListingId,
  validateFavoriteBody,
  validateFavoriteCollectionQuery,
  validateFavoriteMutationQuery
} from "./favorite-validation.js";

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

export function createListFavoritesHandler(service: FavoriteService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const query = validateFavoriteCollectionQuery(request.query);
      validateFavoriteBody(request.body);
      const principal = requirePrincipal(request);
      const page = await service.listFavorites(principal, query);
      sendPaginated(response, page.summaries, page);
    })().catch(next);
  };
}

export function createEnsureFavoritePresentHandler(service: FavoriteService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const listingId = parseFavoriteListingId(request.params.listingId);
      validateFavoriteMutationQuery(request.query);
      validateFavoriteBody(request.body);
      await service.ensureFavoritePresent(requirePrincipal(request), listingId);
      sendNoContent(response);
    })().catch(next);
  };
}

export function createEnsureFavoriteAbsentHandler(service: FavoriteService): RequestHandler {
  return (request, response, next): void => {
    void (async () => {
      const listingId = parseFavoriteListingId(request.params.listingId);
      validateFavoriteMutationQuery(request.query);
      validateFavoriteBody(request.body);
      await service.ensureFavoriteAbsent(requirePrincipal(request), listingId);
      sendNoContent(response);
    })().catch(next);
  };
}
