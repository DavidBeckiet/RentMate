import type { Request, RequestHandler, Router } from "express";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type Clock,
  type RateLimitStore
} from "../../../../shared/src/runtime/shared/middleware/rate-limit.js";
import {
  createRoommateAiPreferencePreviewHandler,
  getRoommateAiCapabilitiesHandler
} from "./controllers/roommate-ai-controller.js";
import type { RoommateAiCapabilityService } from "./services/roommate-ai-capability-service.js";
import type { RoommateAiPreferencePreviewService } from "./services/preference-preview-service.js";

export const roommateAiParserShortRateLimitPolicy = Object.freeze({
  scope: "roommate-ai-parser-short",
  limit: 5,
  windowMs: 15 * 60 * 1_000
});

export const roommateAiParserDailyRateLimitPolicy = Object.freeze({
  scope: "roommate-ai-parser-daily",
  limit: 30,
  windowMs: 24 * 60 * 60 * 1_000
});

export function registerRoommateAiRoutes(
  router: Router,
  dependencies: {
    readonly authenticationMiddleware: RequestHandler;
    readonly tenantRoleMiddleware: RequestHandler;
    readonly capabilityService: RoommateAiCapabilityService;
    readonly preferencePreviewService: RoommateAiPreferencePreviewService;
    readonly rateLimitStore?: RateLimitStore;
    readonly rateLimitClock?: Clock;
  }
): void {
  const rateLimitStore = dependencies.rateLimitStore ?? new InMemoryRateLimitStore();
  const resolveRateLimitKey = (request: Request) => `${request.auth?.userId ?? "unknown"}:${request.ip}`;
  const parserShortRateLimiter = createRateLimitMiddleware({
    policy: roommateAiParserShortRateLimitPolicy,
    resolveKey: resolveRateLimitKey,
    store: rateLimitStore,
    clock: dependencies.rateLimitClock
  });
  const parserDailyRateLimiter = createRateLimitMiddleware({
    policy: roommateAiParserDailyRateLimitPolicy,
    resolveKey: resolveRateLimitKey,
    store: rateLimitStore,
    clock: dependencies.rateLimitClock
  });
  router.get(
    "/roommate-ai/capabilities",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    getRoommateAiCapabilitiesHandler(dependencies.capabilityService)
  );
  router.post(
    "/roommate-ai/preference-previews",
    dependencies.authenticationMiddleware,
    dependencies.tenantRoleMiddleware,
    parserShortRateLimiter,
    parserDailyRateLimiter,
    createRoommateAiPreferencePreviewHandler(dependencies.preferencePreviewService)
  );
}
