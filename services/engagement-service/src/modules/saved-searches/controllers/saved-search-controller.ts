import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendNoContent, sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import type { SavedSearch } from "../repositories/saved-search-repository.js";
import type { SavedSearchService } from "../services/saved-search-service.js";
import {
  parseSavedSearchId,
  validateCreateSavedSearchBody,
  validateSavedSearchCollectionQuery,
  validateUpdateSavedSearchBody
} from "../validations/saved-search-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function dto(savedSearch: SavedSearch) {
  return {
    id: savedSearch.id,
    name: savedSearch.name,
    isActive: savedSearch.isActive,
    query: savedSearch.query,
    createdAt: savedSearch.createdAt,
    updatedAt: savedSearch.updatedAt
  };
}

export function createSavedSearchHandler(service: SavedSearchService): RequestHandler {
  return (request, response, next) => {
    void service
      .create(principal(request), validateCreateSavedSearchBody(request.body))
      .then((value) => sendObject(response, dto(value), 201))
      .catch(next);
  };
}

export function listSavedSearchesHandler(service: SavedSearchService): RequestHandler {
  return (request, response, next) => {
    void service
      .list(principal(request), validateSavedSearchCollectionQuery(request.query))
      .then((page) => sendPaginated(response, page.data.map(dto), page))
      .catch(next);
  };
}

export function updateSavedSearchHandler(service: SavedSearchService): RequestHandler {
  return (request, response, next) => {
    void service
      .update(
        principal(request),
        parseSavedSearchId(request.params.savedSearchId),
        validateUpdateSavedSearchBody(request.body)
      )
      .then((value) => sendObject(response, dto(value)))
      .catch(next);
  };
}

export function deleteSavedSearchHandler(service: SavedSearchService): RequestHandler {
  return (request, response, next) => {
    void service
      .remove(principal(request), parseSavedSearchId(request.params.savedSearchId))
      .then(() => sendNoContent(response))
      .catch(next);
  };
}
