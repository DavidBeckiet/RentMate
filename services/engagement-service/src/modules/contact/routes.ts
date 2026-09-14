import type { RequestHandler, Router } from "express";
import {
  createCreateInquiryHandler,
  createBlockInquiryHandler,
  createContactReportHandler,
  createGetContactReportHandler,
  createGetInquiryHandler,
  createGetUnreadNotificationCountHandler,
  createListContactReportsHandler,
  createListLandlordInquiriesHandler,
  createListNotificationsHandler,
  createListTenantInquiriesHandler,
  createMarkAllNotificationsReadHandler,
  createMarkNotificationReadHandler,
  createSendMessageHandler,
  createStreamInquiryEventsHandler,
  createStreamNotificationEventsHandler,
  createUnblockInquiryHandler,
  createUpdateContactReportStatusHandler,
  createUpdateInquiryStatusHandler
} from "./controllers/contact-controller.js";
import type { InquiryRealtimeHub } from "./realtime/inquiry-realtime-hub.js";
import type { NotificationRealtimeHub } from "./realtime/notification-realtime-hub.js";
import type { ContactService } from "./services/contact-service.js";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type Clock,
  type RateLimitStore
} from "../../../../shared/src/runtime/shared/middleware/rate-limit.js";

export interface ContactRouteDependencies {
  readonly authenticationMiddleware: RequestHandler;
  readonly tenantRoleMiddleware: RequestHandler;
  readonly landlordRoleMiddleware: RequestHandler;
  readonly adminRoleMiddleware: RequestHandler;
  readonly contactService: ContactService;
  readonly realtimeHub: InquiryRealtimeHub;
  readonly notificationRealtimeHub: NotificationRealtimeHub;
  readonly inquiryRateLimitStore?: RateLimitStore;
  readonly messageRateLimitStore?: RateLimitStore;
  readonly contactReportRateLimitStore?: RateLimitStore;
  readonly rateLimitClock?: Clock;
}

export function registerContactRoutes(router: Router, dependencies: ContactRouteDependencies): void {
  const inquiryRateLimiter = createRateLimitMiddleware({
    policy: { scope: "inquiry-create", limit: 5, windowMs: 60_000 },
    resolveKey: (request) =>
      `${request.auth?.userId ?? "unknown"}:${request.body?.listingId ?? "unknown"}:${request.ip}`,
    store: dependencies.inquiryRateLimitStore ?? new InMemoryRateLimitStore(),
    clock: dependencies.rateLimitClock
  });
  const messageRateLimiter = createRateLimitMiddleware({
    policy: { scope: "inquiry-message", limit: 30, windowMs: 60_000 },
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.params.inquiryId}:${request.ip}`,
    store: dependencies.messageRateLimitStore ?? new InMemoryRateLimitStore(),
    clock: dependencies.rateLimitClock
  });
  const contactReportRateLimiter = createRateLimitMiddleware({
    policy: { scope: "contact-report", limit: 5, windowMs: 60 * 60_000 },
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.params.inquiryId}:${request.ip}`,
    store: dependencies.contactReportRateLimitStore ?? new InMemoryRateLimitStore(),
    clock: dependencies.rateLimitClock
  });

  router.post(
    "/inquiries",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    inquiryRateLimiter,
    createCreateInquiryHandler(dependencies.contactService)
  );
  router.get(
    "/tenant/inquiries",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    createListTenantInquiriesHandler(dependencies.contactService)
  );
  router.post(
    "/inquiries/:inquiryId/block",
    dependencies.authenticationMiddleware,
    createBlockInquiryHandler(dependencies.contactService)
  );
  router.delete(
    "/inquiries/:inquiryId/block",
    dependencies.authenticationMiddleware,
    createUnblockInquiryHandler(dependencies.contactService)
  );
  router.post(
    "/inquiries/:inquiryId/reports",
    dependencies.authenticationMiddleware,
    contactReportRateLimiter,
    createContactReportHandler(dependencies.contactService)
  );
  router.get(
    "/landlord/inquiries",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createListLandlordInquiriesHandler(dependencies.contactService)
  );
  router.get(
    "/inquiries/:inquiryId",
    dependencies.authenticationMiddleware,
    createGetInquiryHandler(dependencies.contactService)
  );
  router.get(
    "/inquiries/:inquiryId/events",
    dependencies.authenticationMiddleware,
    createStreamInquiryEventsHandler(dependencies.contactService, dependencies.realtimeHub)
  );
  router.get(
    "/notifications/events",
    dependencies.authenticationMiddleware,
    createStreamNotificationEventsHandler(dependencies.notificationRealtimeHub)
  );
  router.post(
    "/inquiries/:inquiryId/messages",
    dependencies.authenticationMiddleware,
    messageRateLimiter,
    createSendMessageHandler(dependencies.contactService, dependencies.realtimeHub)
  );
  router.patch(
    "/inquiries/:inquiryId/status",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createUpdateInquiryStatusHandler(dependencies.contactService, dependencies.realtimeHub)
  );
  router.get(
    "/notifications",
    dependencies.authenticationMiddleware,
    createListNotificationsHandler(dependencies.contactService)
  );
  router.get(
    "/notifications/unread-count",
    dependencies.authenticationMiddleware,
    createGetUnreadNotificationCountHandler(dependencies.contactService)
  );
  router.patch(
    "/notifications/:notificationId/read",
    dependencies.authenticationMiddleware,
    createMarkNotificationReadHandler(dependencies.contactService)
  );
  router.post(
    "/notifications/read-all",
    dependencies.authenticationMiddleware,
    createMarkAllNotificationsReadHandler(dependencies.contactService)
  );
  router.get(
    "/admin/contact-reports",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createListContactReportsHandler(dependencies.contactService)
  );
  router.get(
    "/admin/contact-reports/:reportId",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createGetContactReportHandler(dependencies.contactService)
  );
  router.patch(
    "/admin/contact-reports/:reportId/status",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createUpdateContactReportStatusHandler(dependencies.contactService)
  );
}
