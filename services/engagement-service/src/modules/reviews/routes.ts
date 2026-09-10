import type { RequestHandler, Router } from "express";
import {
  createCreateReviewHandler,
  createCreateReviewReportHandler,
  createGetAdminReviewHandler,
  createGetAdminReviewReportHandler,
  createGetReviewEligibilityHandler,
  createListAdminReviewReportsHandler,
  createListAdminReviewsHandler,
  createModerateReviewReportHandler,
  createListPublicReviewsHandler,
  createModerateReviewHandler
} from "./controllers/review-controller.js";
import type { ReviewService } from "./services/review-service.js";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type Clock,
  type RateLimitStore
} from "../../../../shared/src/runtime/shared/middleware/rate-limit.js";

export interface ReviewRouteDependencies {
  readonly authenticationMiddleware: RequestHandler;
  readonly optionalAuthenticationMiddleware: RequestHandler;
  readonly tenantRoleMiddleware: RequestHandler;
  readonly adminRoleMiddleware: RequestHandler;
  readonly service: ReviewService;
  readonly createRateLimitStore?: RateLimitStore;
  readonly rateLimitClock?: Clock;
}

export function registerReviewRoutes(router: Router, dependencies: ReviewRouteDependencies): void {
  const createLimiter = createRateLimitMiddleware({
    policy: { scope: "review-create", limit: 3, windowMs: 86_400_000 },
    resolveKey: (request) =>
      `${request.auth?.userId ?? "unknown"}:${request.params.inquiryId ?? "unknown"}:${request.ip}`,
    store: dependencies.createRateLimitStore ?? new InMemoryRateLimitStore(),
    clock: dependencies.rateLimitClock
  });

  router.get(
    "/inquiries/:inquiryId/review",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    createGetReviewEligibilityHandler(dependencies.service)
  );
  router.post(
    "/inquiries/:inquiryId/review",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    createLimiter,
    createCreateReviewHandler(dependencies.service)
  );
  router.post(
    "/reviews/:reviewId/reports",
    dependencies.authenticationMiddleware,
    createRateLimitMiddleware({
      policy: { scope: "review-report-create", limit: 5, windowMs: 86_400_000 },
      resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.params.reviewId}:${request.ip}`,
      store: dependencies.createRateLimitStore ?? new InMemoryRateLimitStore(),
      clock: dependencies.rateLimitClock
    }),
    createCreateReviewReportHandler(dependencies.service)
  );
  router.get(
    "/listings/:listingId/reviews",
    dependencies.optionalAuthenticationMiddleware,
    createListPublicReviewsHandler(dependencies.service)
  );
  router.get(
    "/admin/reviews",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createListAdminReviewsHandler(dependencies.service)
  );
  router.get(
    "/admin/reviews/:reviewId",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createGetAdminReviewHandler(dependencies.service)
  );
  router.patch(
    "/admin/reviews/:reviewId/status",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createModerateReviewHandler(dependencies.service)
  );
  router.get(
    "/admin/review-reports",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createListAdminReviewReportsHandler(dependencies.service)
  );
  router.get(
    "/admin/review-reports/:reportId",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createGetAdminReviewReportHandler(dependencies.service)
  );
  router.patch(
    "/admin/review-reports/:reportId/status",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createModerateReviewReportHandler(dependencies.service)
  );
}
