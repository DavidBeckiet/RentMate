import type { Router } from "express";
import {
  createRateLimitMiddleware,
  InMemoryRateLimitStore,
  type Clock,
  type RateLimitStore
} from "../../../../shared/src/runtime/shared/middleware/rate-limit.js";
import { createLoginHandler, createLogoutHandler, type LoginControllerDependencies } from "./controllers/login-controller.js";
import { createRegistrationHandler, type RegistrationControllerDependencies } from "./controllers/registration-controller.js";

export const registrationRateLimitPolicy = Object.freeze({
  scope: "auth:registration",
  limit: 5,
  windowMs: 15 * 60 * 1000
});

export const loginRateLimitPolicy = Object.freeze({
  scope: "auth:login",
  limit: 5,
  windowMs: 15 * 60 * 1000
});

export interface AuthRouteDependencies extends RegistrationControllerDependencies, LoginControllerDependencies {
  readonly registrationRateLimitStore?: RateLimitStore;
  readonly registrationRateLimitClock?: Clock;
  readonly loginRateLimitStore?: RateLimitStore;
  readonly loginRateLimitClock?: Clock;
}

export function registerAuthRoutes(router: Router, dependencies: AuthRouteDependencies): void {
  const sharedRateLimitStore = dependencies.registrationRateLimitStore ?? new InMemoryRateLimitStore();
  const registrationRateLimiter = createRateLimitMiddleware({
    policy: registrationRateLimitPolicy,
    resolveKey: (request) => request.ip || "unknown-ip",
    store: sharedRateLimitStore,
    clock: dependencies.registrationRateLimitClock
  });
  const loginRateLimiter = createRateLimitMiddleware({
    policy: loginRateLimitPolicy,
    resolveKey: (request) => request.ip || "unknown-ip",
    store: dependencies.loginRateLimitStore ?? sharedRateLimitStore,
    clock: dependencies.loginRateLimitClock
  });

  router.post("/auth/register/tenant", registrationRateLimiter, createRegistrationHandler("TENANT", dependencies));
  router.post("/auth/register/landlord", registrationRateLimiter, createRegistrationHandler("LANDLORD", dependencies));
  router.post("/auth/login", loginRateLimiter, createLoginHandler(dependencies));
  router.post("/auth/logout", createLogoutHandler(dependencies));
}
