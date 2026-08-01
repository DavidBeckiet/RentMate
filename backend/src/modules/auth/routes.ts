import type { Router } from "express";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type Clock,
  type RateLimitStore
} from "../../shared/middleware/rate-limit.js";
import { createRegistrationHandler, type RegistrationControllerDependencies } from "./registration-controller.js";

export const registrationRateLimitPolicy = Object.freeze({
  scope: "auth:registration",
  limit: 5,
  windowMs: 15 * 60 * 1000
});

export interface AuthRouteDependencies extends RegistrationControllerDependencies {
  readonly registrationRateLimitStore?: RateLimitStore;
  readonly registrationRateLimitClock?: Clock;
}

export function registerAuthRoutes(router: Router, dependencies: AuthRouteDependencies): void {
  const registrationRateLimiter = createRateLimitMiddleware({
    policy: registrationRateLimitPolicy,
    resolveKey: (request) => request.ip || "unknown-ip",
    store: dependencies.registrationRateLimitStore ?? new InMemoryRateLimitStore(),
    clock: dependencies.registrationRateLimitClock
  });

  router.post("/auth/register/tenant", registrationRateLimiter, createRegistrationHandler("TENANT", dependencies));
  router.post("/auth/register/landlord", registrationRateLimiter, createRegistrationHandler("LANDLORD", dependencies));
}
