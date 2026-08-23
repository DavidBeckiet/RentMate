import type { RequestHandler, Router } from "express";
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

export function registerVerificationRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly landlordRoleMiddleware: RequestHandler;
    readonly adminRoleMiddleware: RequestHandler;
    readonly service: VerificationService;
    readonly submissionRateLimitStore?: RateLimitStore;
  }
): void {
  const limiter = createRateLimitMiddleware({
    policy: { scope: "landlord-verification", limit: 3, windowMs: 24 * 60 * 60 * 1_000 },
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`,
    store: dependencies.submissionRateLimitStore ?? new InMemoryRateLimitStore()
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
