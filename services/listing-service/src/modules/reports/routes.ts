import type { RequestHandler, Router } from "express";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type RateLimitStore
} from "../../../../shared/src/runtime/shared/middleware/rate-limit.js";
import {
  createReportHandler,
  getReportHandler,
  listReportsHandler,
  updateReportStatusHandler
} from "./controllers/report-controller.js";
import type { ReportService } from "./services/report-service.js";

export function registerReportRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly tenantRoleMiddleware: RequestHandler;
    readonly adminRoleMiddleware: RequestHandler;
    readonly service: ReportService;
    readonly reportRateLimitStore?: RateLimitStore;
  }
): void {
  const limiter = createRateLimitMiddleware({
    policy: { scope: "listing-report", limit: 5, windowMs: 60 * 60 * 1_000 },
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.params.listingId}:${request.ip}`,
    store: dependencies.reportRateLimitStore ?? new InMemoryRateLimitStore()
  });
  router.post(
    "/listings/:listingId/reports",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    limiter,
    createReportHandler(dependencies.service)
  );
  router.get(
    "/admin/reports",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    listReportsHandler(dependencies.service)
  );
  router.get(
    "/admin/reports/:reportId",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    getReportHandler(dependencies.service)
  );
  router.patch(
    "/admin/reports/:reportId/status",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    updateReportStatusHandler(dependencies.service)
  );
}
