import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendNoContent, sendObject } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import type { ListingNote } from "../repositories/listing-note-repository.js";
import type { ListingNoteService } from "../services/listing-note-service.js";
import {
  parseListingNoteId,
  validateListingNoteBody,
  validateListingNoteQuery
} from "../validations/listing-note-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function dto(value: ListingNote) {
  return {
    listingId: value.listingId,
    note: value.note,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

export function listListingNotesHandler(service: ListingNoteService): RequestHandler {
  return (request, response, next) => {
    void service
      .list(principal(request), validateListingNoteQuery(request.query))
      .then((notes) => sendObject(response, notes.map(dto)))
      .catch(next);
  };
}

export function saveListingNoteHandler(service: ListingNoteService): RequestHandler {
  return (request, response, next) => {
    void service
      .save(
        principal(request),
        parseListingNoteId(request.params.listingId),
        validateListingNoteBody(request.body).note
      )
      .then((note) => sendObject(response, dto(note)))
      .catch(next);
  };
}

export function deleteListingNoteHandler(service: ListingNoteService): RequestHandler {
  return (request, response, next) => {
    void service
      .remove(principal(request), parseListingNoteId(request.params.listingId))
      .then(() => sendNoContent(response))
      .catch(next);
  };
}
