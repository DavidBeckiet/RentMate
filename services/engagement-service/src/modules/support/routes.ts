import type { RequestHandler, Router } from "express";
import {
  createCreateSupportRequestHandler,
  createGetAdminSupportRequestHandler,
  createListAdminSupportRequestsHandler,
  createUpdateAdminSupportRequestStatusHandler
} from "./controllers/support-controller.js";
import type { SupportService } from "./services/support-service.js";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type Clock,
  type RateLimitStore
} from "../../../../shared/src/runtime/shared/middleware/rate-limit.js";

export interface SupportRouteDependencies {
  readonly authenticationMiddleware: RequestHandler;
  readonly adminRoleMiddleware: RequestHandler;
  readonly service: SupportService;
  readonly createRateLimitStore?: RateLimitStore;
  readonly rateLimitClock?: Clock;
}

export function registerSupportRoutes(router: Router, dependencies: SupportRouteDependencies): void {
  const createLimiter = createRateLimitMiddleware({
    policy: { scope: "support-request-create", limit: 3, windowMs: 60 * 60_000 },
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`,
    store: dependencies.createRateLimitStore ?? new InMemoryRateLimitStore(),
    clock: dependencies.rateLimitClock
  });

  router.post(
    "/support-requests",
    dependencies.authenticationMiddleware,
    createLimiter,
    createCreateSupportRequestHandler(dependencies.service)
  );
  router.get(
    "/admin/support-requests",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createListAdminSupportRequestsHandler(dependencies.service)
  );
  router.get(
    "/admin/support-requests/:supportRequestId",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createGetAdminSupportRequestHandler(dependencies.service)
  );
  router.patch(
    "/admin/support-requests/:supportRequestId/status",
    dependencies.authenticationMiddleware,
    dependencies.adminRoleMiddleware,
    createUpdateAdminSupportRequestStatusHandler(dependencies.service)
  );
}
