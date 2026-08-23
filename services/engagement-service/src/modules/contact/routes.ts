import type { RequestHandler, Router } from "express";
import {
  createCreateInquiryHandler,
  createGetInquiryHandler,
  createListLandlordInquiriesHandler,
  createListNotificationsHandler,
  createListTenantInquiriesHandler,
  createMarkAllNotificationsReadHandler,
  createMarkNotificationReadHandler,
  createSendMessageHandler,
  createUpdateInquiryStatusHandler
} from "./controllers/contact-controller.js";
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
  readonly contactService: ContactService;
  readonly inquiryRateLimitStore?: RateLimitStore;
  readonly messageRateLimitStore?: RateLimitStore;
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
  router.post(
    "/inquiries/:inquiryId/messages",
    dependencies.authenticationMiddleware,
    messageRateLimiter,
    createSendMessageHandler(dependencies.contactService)
  );
  router.patch(
    "/inquiries/:inquiryId/status",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createUpdateInquiryStatusHandler(dependencies.contactService)
  );
  router.get(
    "/notifications",
    dependencies.authenticationMiddleware,
    createListNotificationsHandler(dependencies.contactService)
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
}
