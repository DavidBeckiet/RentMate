import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import type { LandlordLead, LeadNoteState } from "../repositories/lead-repository.js";
import type { LeadService } from "../services/lead-service.js";
import {
  parseLeadInquiryId,
  validateLeadCollectionQuery,
  validateLeadNoteBody
} from "../validations/lead-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function leadDto(lead: LandlordLead) {
  return {
    inquiryId: lead.inquiryId,
    listingId: lead.listingId,
    status: lead.status,
    contactPhone: lead.contactPhone,
    preferredContactAt: lead.preferredContactAt,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    lastMessage: lead.lastMessage,
    needsReply: lead.needsReply,
    hasUnreadTenantMessages: lead.hasUnreadTenantMessages,
    note: lead.note,
    noteUpdatedAt: lead.noteUpdatedAt
  };
}

function noteDto(note: LeadNoteState) {
  return { inquiryId: note.inquiryId, note: note.note, updatedAt: note.updatedAt };
}

export function createListLeadsHandler(service: LeadService): RequestHandler {
  return (request, response, next) => {
    void service
      .list(principal(request), validateLeadCollectionQuery(request.query))
      .then((page) => sendPaginated(response, page.data.map(leadDto), page))
      .catch(next);
  };
}

export function createSaveLeadNoteHandler(service: LeadService): RequestHandler {
  return (request, response, next) => {
    void service
      .saveNote(principal(request), parseLeadInquiryId(request.params.inquiryId), validateLeadNoteBody(request.body))
      .then((note) => sendObject(response, noteDto(note)))
      .catch(next);
  };
}
