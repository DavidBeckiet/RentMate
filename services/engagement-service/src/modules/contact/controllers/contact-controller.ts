import type { Request, RequestHandler } from "express";
import { ApplicationError } from "../../../../../shared/src/runtime/shared/errors/application-error.js";
import { authenticationRequiredMessage } from "../../../../../shared/src/runtime/shared/middleware/authentication.js";
import { sendNoContent, sendObject, sendPaginated } from "../../../../../shared/src/runtime/shared/http/responses.js";
import type { Inquiry, InquiryMessage, Notification } from "../repositories/contact-repository.js";
import type { ContactService } from "../services/contact-service.js";
import {
  parseContactId,
  validateContactCollectionQuery,
  validateCreateInquiryBody,
  validateMessageBody,
  validateNotificationReadBody,
  validateStatusBody
} from "../validations/contact-validation.js";

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

function inquiryDto(inquiry: Inquiry) {
  return {
    id: inquiry.id,
    listingId: inquiry.listingId,
    status: inquiry.status,
    contactPhone: inquiry.contactPhone,
    preferredContactAt: inquiry.preferredContactAt,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
    messages: inquiry.messages.map(messageDto)
  };
}

function notificationDto(notification: Notification) {
  return {
    id: notification.id,
    eventType: notification.eventType,
    inquiryId: notification.inquiryId,
    resourcePath: notification.resourcePath,
    isRead: notification.isRead,
    createdAt: notification.createdAt
  };
}

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

export function createSendMessageHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const { body } = validateMessageBody(request.body);
      sendObject(
        response,
        messageDto(
          await service.sendMessage(requirePrincipal(request), parseContactId(request.params.inquiryId), body)
        ),
        201
      );
    })().catch(next);
  };
}

export function createUpdateInquiryStatusHandler(service: ContactService): RequestHandler {
  return (request, response, next) => {
    void (async () => {
      const { status } = validateStatusBody(request.body);
      sendObject(
        response,
        inquiryDto(
          await service.updateStatus(requirePrincipal(request), parseContactId(request.params.inquiryId), status)
        )
      );
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
