import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { sendNoContent, sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { validateBodyFields, validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type {
  RoommateSafetyService,
  RoommateAdminReportView,
  RoommateMessageView,
  RoommateOwnedBlockView
} from "../services/roommate-safety-service.js";
import { parseRoommateInterestId } from "../validations/roommate-interest-validation.js";
import {
  parseRoommateMessageId,
  validateCreateRoommateMessageBody,
  validateRoommateMessagePageQuery
} from "../validations/roommate-message-validation.js";
import {
  parseRoommateReportId,
  parseRoommateTenantId,
  validateRoommateBlockPageQuery,
  validateRoommateInterestReportBody,
  validateRoommateMessageReportBody,
  validateRoommateModerationBody,
  validateRoommateReportCollectionQuery,
  validateRoommateRequestReportBody,
  validateUpdateRoommateReportStatusBody
} from "../validations/roommate-safety-validation.js";
import { parseRoommateRequestId } from "../validations/roommate-validation.js";

function principal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function emptyBody(value: unknown): void {
  if (value === undefined) return;
  validateBodyFields(value, []);
}

function emptyQuery(value: unknown): void {
  validateQueryKeys(value, []);
}

function messageDto(message: RoommateMessageView) {
  return {
    id: message.id,
    sender: message.sender,
    body: message.body,
    createdAt: message.createdAt,
    isRead: message.isRead
  };
}

function reportDto(report: RoommateAdminReportView, includeDetail: boolean) {
  return {
    id: report.id,
    targetType: report.targetType,
    category: report.category,
    details: report.details,
    status: report.status,
    resolutionNote: report.resolutionNote,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    resolvedAt: report.resolvedAt,
    reporter: report.reporter,
    subject: report.subject,
    riskSummary: report.riskSummary,
    ...(includeDetail ? { evidenceSnapshot: report.evidenceSnapshot, events: report.events } : {})
  };
}

function ownedBlockDto(block: RoommateOwnedBlockView) {
  return {
    blockedAt: block.blockedAt,
    counterpart: block.counterpart,
    unblockAction: block.unblockAction
  };
}

export function listRoommateMessagesHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyBody(request.body);
    void service
      .listMessages(
        principal(request),
        parseRoommateInterestId(request.params.interestId),
        validateRoommateMessagePageQuery(request.query)
      )
      .then((page) => sendPaginated(response, page.data.map(messageDto), page))
      .catch(next);
  };
}

export function sendRoommateMessageHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    void service
      .sendMessage(
        principal(request),
        parseRoommateInterestId(request.params.interestId),
        validateCreateRoommateMessageBody(request.body)
      )
      .then((message) => sendObject(response, messageDto(message), 201))
      .catch(next);
  };
}

export function markRoommateMessagesReadHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    emptyBody(request.body);
    void service
      .markMessagesRead(principal(request), parseRoommateInterestId(request.params.interestId))
      .then(() => sendNoContent(response))
      .catch(next);
  };
}

export function blockRoommateRequestHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    emptyBody(request.body);
    void service
      .blockRequest(principal(request), parseRoommateRequestId(request.params.requestId))
      .then((state) => sendObject(response, state))
      .catch(next);
  };
}

export function unblockRoommateRequestHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    emptyBody(request.body);
    void service
      .unblockRequest(principal(request), parseRoommateRequestId(request.params.requestId))
      .then((state) => sendObject(response, state))
      .catch(next);
  };
}

export function blockRoommateInterestHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    emptyBody(request.body);
    void service
      .blockInterest(principal(request), parseRoommateInterestId(request.params.interestId))
      .then((state) => sendObject(response, state))
      .catch(next);
  };
}

export function unblockRoommateInterestHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    emptyBody(request.body);
    void service
      .unblockInterest(principal(request), parseRoommateInterestId(request.params.interestId))
      .then((state) => sendObject(response, state))
      .catch(next);
  };
}

export function listOwnedRoommateBlocksHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyBody(request.body);
    void service
      .listOwnedBlocks(principal(request), validateRoommateBlockPageQuery(request.query))
      .then((page) => sendPaginated(response, page.data.map(ownedBlockDto), page))
      .catch(next);
  };
}

export function createRoommateRequestReportHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    void service
      .createRequestReport(
        principal(request),
        parseRoommateRequestId(request.params.requestId),
        validateRoommateRequestReportBody(request.body)
      )
      .then((report) => sendObject(response, report, 201))
      .catch(next);
  };
}

export function createRoommateInterestReportHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    void service
      .createInterestReport(
        principal(request),
        parseRoommateInterestId(request.params.interestId),
        validateRoommateInterestReportBody(request.body)
      )
      .then((report) => sendObject(response, report, 201))
      .catch(next);
  };
}

export function createRoommateMessageReportHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    void service
      .createMessageReport(
        principal(request),
        parseRoommateMessageId(request.params.messageId),
        validateRoommateMessageReportBody(request.body)
      )
      .then((report) => sendObject(response, report, 201))
      .catch(next);
  };
}

export function listRoommateAdminReportsHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    const source = request.query.source;
    if (typeof source !== "string" || source.trim().toUpperCase() !== "ROOMMATE") {
      next();
      return;
    }
    emptyBody(request.body);
    void service
      .listAdminReports(principal(request), validateRoommateReportCollectionQuery(request.query))
      .then((page) =>
        sendPaginated(
          response,
          page.data.map((report) => reportDto(report, false)),
          page
        )
      )
      .catch(next);
  };
}

export function getRoommateAdminReportHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    emptyBody(request.body);
    void service
      .getAdminReport(principal(request), parseRoommateReportId(request.params.reportId))
      .then((report) => {
        if (!report) {
          next();
          return;
        }
        sendObject(response, reportDto(report, true));
      })
      .catch(next);
  };
}

export function updateRoommateAdminReportStatusHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    void service
      .updateAdminReportStatus(
        principal(request),
        parseRoommateReportId(request.params.reportId),
        validateUpdateRoommateReportStatusBody(request.body)
      )
      .then((report) => {
        if (!report) {
          next();
          return;
        }
        sendObject(response, reportDto(report, true));
      })
      .catch(next);
  };
}

export function moderateRoommateProfileHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    void service
      .moderateProfile(
        principal(request),
        parseRoommateTenantId(request.params.tenantId),
        validateRoommateModerationBody(request.body)
      )
      .then((result) => sendObject(response, result))
      .catch(next);
  };
}

export function moderateRoommateRequestHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    void service
      .moderateRequest(
        principal(request),
        parseRoommateRequestId(request.params.requestId),
        validateRoommateModerationBody(request.body)
      )
      .then((result) => sendObject(response, result))
      .catch(next);
  };
}

export function moderateRoommateMessageHandler(service: RoommateSafetyService): RequestHandler {
  return (request, response, next) => {
    emptyQuery(request.query);
    void service
      .moderateMessage(
        principal(request),
        parseRoommateMessageId(request.params.messageId),
        validateRoommateModerationBody(request.body)
      )
      .then((result) => sendObject(response, result))
      .catch(next);
  };
}
