import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import type { SupportRequest } from "../repositories/support-repository.js";
import type { AdminSupportRequest, SupportService } from "../services/support-service.js";
import {
  parseSupportRequestId,
  validateCreateSupportRequestBody,
  validateSupportRequestCollectionQuery,
  validateUpdateSupportRequestStatusBody
} from "../validations/support-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function supportReceiptDto(request: SupportRequest) {
  return { id: request.id, status: request.status, createdAt: request.createdAt };
}

function adminSupportDto(request: AdminSupportRequest) {
  return {
    id: request.id,
    requester: request.requester,
    category: request.category,
    subject: request.subject,
    message: request.message,
    status: request.status,
    resolutionNote: request.resolutionNote,
    assignedAdminId: request.assignedAdminId,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    resolvedAt: request.resolvedAt
  };
}

export function createCreateSupportRequestHandler(service: SupportService): RequestHandler {
  return (request, response, next) => {
    void service
      .create(principal(request), validateCreateSupportRequestBody(request.body))
      .then((supportRequest) => sendObject(response, supportReceiptDto(supportRequest), 201))
      .catch(next);
  };
}

export function createListAdminSupportRequestsHandler(service: SupportService): RequestHandler {
  return (request, response, next) => {
    void service
      .listAdmin(principal(request), validateSupportRequestCollectionQuery(request.query))
      .then((page) => sendPaginated(response, page.data.map(adminSupportDto), page))
      .catch(next);
  };
}

export function createGetAdminSupportRequestHandler(service: SupportService): RequestHandler {
  return (request, response, next) => {
    void service
      .getAdmin(principal(request), parseSupportRequestId(request.params.supportRequestId))
      .then((supportRequest) => sendObject(response, adminSupportDto(supportRequest)))
      .catch(next);
  };
}

export function createUpdateAdminSupportRequestStatusHandler(service: SupportService): RequestHandler {
  return (request, response, next) => {
    void service
      .updateAdmin(
        principal(request),
        parseSupportRequestId(request.params.supportRequestId),
        validateUpdateSupportRequestStatusBody(request.body)
      )
      .then((supportRequest) => sendObject(response, adminSupportDto(supportRequest)))
      .catch(next);
  };
}
