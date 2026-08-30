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
import { createRoommateAiExplanationHandler } from "../roommate-ai/controllers/roommate-ai-controller.js";
import type { RoommateAiCompatibilityExplanationService } from "../roommate-ai/services/compatibility-explanation-service.js";
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
import {
  blockRoommateInterestHandler,
  blockRoommateRequestHandler,
  createRoommateInterestReportHandler,
  createRoommateMessageReportHandler,
  createRoommateRequestReportHandler,
  getRoommateAdminReportHandler,
  listOwnedRoommateBlocksHandler,
  listRoommateAdminReportsHandler,
  listRoommateMessagesHandler,
  markRoommateMessagesReadHandler,
  moderateRoommateMessageHandler,
  moderateRoommateProfileHandler,
  moderateRoommateRequestHandler,
  sendRoommateMessageHandler,
  unblockRoommateInterestHandler,
  unblockRoommateRequestHandler,
  updateRoommateAdminReportStatusHandler
} from "./controllers/roommate-safety-controller.js";
import type { RoommateService } from "./services/roommate-service.js";
import type { RoommateSafetyService } from "./services/roommate-safety-service.js";

export const roommateCreateRenewRateLimitPolicy = Object.freeze({
  scope: "roommate-create-renew",
  limit: 3,
  windowMs: 24 * 60 * 60 * 1_000
});

export const roommateRequestMutationRateLimitPolicy = Object.freeze({
  scope: "roommate-request-mutation",
  limit: 20,
  windowMs: 60 * 60 * 1_000
});

export const roommateInterestRateLimitPolicy = Object.freeze({
  scope: "roommate-interest-create",
  limit: 10,
  windowMs: 60 * 60 * 1_000
});

export const roommateMessageRateLimitPolicy = Object.freeze({
  scope: "roommate-message",
  limit: 30,
  windowMs: 60 * 1_000
});

export const roommateReportRateLimitPolicy = Object.freeze({
  scope: "roommate-report",
  limit: 5,
  windowMs: 60 * 60 * 1_000
});

export const roommateBlockRateLimitPolicy = Object.freeze({
  scope: "roommate-block",
  limit: 10,
  windowMs: 60 * 60 * 1_000
});
export const roommateAiExplanationShortRateLimitPolicy = Object.freeze({
  scope: "roommate-ai-explanation-short",
  limit: 5,
  windowMs: 15 * 60 * 1_000
});
export const roommateAiExplanationDailyRateLimitPolicy = Object.freeze({
  scope: "roommate-ai-explanation-daily",
  limit: 30,
  windowMs: 24 * 60 * 60 * 1_000
});

export function registerRoommateRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly tenantRoleMiddleware: RequestHandler;
    readonly service: RoommateService;
    readonly safetyService?: RoommateSafetyService;
    readonly aiExplanationService?: RoommateAiCompatibilityExplanationService;
    readonly adminRoleMiddleware?: RequestHandler;
    readonly rateLimitStore?: RateLimitStore;
    readonly interestRateLimitStore?: RateLimitStore;
    readonly messageRateLimitStore?: RateLimitStore;
    readonly reportRateLimitStore?: RateLimitStore;
    readonly blockRateLimitStore?: RateLimitStore;
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
  const requestMutationRateLimiter = createRateLimitMiddleware({
    policy: roommateRequestMutationRateLimitPolicy,
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
  const messageRateLimiter = createRateLimitMiddleware({
    policy: roommateMessageRateLimitPolicy,
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.params.interestId}:${request.ip}`,
    store: dependencies.messageRateLimitStore ?? rateLimitStore,
    clock: dependencies.rateLimitClock
  });
  const reportRateLimiter = createRateLimitMiddleware({
    policy: roommateReportRateLimitPolicy,
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`,
    store: dependencies.reportRateLimitStore ?? rateLimitStore,
    clock: dependencies.rateLimitClock
  });
  const blockRateLimiter = createRateLimitMiddleware({
    policy: roommateBlockRateLimitPolicy,
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`,
    store: dependencies.blockRateLimitStore ?? rateLimitStore,
    clock: dependencies.rateLimitClock
  });
  const explanationShortRateLimiter = createRateLimitMiddleware({
    policy: roommateAiExplanationShortRateLimitPolicy,
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`,
    store: rateLimitStore,
    clock: dependencies.rateLimitClock
  });
  const explanationDailyRateLimiter = createRateLimitMiddleware({
    policy: roommateAiExplanationDailyRateLimitPolicy,
    resolveKey: (request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`,
    store: rateLimitStore,
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
  if (dependencies.aiExplanationService) {
    router.post(
      "/roommate-requests/:requestId/ai-explanation",
      ...guards,
      explanationShortRateLimiter,
      explanationDailyRateLimiter,
      createRoommateAiExplanationHandler(dependencies.aiExplanationService)
    );
  }
  router.patch(
    "/roommate-requests/:requestId",
    ...guards,
    requestMutationRateLimiter,
    patchRoommateRequestHandler(dependencies.service)
  );
  router.post(
    "/roommate-requests/:requestId/cancel",
    ...guards,
    requestMutationRateLimiter,
    cancelRoommateRequestHandler(dependencies.service)
  );
  router.post(
    "/roommate-requests/:requestId/renew",
    ...guards,
    createRenewRateLimiter,
    renewRoommateRequestHandler(dependencies.service)
  );
  router.put(
    "/roommate-requests/:requestId/listing",
    ...guards,
    requestMutationRateLimiter,
    linkRoommateListingHandler(dependencies.service)
  );
  router.delete(
    "/roommate-requests/:requestId/listing",
    ...guards,
    requestMutationRateLimiter,
    unlinkRoommateListingHandler(dependencies.service)
  );

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

  if (dependencies.safetyService) {
    const safetyService = dependencies.safetyService;
    router.get("/roommate-blocks/mine", ...guards, listOwnedRoommateBlocksHandler(safetyService));
    router.get("/roommate-interests/:interestId/messages", ...guards, listRoommateMessagesHandler(safetyService));
    router.post(
      "/roommate-interests/:interestId/messages",
      ...guards,
      messageRateLimiter,
      sendRoommateMessageHandler(safetyService)
    );
    router.post("/roommate-interests/:interestId/read", ...guards, markRoommateMessagesReadHandler(safetyService));
    router.put(
      "/roommate-requests/:requestId/block",
      ...guards,
      blockRateLimiter,
      blockRoommateRequestHandler(safetyService)
    );
    router.delete(
      "/roommate-requests/:requestId/block",
      ...guards,
      blockRateLimiter,
      unblockRoommateRequestHandler(safetyService)
    );
    router.put(
      "/roommate-interests/:interestId/block",
      ...guards,
      blockRateLimiter,
      blockRoommateInterestHandler(safetyService)
    );
    router.delete(
      "/roommate-interests/:interestId/block",
      ...guards,
      blockRateLimiter,
      unblockRoommateInterestHandler(safetyService)
    );
    router.post(
      "/roommate-requests/:requestId/reports",
      ...guards,
      reportRateLimiter,
      createRoommateRequestReportHandler(safetyService)
    );
    router.post(
      "/roommate-interests/:interestId/reports",
      ...guards,
      reportRateLimiter,
      createRoommateInterestReportHandler(safetyService)
    );
    router.post(
      "/roommate-messages/:messageId/reports",
      ...guards,
      reportRateLimiter,
      createRoommateMessageReportHandler(safetyService)
    );

    if (dependencies.adminRoleMiddleware) {
      router.get(
        "/admin/contact-reports",
        dependencies.authenticationMiddleware,
        dependencies.adminRoleMiddleware,
        listRoommateAdminReportsHandler(safetyService)
      );
      router.get(
        "/admin/contact-reports/:reportId",
        dependencies.authenticationMiddleware,
        dependencies.adminRoleMiddleware,
        getRoommateAdminReportHandler(safetyService)
      );
      router.patch(
        "/admin/contact-reports/:reportId/status",
        dependencies.authenticationMiddleware,
        dependencies.adminRoleMiddleware,
        updateRoommateAdminReportStatusHandler(safetyService)
      );
      router.patch(
        "/admin/roommate-profiles/:tenantId/moderation",
        dependencies.authenticationMiddleware,
        dependencies.adminRoleMiddleware,
        moderateRoommateProfileHandler(safetyService)
      );
      router.patch(
        "/admin/roommate-requests/:requestId/moderation",
        dependencies.authenticationMiddleware,
        dependencies.adminRoleMiddleware,
        moderateRoommateRequestHandler(safetyService)
      );
      router.patch(
        "/admin/roommate-messages/:messageId/moderation",
        dependencies.authenticationMiddleware,
        dependencies.adminRoleMiddleware,
        moderateRoommateMessageHandler(safetyService)
      );
    }
  }
}
