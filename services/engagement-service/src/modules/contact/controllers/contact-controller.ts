import type { Request, RequestHandler, Response } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { sendNoContent, sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import { validateQueryKeys } from "../../../../../shared/src/runtime/shared/validation/request.js";
import type { InquiryMessage, Notification } from "../repositories/contact-repository.js";
import type { ContactReport, ContactReportEvent } from "../repositories/contact-safety-repository.js";
import type { InquiryRealtimeEvent, InquiryRealtimeHub } from "../realtime/inquiry-realtime-hub.js";
import type {
  AdminContactReport,
  AdminContactReportDetail,
  ContactService,
  InquiryView
} from "../services/contact-service.js";
import {
  parseContactId,
  validateContactCollectionQuery,
  validateCreateInquiryBody,
  validateMessageBody,
  validateNotificationReadBody,
  validateStatusBody
} from "../validations/contact-validation.js";
import {
  parseContactReportId,
  validateContactReportCollectionQuery,
  validateCreateContactReportBody,
  validateUpdateContactReportStatusBody
} from "../validations/contact-safety-validation.js";

function requirePrincipal(request: Request): NonNullable<Request["auth"]> {
  if (!request.auth) throw new ApplicationError("AUTHENTICATION_REQUIRED", authenticationRequiredMessage);
  return request.auth;
}

function messageDto(message: InquiryMessage) {
  return {
    id: message.id,
    senderRole: message.senderRole,
    body: message.body,
    isRead: message.isRead,
    createdAt: message.createdAt
  };
}

function inquiryDto(inquiry: InquiryView) {
  return {
    id: inquiry.id,
    listingId: inquiry.listingId,
    status: inquiry.status,
    contactPhone: inquiry.contactPhone,
    preferredContactAt: inquiry.preferredContactAt,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
    canSendMessage: inquiry.canSendMessage,
    blockedByCurrentUser: inquiry.blockedByCurrentUser,
    messages: inquiry.messages.map(messageDto)
  };
}

function blockStateDto(state: { readonly canSendMessage: boolean; readonly blockedByCurrentUser: boolean }) {
  return {
    canSendMessage: state.canSendMessage,
    blockedByCurrentUser: state.blockedByCurrentUser
  };
}

function reportReceiptDto(report: ContactReport) {
  return {
    id: report.id,
    inquiryId: report.inquiryId,
    category: report.category,
    status: report.status,
    createdAt: report.createdAt
  };
}

function reportMessageDto(message: ContactReport["message"]) {
  return message
    ? { id: message.id, senderRole: message.senderRole, body: message.body, createdAt: message.createdAt }
    : null;
}

function reportEventDto(event: ContactReportEvent) {
  return {
    id: event.id,
    actorId: event.actorId,
    actorRole: event.actorRole,
    previousStatus: event.previousStatus,
    newStatus: event.newStatus,
    note: event.note,
    createdAt: event.createdAt
  };
}

function adminReportDto(report: AdminContactReport) {
  return {
    id: report.id,
    inquiryId: report.inquiryId,
    listingId: report.listingId,
    reporter: { id: report.reporter.id, email: report.reporter.email, isActive: report.reporter.isActive },
    message: reportMessageDto(report.message),
    category: report.category,
    details: report.details,
    status: report.status,
    resolutionNote: report.resolutionNote,
    assignedAdminId: report.assignedAdminId,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    resolvedAt: report.resolvedAt
  };
}

function adminReportDetailDto(report: AdminContactReportDetail) {
  return { ...adminReportDto(report), events: report.events.map(reportEventDto) };
}

function notificationDto(notification: Notification) {
  return {
    id: notification.id,
    eventType: notification.eventType,
    inquiryId: notification.inquiryId,
    listingId: notification.listingId,
    resourcePath: notification.resourcePath,
    isRead: notification.isRead,
    createdAt: notification.createdAt
  };
}

function writeRealtimeEvent(response: Response, event: InquiryRealtimeEvent): void {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export const inquiryRealtimePolicy = Object.freeze({
  heartbeatIntervalMs: 5_000,
  connectionLifetimeMs: 45_000,
  reconnectDelayMs: 2_000
});

export function createCreateInquiryHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const inquiry = await service.createInquiry(requirePrincipal(request), validateCreateInquiryBody(request.body));
      sendObject(response, inquiryDto(inquiry), 201);
    })().catch(next);
  };
}

export function createListTenantInquiriesHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const page = await service.listTenantInquiries(
        requirePrincipal(request),
        validateContactCollectionQuery(request.query)
      );
      sendPaginated(response, page.data.map(inquiryDto), page);
    })().catch(next);
  };
}

export function createListLandlordInquiriesHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const page = await service.listLandlordInquiries(
        requirePrincipal(request),
        validateContactCollectionQuery(request.query)
      );
      sendPaginated(response, page.data.map(inquiryDto), page);
    })().catch(next);
  };
}

export function createGetInquiryHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      sendObject(
        response,
        inquiryDto(await service.getInquiry(requirePrincipal(request), parseContactId(request.params.inquiryId)))
      );
    })().catch(next);
  };
}

export function createSendMessageHandler(service: ContactService, realtimeHub: InquiryRealtimeHub): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const { body } = validateMessageBody(request.body);
      const inquiryId = parseContactId(request.params.inquiryId);
      const message = await service.sendMessage(requirePrincipal(request), inquiryId, body);
      realtimeHub.publish(Object.freeze({ type: "MESSAGE_CREATED", inquiryId, message }));
      sendObject(response, messageDto(message), 201);
    })().catch(next);
  };
}

export function createBlockInquiryHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateNotificationReadBody(request.body);
      sendObject(
        response,
        blockStateDto(await service.blockInquiry(requirePrincipal(request), parseContactId(request.params.inquiryId)))
      );
    })().catch(next);
  };
}

export function createUnblockInquiryHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateNotificationReadBody(request.body);
      sendObject(
        response,
        blockStateDto(await service.unblockInquiry(requirePrincipal(request), parseContactId(request.params.inquiryId)))
      );
    })().catch(next);
  };
}

export function createContactReportHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const report = await service.createContactReport(
        requirePrincipal(request),
        parseContactId(request.params.inquiryId),
        validateCreateContactReportBody(request.body)
      );
      sendObject(response, reportReceiptDto(report), 201);
    })().catch(next);
  };
}

export function createListContactReportsHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const page = await service.listContactReports(
        requirePrincipal(request),
        validateContactReportCollectionQuery(request.query)
      );
      sendPaginated(response, page.data.map(adminReportDto), page);
    })().catch(next);
  };
}

export function createGetContactReportHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      sendObject(
        response,
        adminReportDetailDto(
          await service.getContactReport(requirePrincipal(request), parseContactReportId(request.params.reportId))
        )
      );
    })().catch(next);
  };
}

export function createUpdateContactReportStatusHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      sendObject(
        response,
        adminReportDetailDto(
          await service.updateContactReportStatus(
            requirePrincipal(request),
            parseContactReportId(request.params.reportId),
            validateUpdateContactReportStatusBody(request.body)
          )
        )
      );
    })().catch(next);
  };
}

export function createUpdateInquiryStatusHandler(
  service: ContactService,
  realtimeHub: InquiryRealtimeHub
): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const { status } = validateStatusBody(request.body);
      const inquiryId = parseContactId(request.params.inquiryId);
      const inquiry = await service.updateStatus(requirePrincipal(request), inquiryId, status);
      realtimeHub.publish(
        Object.freeze({ type: "STATUS_CHANGED", inquiryId, status: inquiry.status, updatedAt: inquiry.updatedAt })
      );
      sendObject(response, inquiryDto(inquiry));
    })().catch(next);
  };
}

export function createStreamInquiryEventsHandler(
  service: ContactService,
  realtimeHub: InquiryRealtimeHub
): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const inquiryId = parseContactId(request.params.inquiryId);
      await service.authorizeRealtime(requirePrincipal(request), inquiryId);
      if (response.destroyed) return;

      response.status(200);
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();
      response.write(`retry: ${inquiryRealtimePolicy.reconnectDelayMs}\n\n`);
      writeRealtimeEvent(response, Object.freeze({ type: "CONNECTED", inquiryId }));

      let closed = false;
      const unsubscribe = realtimeHub.subscribe(inquiryId, (event) => {
        if (!closed && !response.destroyed) writeRealtimeEvent(response, event);
      });
      const heartbeat = setInterval(() => {
        if (!closed && !response.destroyed) response.write(": heartbeat\n\n");
      }, inquiryRealtimePolicy.heartbeatIntervalMs);
      heartbeat.unref();
      const lifetime = setTimeout(() => response.end(), inquiryRealtimePolicy.connectionLifetimeMs);
      lifetime.unref();

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        unsubscribe();
      };
      response.once("close", cleanup);
    })().catch(next);
  };
}

export function createListNotificationsHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const page = await service.listNotifications(
        requirePrincipal(request),
        validateContactCollectionQuery(request.query)
      );
      sendPaginated(response, page.data.map(notificationDto), page);
    })().catch(next);
  };
}

export function createGetUnreadNotificationCountHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateQueryKeys(request.query, []);
      sendObject(response, { unreadCount: await service.getUnreadNotificationCount(requirePrincipal(request)) });
    })().catch(next);
  };
}

export function createMarkNotificationReadHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateNotificationReadBody(request.body);
      await service.markNotificationRead(
        requirePrincipal(request),
        parseContactId(request.params.notificationId, "notificationId")
      );
      sendNoContent(response);
    })().catch(next);
  };
}

export function createMarkAllNotificationsReadHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      validateNotificationReadBody(request.body);
      await service.markAllNotificationsRead(requirePrincipal(request));
      sendNoContent(response);
    })().catch(next);
  };
}
