import type { RequestHandler, Router } from "express";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type Clock,
  type RateLimitStore
} from "../../../../shared/src/runtime/shared/middleware/rate-limit.js";
import {
  cancelRoommateRequestHandler,
  createRoommateRequestHandler,
  getRoommateProfileHandler,
  getRoommateRequestHandler,
  linkRoommateListingHandler,
  listMineRoommateRequestsHandler,
  listRoommateDiscoveryHandler,
  patchRoommateRequestHandler,
  renewRoommateRequestHandler,
  unlinkRoommateListingHandler,
  upsertRoommateProfileHandler
} from "./controllers/roommate-controller.js";
import {
  acceptRoommateInterestHandler,
  createRoommateInterestHandler,
  getCurrentRoommateConnectionHandler,
  getRoommateInterestHandler,
  leaveRoommateInterestHandler,
  listRoommateInterestsHandler,
  listRoommateRequestInterestsHandler,
  rejectRoommateInterestHandler,
  withdrawRoommateInterestHandler
} from "./controllers/roommate-interest-controller.js";
import type { RoommateService } from "./services/roommate-service.js";

export const roommateCreateRenewRateLimitPolicy = Object.freeze({
  scope: "roommate-create-renew",
  limit: 3,
  windowMs: 24 * 60 * 60 * 1_000
});

export const roommateInterestRateLimitPolicy = Object.freeze({
  scope: "roommate-interest-create",
  limit: 10,
  windowMs: 60 * 60 * 1_000
});

export function registerRoommateRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly tenantRoleMiddleware: RequestHandler;
    readonly service: RoommateService;
    readonly rateLimitStore?: RateLimitStore;
    readonly interestRateLimitStore?: RateLimitStore;
    readonly rateLimitClock?: Clock;
  }
): void {
  const guards = [dependencies.authenticationMiddleware, dependencies.tenantRoleMiddleware] as const;
  const rateLimitStore = dependencies.rateLimitStore ?? new InMemoryRateLimitStore();
  const createRenewRateLimiter = createRateLimitMiddleware({
    policy: roommateCreateRenewRateLimitPolicy,
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`,
    store: rateLimitStore,
    clock: dependencies.rateLimitClock
  });
  const interestRateLimiter = createRateLimitMiddleware({
    policy: roommateInterestRateLimitPolicy,
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`,
    store: dependencies.interestRateLimitStore ?? rateLimitStore,
    clock: dependencies.rateLimitClock
  });
  router.get("/roommate-profiles/me", ...guards, getRoommateProfileHandler(dependencies.service));
  router.put("/roommate-profiles/me", ...guards, upsertRoommateProfileHandler(dependencies.service));

  router.post(
    "/roommate-requests",
    ...guards,
    createRenewRateLimiter,
    createRoommateRequestHandler(dependencies.service)
  );
  router.get("/roommate-requests", ...guards, listRoommateDiscoveryHandler(dependencies.service));
  router.get("/roommate-requests/mine", ...guards, listMineRoommateRequestsHandler(dependencies.service));
  router.get("/roommate-requests/:requestId", ...guards, getRoommateRequestHandler(dependencies.service));
  router.patch("/roommate-requests/:requestId", ...guards, patchRoommateRequestHandler(dependencies.service));
  router.post("/roommate-requests/:requestId/cancel", ...guards, cancelRoommateRequestHandler(dependencies.service));
  router.post(
    "/roommate-requests/:requestId/renew",
    ...guards,
    createRenewRateLimiter,
    renewRoommateRequestHandler(dependencies.service)
  );
  router.put("/roommate-requests/:requestId/listing", ...guards, linkRoommateListingHandler(dependencies.service));
  router.delete("/roommate-requests/:requestId/listing", ...guards, unlinkRoommateListingHandler(dependencies.service));

  router.post(
    "/roommate-requests/:requestId/interests",
    ...guards,
    interestRateLimiter,
    createRoommateInterestHandler(dependencies.service)
  );
  router.get(
    "/roommate-requests/:requestId/interests",
    ...guards,
    listRoommateRequestInterestsHandler(dependencies.service)
  );
  router.get("/roommate-interests", ...guards, listRoommateInterestsHandler(dependencies.service));
  router.get("/roommate-interests/:interestId", ...guards, getRoommateInterestHandler(dependencies.service));
  router.post("/roommate-interests/:interestId/accept", ...guards, acceptRoommateInterestHandler(dependencies.service));
  router.post("/roommate-interests/:interestId/reject", ...guards, rejectRoommateInterestHandler(dependencies.service));
  router.post(
    "/roommate-interests/:interestId/withdraw",
    ...guards,
    withdrawRoommateInterestHandler(dependencies.service)
  );
  router.post("/roommate-interests/:interestId/leave", ...guards, leaveRoommateInterestHandler(dependencies.service));
  router.get("/roommate-connections/current", ...guards, getCurrentRoommateConnectionHandler(dependencies.service));
}
