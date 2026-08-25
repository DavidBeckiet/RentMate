import type { RequestHandler, Router } from "express";
import {
  createConfirmEmailVerificationHandler,
  createConfirmPhoneVerificationHandler,
  createGetContactVerificationStatusHandler,
  createRequestEmailVerificationHandler,
  createRequestPhoneVerificationHandler
} from "./controllers/contact-verification-controller.js";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type RateLimitStore
} from "../../../../shared/src/runtime/shared/middleware/rate-limit.js";
import {
  createGetCurrentVerificationHandler,
  createGetVerificationHandler,
  createListVerificationsHandler,
  createReviewVerificationHandler,
  createSubmitVerificationHandler
} from "./controllers/verification-controller.js";
import type { VerificationService } from "./services/verification-service.js";
import type { ContactVerificationService } from "./services/contact-verification-service.js";

export function registerVerificationRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly landlordRoleMiddleware: RequestHandler;
    readonly adminRoleMiddleware: RequestHandler;
    readonly service: VerificationService;
    readonly submissionRateLimitStore?: RateLimitStore;
    readonly contactVerificationService: ContactVerificationService;
    readonly contactVerificationRateLimitStore?: RateLimitStore;
  }
): void {
  const limiter = createRateLimitMiddleware({
    policy: { scope: "landlord-verification", limit: 3, windowMs: 24 * 60 * 60 * 1_000 },
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`,
    store: dependencies.submissionRateLimitStore ?? new InMemoryRateLimitStore()
  });
  const contactLimiter = createRateLimitMiddleware({
    policy: { scope: "contact-verification", limit: 5, windowMs: 15 * 60 * 1_000 },
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`,
    store: dependencies.contactVerificationRateLimitStore ?? new InMemoryRateLimitStore()
  });
  router.post(
    "/landlord/verifications",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    limiter,
    createSubmitVerificationHandler(dependencies.service)
  );
  router.get(
    "/landlord/verifications/current",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createGetCurrentVerificationHandler(dependencies.service)
  );
  router.get(
    "/landlord/verifications/status",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    createGetContactVerificationStatusHandler(dependencies.contactVerificationService)
  );
  router.post(
    "/landlord/verifications/email/request",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    contactLimiter,
    createRequestEmailVerificationHandler(dependencies.contactVerificationService)
  );
  router.post(
    "/landlord/verifications/email/confirm",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    contactLimiter,
    createConfirmEmailVerificationHandler(dependencies.contactVerificationService)
  );
  router.post(
    "/landlord/verifications/phone/request",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    contactLimiter,
    createRequestPhoneVerificationHandler(dependencies.contactVerificationService)
  );
  router.post(
    "/landlord/verifications/phone/confirm",
    dependencies.authenticationMiddleware,
    dependencies.landlordRoleMiddleware,
    contactLimiter,
    createConfirmPhoneVerificationHandler(dependencies.contactVerificationService)
  );
  router.get(
    "/admin/verifications",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createListVerificationsHandler(dependencies.service)
  );
  router.get(
    "/admin/verifications/:verificationId",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createGetVerificationHandler(dependencies.service)
  );
  router.patch(
    "/admin/verifications/:verificationId/status",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createReviewVerificationHandler(dependencies.service)
  );
}
